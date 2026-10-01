#!/usr/bin/env node
/**
 * Render one 1000x1500 Pinterest / Open Graph image per SEO landing page.
 *
 * These are the images the 16 landing pages point their og:image at, so each pin
 * is its own page's word instead of the shared og.png. They reuse the site's own
 * brush renderer (app.js) — same paper, ink, dry-brush and seal code as batch1 —
 * at pin size, with no free-preview watermark, plus a small "mymoying.com" mark.
 *
 *   cd tools/make-pins && npm install
 *   node tools/make-pins/make-og-pins.mjs
 *
 * Output: PNG files in /pins/, named after the landing page slug.
 * Requires Microsoft Edge or Google Chrome (EDGE_PATH / CHROME_PATH override).
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const PIN_W = 1000;
const PIN_H = 1500;
const SLIDER_MAX = 260;

// Site defaults: Regular brush, horizontal, rice paper, black ink, seal, dry 22.
const LOOK = {
  style: "kai",
  dir: "h",
  paper: "xuan",
  ink: "black",
  track: 38,
  dry: 22,
  seal: true,
};

// group: pins in the same group share one letter size, so a board of pins looks
// like one set. Names and phrases are measured separately (a phrase is far longer
// than a name, and sharing across the two would shrink every name).
const PINS = [
  { slug: "emma", text: "Emma", group: "names" },
  { slug: "michael", text: "Michael", group: "names" },
  { slug: "sophia", text: "Sophia", group: "names" },
  { slug: "james", text: "James", group: "names" },
  { slug: "grace", text: "Grace", group: "names" },
  { slug: "lily", text: "Lily", group: "names" },
  { slug: "ethan", text: "Ethan", group: "names" },
  { slug: "olivia", text: "Olivia", group: "names" },
  { slug: "love", text: "Love", group: "names" },
  { slug: "peace", text: "Peace", group: "names" },
  { slug: "hope", text: "Hope", group: "names" },
  { slug: "dream", text: "Dream", group: "names" },
  { slug: "name-in-chinese-calligraphy", text: "Your Name", group: "guides" },
  { slug: "chinese-calligraphy-tattoo-ideas", text: "Tattoo Ideas", group: "guides" },
  { slug: "meaning-of-chinese-characters", text: "Meaning", group: "guides" },
  { slug: "custom-chinese-name-gift", text: "A Gift", group: "guides" },
];

/**
 * Load app.js and swap in pin-sized drawing plus the pin mark.
 *
 * Nothing on disk is touched: app.js is patched in memory only, and every
 * replacement is counted so the script fails loudly if app.js is refactored
 * instead of silently drawing something different.
 */
function buildRuntime() {
  let src = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const replacements = [
    ["const BASE_W = 900;", `const BASE_W = ${PIN_W};`],
    ["const BASE_H = 1200;", `const BASE_H = ${PIN_H};`],
    [
      "cutInkWatermark(layer, target, transparent);",
      "if (!opts.pin) cutInkWatermark(layer, target, transparent);",
    ],
    [
      'drawPreviewMark(ctx, BASE_W, BASE_H, snap.paper === "night");',
      'if (opts.pin) drawPinMark(ctx, BASE_W, BASE_H, snap.paper === "night");\n      else drawPreviewMark(ctx, BASE_W, BASE_H, snap.paper === "night");',
    ],
  ];
  for (const [from, to] of replacements) {
    const count = src.split(from).length - 1;
    if (count !== 1) throw new Error(`Expected 1 occurrence of [${from}], found ${count}. app.js changed.`);
    src = src.replace(from, to);
  }
  const marker = "  const q = new URLSearchParams(location.search);";
  const at = src.indexOf(marker);
  if (at < 0) throw new Error("Could not find the app.js startup. app.js changed.");
  const head = src.slice(0, at);
  const tail = `
  function drawPinMark(ctx, w, h, night) {
    const label = "mymoying.com";
    ctx.save();
    ctx.globalAlpha = night ? 0.62 : 0.5;
    ctx.fillStyle = night ? "#f3ead6" : "#5c4636";
    ctx.font = "500 20px serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0.28em";
    ctx.fillText(label, w * 0.94, h * 0.952);
    ctx.restore();
  }

  function pinSnap(raw) {
    return {
      text: String(raw.text || ""),
      unsupported: false,
      changed: false,
      style: raw.style || ${JSON.stringify(LOOK.style)},
      dir: raw.dir || ${JSON.stringify(LOOK.dir)},
      paper: raw.paper || ${JSON.stringify(LOOK.paper)},
      ink: raw.ink || ${JSON.stringify(LOOK.ink)},
      fmt: "png",
      size: Number(raw.size ?? 196),
      track: Number(raw.track ?? ${LOOK.track}),
      dry: Number(raw.dry ?? ${LOOK.dry}),
      seal: raw.seal !== false,
    };
  }

  async function measureFit(raw) {
    const snap = pinSnap(raw);
    const font = await loadFont(snap.style);
    const filtered = filterGlyphs(font, snap.text);
    if (!filtered.text) throw new Error("nothing to draw for " + snap.text);
    if (filtered.dropped) throw new Error("font is missing a glyph in " + snap.text);
    const layout = snap.dir === "v"
      ? layoutVertical(font, { ...snap, text: filtered.text })
      : layoutHorizontal(font, { ...snap, text: filtered.text });
    return { size: layout.size, text: filtered.text };
  }

  async function renderPin(raw) {
    const snap = pinSnap(raw);
    const [font, sealFont] = await Promise.all([
      loadFont(snap.style),
      loadFont("seal").catch(() => null),
    ]);
    const filtered = filterGlyphs(font, snap.text);
    if (!filtered.text) throw new Error("nothing to draw for " + snap.text);
    const target = document.getElementById("stage");
    target.width = BASE_W;
    target.height = BASE_H;
    paintScene(target, { ...snap, text: filtered.text }, font, sealFont, { pin: true });
    return { dataUrl: target.toDataURL("image/png"), width: target.width, height: target.height };
  }

  // Proof the pin is a real drawing and not an empty sheet: the paper is a light
  // gradient, the ink is near-black, so a rendered pin has both dark ink pixels
  // and a wide spread of luminance. A blank canvas would be flat and ink-free.
  function pinStats(sampleStep) {
    const c = document.getElementById("stage");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const step = Math.max(1, sampleStep || 1);
    let n = 0, dark = 0, light = 0, sum = 0, sum2 = 0;
    for (let y = 0; y < c.height; y += step) {
      for (let x = 0; x < c.width; x += step) {
        const i = (y * c.width + x) * 4;
        const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        n += 1;
        if (lum < 90) dark += 1;
        if (lum > 215) light += 1;
        sum += lum;
        sum2 += lum * lum;
      }
    }
    const mean = sum / n;
    const sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    return { sampled: n, darkRatio: dark / n, lightRatio: light / n, mean, sd, width: c.width, height: c.height };
  }

  window.measureFit = measureFit;
  window.renderPin = renderPin;
  window.pinStats = pinStats;
})();
`;
  return head + tail;
}

const HARNESS = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <base href="/" />
  <title>Moying pin renderer</title>
</head>
<body>
  <canvas id="stage" width="${PIN_W}" height="${PIN_H}"></canvas>
  <input id="textInput" value="" />
  <input id="size" type="range" min="90" max="260" value="196" />
  <input id="track" type="range" min="0" max="80" value="38" />
  <input id="dry" type="range" min="0" max="80" value="22" />
  <input id="sealOn" type="checkbox" checked />
  <div id="loading"></div>
  <span id="charCount"></span>
  <p id="charHint" hidden></p>
  <p id="limitHint" hidden></p>
  <button id="btnExport" type="button"></button>
  <button id="btnPay" type="button"></button>
  <script src="/vendor/opentype.min.js"></script>
  <script src="/pin-runtime.js"></script>
</body>
</html>
`;

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".ttf") return "font/ttf";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".csv") return "text/csv; charset=utf-8";
  return "application/octet-stream";
}

function startServer(runtimeJs) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname === "/pin-harness.html") {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(HARNESS);
      return;
    }
    if (url.pathname === "/pin-runtime.js") {
      res.setHeader("content-type", "text/javascript; charset=utf-8");
      res.end(runtimeJs);
      return;
    }
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const file = path.resolve(ROOT, rel);
    if (file !== ROOT && !file.startsWith(`${ROOT}${path.sep}`)) {
      res.statusCode = 403;
      res.end("forbidden");
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.statusCode = err.code === "ENOENT" ? 404 : 500;
        res.end(err.code || "error");
        return;
      }
      res.setHeader("content-type", contentType(file));
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

// PNG header: 8-byte signature, then an IHDR chunk whose first two fields are
// width and height. Read straight from the bytes we are about to write.
function pngSize(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error("not a png");
  if (buf.toString("ascii", 12, 16) !== "IHDR") throw new Error("no IHDR");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function browserPath() {
  if (process.env.EDGE_PATH) return process.env.EDGE_PATH;
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error("No Edge/Chrome found. Set EDGE_PATH.");
  return found;
}

async function contactSheet(page, rows, port) {
  const cols = 4;
  const thumbW = 500;
  const thumbH = 750;
  const cap = 40;
  const gap = 22;
  const pad = 28;
  return page.evaluate(async (spec) => {
    const { rows, cols, thumbW, thumbH, cap, gap, pad, port } = spec;
    const sheetW = pad * 2 + cols * thumbW + (cols - 1) * gap;
    const rowCount = Math.ceil(rows.length / cols);
    const sheetH = pad * 2 + rowCount * (thumbH + cap) + (rowCount - 1) * gap;
    const canvas = document.createElement("canvas");
    canvas.width = sheetW;
    canvas.height = sheetH;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#2a231c";
    ctx.fillRect(0, 0, sheetW, sheetH);
    for (let i = 0; i < rows.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = pad + col * (thumbW + gap);
      const y = pad + row * (thumbH + cap + gap);
      const img = new Image();
      img.src = `http://127.0.0.1:${port}/pins/${rows[i].file}?v=${Date.now()}`;
      await img.decode();
      ctx.drawImage(img, x, y, thumbW, thumbH);
      ctx.fillStyle = "#f3ead6";
      ctx.font = "28px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(rows[i].label, x + thumbW / 2, y + thumbH + cap / 2 + 4);
    }
    return canvas.toDataURL("image/jpeg", 0.86);
  }, { rows, cols, thumbW, thumbH, cap, gap, pad, port });
}

async function main() {
  const rows = PINS.map((pin) => ({ ...pin, file: `${pin.slug}.png` }));
  const outDir = path.join(ROOT, "pins");
  fs.mkdirSync(outDir, { recursive: true });

  const { server, port } = await startServer(buildRuntime());
  const browser = await puppeteer.launch({
    executablePath: browserPath(),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    page.on("pageerror", (err) => console.error("pageerror", err));
    await page.goto(`http://127.0.0.1:${port}/pin-harness.html`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => typeof window.renderPin === "function" && typeof window.measureFit === "function");

    // One letter size per group: measure every word at the largest slider the
    // site offers, then give the whole group the smallest that still fits.
    const sliderFor = {};
    for (const group of [...new Set(rows.map((r) => r.group))]) {
      const measured = [];
      for (const row of rows.filter((r) => r.group === group)) {
        const fit = await page.evaluate((text) => window.measureFit({ text, size: 260 }), row.text);
        if (fit.text !== row.text) throw new Error(`${row.slug}: expected "${row.text}", font gave "${fit.text}"`);
        measured.push({ slug: row.slug, size: fit.size });
      }
      const shared = Math.min(...measured.map((m) => m.size));
      // kai base size is slider * 1.06. Back into a slider the site actually offers.
      const slider = Math.max(90, Math.min(SLIDER_MAX, Math.round(shared / 1.06)));
      sliderFor[group] = slider;
      console.log(`[${group}] shared ${shared.toFixed(1)}px -> size slider ${slider}`);
      console.log(`  ${measured.map((m) => `${m.slug}:${m.size.toFixed(1)}`).join(" ")}`);
    }

    const results = [];
    for (const row of rows) {
      const rendered = await page.evaluate(async (job) => {
        const out = await window.renderPin(job);
        return { ...out, stats: window.pinStats(2) };
      }, { text: row.text, size: sliderFor[row.group] });

      const buf = Buffer.from(rendered.dataUrl.split(",")[1], "base64");
      const dims = pngSize(buf);
      if (dims.width !== PIN_W || dims.height !== PIN_H) {
        throw new Error(`${row.file} is ${dims.width}x${dims.height}, expected ${PIN_W}x${PIN_H}`);
      }
      if (rendered.stats.width !== PIN_W || rendered.stats.height !== PIN_H) {
        throw new Error(`${row.file} canvas is ${rendered.stats.width}x${rendered.stats.height}`);
      }
      // Blank-sheet guards. Measured pins land near 1% dark and sd ~40; the
      // thresholds are far below that but far above an empty canvas.
      if (rendered.stats.darkRatio < 0.002) {
        throw new Error(`${row.file} has almost no ink (${(rendered.stats.darkRatio * 100).toFixed(2)}% dark) - blank sheet?`);
      }
      if (rendered.stats.sd < 8) {
        throw new Error(`${row.file} is a flat image (sd ${rendered.stats.sd.toFixed(1)}) - blank sheet?`);
      }
      fs.writeFileSync(path.join(outDir, row.file), buf);
      results.push({ ...row, bytes: buf.length, ...rendered.stats });
      console.log(
        `${row.file} ${dims.width}x${dims.height} ${(buf.length / 1024).toFixed(0)}KB ` +
        `ink ${(rendered.stats.darkRatio * 100).toFixed(2)}% paper ${(rendered.stats.lightRatio * 100).toFixed(1)}% ` +
        `mean ${rendered.stats.mean.toFixed(1)} sd ${rendered.stats.sd.toFixed(1)}`
      );
    }

    if (process.argv.includes("--contact")) {
      const sheetPath = process.argv[process.argv.indexOf("--contact") + 1];
      const sheetUrl = await contactSheet(page, results.map((r) => ({ ...r, label: r.text })), port);
      const sheet = Buffer.from(sheetUrl.split(",")[1], "base64");
      fs.mkdirSync(path.dirname(sheetPath), { recursive: true });
      fs.writeFileSync(sheetPath, sheet);
      console.log(`contact sheet ${sheetPath} ${(sheet.length / 1024).toFixed(0)}KB`);
    }

    const total = results.reduce((s, r) => s + r.bytes, 0);
    console.log(`\n${results.length} pins, ${(total / 1024 / 1024).toFixed(2)}MB total`);
    console.log(`largest ${(Math.max(...results.map((r) => r.bytes)) / 1024).toFixed(0)}KB, smallest ${(Math.min(...results.map((r) => r.bytes)) / 1024).toFixed(0)}KB`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
