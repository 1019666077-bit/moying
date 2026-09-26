#!/usr/bin/env node
/**
 * Render a Pinterest pin batch with the site's own brush renderer (app.js).
 *
 * The script loads app.js in headless Chrome, draws at pin size with the same
 * paper, ink, dry-brush, and seal code, and skips the free-preview watermark.
 * A small "mymoying.com" mark is painted at the bottom instead.
 *
 *   cd tools/make-pins && npm install
 *   node tools/make-pins/make-pins.mjs
 *
 * Requires Google Chrome or Chromium (CHROME_PATH overrides the binary).
 * Edit BATCH below to make another batch. Images land in /pins/.
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
const MAX_BYTES = 1024 * 1024;

// Site defaults: Regular brush, horizontal, rice paper, black ink, seal, dry 22.
// Size is chosen at runtime so the longest name fills the sheet and every
// name in the batch shares that same letter size (the site only scales down).
const LOOK = {
  style: "kai",
  dir: "h",
  paper: "xuan",
  ink: "black",
  track: 38,
  dry: 22,
  seal: true,
};

const BATCH = {
  id: "batch1",
  board: "English Names in Chinese Calligraphy",
  // Two pins a day, 9:00 and 20:00 America/New_York. September 2026 is EDT (UTC-4).
  // Pinterest wants the publish time in UTC as YYYY-MM-DDTHH:MM:SS.
  start: { year: 2026, month: 9, day: 27 },
  hoursEastern: [9, 20],
  names: [
    {
      name: "Emma",
      title: "Emma in Chinese Brush Calligraphy",
      description:
        "The name Emma, drawn in Chinese brush-calligraphy style on rice paper. A quiet reference for an Emma name tattoo, a small print, or a gift with that name on it. Moying previews English names in this brush style for free.",
      keywords: "Emma name art, Chinese calligraphy, name tattoo idea, brush lettering, personalized gift",
    },
    {
      name: "Liam",
      title: "Liam Name in Chinese Calligraphy",
      description:
        "Liam rendered as Chinese brush lettering on warm rice paper. People keep this kind of piece as tattoo inspiration or as a simple personalized gift. Type a short English name on Moying to see it in the same ink.",
      keywords: "Liam name art, Chinese calligraphy, name tattoo idea, brush lettering, wall art",
    },
    {
      name: "Olivia",
      title: "Olivia in Chinese Brush Lettering",
      description:
        "Olivia in Chinese brush-calligraphy style, centered on rice paper with a small red seal. It reads as a name-tattoo sketch or as quiet wall art. Preview a name free on Moying before you take a clean download.",
      keywords: "Olivia name art, Chinese calligraphy, name tattoo idea, personalized gift, brush lettering",
    },
    {
      name: "Noah",
      title: "Noah Written in Chinese Calligraphy",
      description:
        "Noah, lettered with a Chinese brush on rice paper. A plain name-art idea for a tattoo, a card, or a gift. Moying turns short English names and words into this ink-on-paper look.",
      keywords: "Noah name art, Chinese calligraphy, name tattoo idea, brush lettering, personalized gift",
    },
    {
      name: "Ava",
      title: "Ava in Chinese Calligraphy Ink",
      description:
        "A short name leaves room on the page. Ava is drawn in Chinese brush calligraphy on plain rice paper, the sort of mark people look up for a name tattoo or a small printed gift.",
      keywords: "Ava name art, Chinese calligraphy, name tattoo idea, brush lettering, wall art",
    },
    {
      name: "Oliver",
      title: "Oliver in Chinese Brush Calligraphy",
      description:
        "Oliver in black ink, Chinese brush style, on rice paper. Use it as a reference for a name tattoo or as a personalized gift. Your own word can be previewed the same way at Moying.",
      keywords: "Oliver name art, Chinese calligraphy, name tattoo idea, personalized gift, brush lettering",
    },
    {
      name: "Sophia",
      title: "Sophia Chinese Calligraphy Name Art",
      description:
        "Sophia written in Chinese brush calligraphy on rice paper. An uncluttered pin for anyone collecting Sophia tattoo ideas or looking for a personalized name print.",
      keywords: "Sophia name art, Chinese calligraphy, name tattoo idea, brush lettering, personalized gift",
    },
    {
      name: "James",
      title: "James in Chinese Brush Calligraphy",
      description:
        "James, set in Chinese brush calligraphy on rice paper with a red seal. A simple name-tattoo idea and an easy personalized gift. The free Moying preview is watermarked; a clean high-resolution file is a separate one-time purchase.",
      keywords: "James name art, Chinese calligraphy, name tattoo idea, brush lettering, wall art",
    },
    {
      name: "Mia",
      title: "Mia Name Art in Chinese Calligraphy",
      description:
        "Mia is only three letters, so the brush marks stay open on the page. Chinese calligraphy on rice paper, for a name tattoo idea or a small piece of wall art you can preview on Moying.",
      keywords: "Mia name art, Chinese calligraphy, name tattoo idea, personalized gift, brush lettering",
    },
    {
      name: "Lucas",
      title: "Lucas in Chinese Brush Lettering",
      description:
        "Lucas drawn in Chinese brush calligraphy, black ink on rice paper. Save it for tattoo inspiration or for a gift that is just the name, carefully lettered. Try another name at mymoying.com.",
      keywords: "Lucas name art, Chinese calligraphy, name tattoo idea, brush lettering, personalized gift",
    },
    {
      name: "Luna",
      title: "Luna in Chinese Calligraphy",
      description:
        "Luna on rice paper, written in Chinese brush-calligraphy style. A soft name-tattoo reference and a simple personalized print. Moying is built for short English names and words in this ink look.",
      keywords: "Luna name art, Chinese calligraphy, name tattoo idea, brush lettering, wall art",
    },
    {
      name: "Ethan",
      title: "Ethan in Chinese Brush Calligraphy",
      description:
        "Ethan lettered with a Chinese brush and a small red seal on rice paper. Useful as a name-tattoo idea or as understated wall art. Preview the spelling you want on Moying before you buy a clean download.",
      keywords: "Ethan name art, Chinese calligraphy, name tattoo idea, personalized gift, brush lettering",
    },
  ],
};

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatUtc(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

// Clock time in America/New_York, written as the UTC timestamp Pinterest stores.
// Date.UTC rolls 24:00 onto the next day, which is what 8pm Eastern needs.
function publishStamp(index) {
  const dayOffset = Math.floor(index / BATCH.hoursEastern.length);
  const hourEastern = BATCH.hoursEastern[index % BATCH.hoursEastern.length];
  const { year, month, day } = BATCH.start;
  const offset = easternOffsetHours(year, month, day + dayOffset);
  const utc = new Date(Date.UTC(year, month - 1, day + dayOffset, hourEastern - offset, 0, 0));
  return formatUtc(utc);
}

function easternParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    label: `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`,
  };
}

function easternLabel(stamp) {
  return easternParts(new Date(`${stamp}Z`)).label;
}

// Hours east of UTC are negative. Noon UTC is 08:00 in EDT, so the offset is -4.
function easternOffsetHours(year, month, day) {
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return easternParts(noonUtc).hour - 12;
}

function assertSchedule(rows) {
  const now = Date.now();
  const windowEnd = now + 14 * 24 * 60 * 60 * 1000;
  rows.forEach((row, i) => {
    const when = Date.parse(`${row.stamp}Z`);
    if (!Number.isFinite(when)) throw new Error(`Bad publish date: ${row.stamp}`);
    if (when <= now + 60 * 1000) throw new Error(`Publish date is not in the future: ${row.stamp}`);
    if (when > windowEnd) throw new Error(`Publish date is outside the 14-day window: ${row.stamp}`);
    const label = easternLabel(row.stamp);
    const expectedHour = BATCH.hoursEastern[i % BATCH.hoursEastern.length];
    if (!label.endsWith(` ${pad(expectedHour)}:00`)) {
      throw new Error(`Expected ${expectedHour}:00 Eastern, got ${label} from ${row.stamp}`);
    }
    if (row.title.length > 100) throw new Error(`Title too long (${row.title.length}): ${row.title}`);
    if (row.description.length > 500) throw new Error(`Description too long (${row.description.length}): ${row.name}`);
    if (!row.keywords.split(",").every((k) => k.trim())) throw new Error(`Empty keyword for ${row.name}`);
  });
}

function csvField(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function buildCsv(rows) {
  const header = ["Title", "Media URL", "Pinterest board", "Thumbnail", "Description", "Link", "Publish date", "Keywords"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push([
      row.title,
      row.mediaUrl,
      BATCH.board,
      "",
      row.description,
      row.link,
      row.stamp,
      row.keywords,
    ].map(csvField).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function planRows() {
  return BATCH.names.map((entry, index) => {
    const file = `${entry.name.toLowerCase()}.jpg`;
    const link = `https://mymoying.com/?utm_source=pinterest&utm_medium=pin&utm_campaign=${BATCH.id}&name=${encodeURIComponent(entry.name)}`;
    return {
      ...entry,
      file,
      mediaUrl: `https://mymoying.com/pins/${file}`,
      link,
      stamp: publishStamp(index),
    };
  });
}

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
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0.28em";
    ctx.fillText(label, w / 2, h * 0.952);
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
      fmt: "jpg",
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
    const layout = snap.dir === "v"
      ? layoutVertical(font, { ...snap, text: filtered.text })
      : layoutHorizontal(font, { ...snap, text: filtered.text });
    return layout.size;
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
    const quality = Number(raw.quality ?? 0.92);
    return {
      dataUrl: target.toDataURL("image/jpeg", quality),
      width: target.width,
      height: target.height,
    };
  }

  window.measureFit = measureFit;
  window.renderPin = renderPin;
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

function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error("not a jpeg");
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error("jpeg size missing");
}

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error("Chrome not found. Set CHROME_PATH.");
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
      ctx.fillText(rows[i].name, x + thumbW / 2, y + thumbH + cap / 2 + 4);
    }
    return canvas.toDataURL("image/jpeg", 0.86);
  }, { rows, cols, thumbW, thumbH, cap, gap, pad, port });
}

async function main() {
  const args = process.argv.slice(2);
  const onlyAt = args.indexOf("--only");
  const only = onlyAt >= 0 ? args[onlyAt + 1] : "";
  const contactAt = args.indexOf("--contact");
  const contactPath = contactAt >= 0 ? args[contactAt + 1] : "";

  const rows = planRows().filter((row) => !only || row.name.toLowerCase() === only.toLowerCase());
  if (!rows.length) throw new Error(`No names matched --only ${only}`);
  if (!only) assertSchedule(rows);

  const outDir = path.join(ROOT, "pins");
  fs.mkdirSync(outDir, { recursive: true });
  const { server, port } = await startServer(buildRuntime());
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    page.on("pageerror", (err) => console.error("pageerror", err));
    await page.goto(`http://127.0.0.1:${port}/pin-harness.html`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => typeof window.renderPin === "function" && typeof window.measureFit === "function");

    const fitted = [];
    for (const row of rows) {
      const size = await page.evaluate((text) => window.measureFit({ text, size: 260 }), row.name);
      fitted.push({ name: row.name, size });
    }
    const sharedFont = Math.min(...fitted.map((f) => f.size));
    // kai base size is slider * 1.06. Back into a slider the site actually offers.
    const slider = Math.max(90, Math.min(260, Math.round(sharedFont / 1.06)));
    console.log(`letter size ${sharedFont.toFixed(1)}px, size slider ${slider}`);
    console.log(fitted.map((f) => `${f.name}:${f.size.toFixed(1)}`).join(" "));

    for (const row of rows) {
      let quality = 0.92;
      let buf = null;
      let dims = null;
      while (quality >= 0.8) {
        const rendered = await page.evaluate(async (job) => window.renderPin(job), {
          text: row.name,
          size: slider,
          quality,
        });
        buf = Buffer.from(rendered.dataUrl.split(",")[1], "base64");
        dims = jpegSize(buf);
        if (buf.length <= MAX_BYTES) break;
        quality = Math.round((quality - 0.04) * 100) / 100;
      }
      if (!buf || buf.length > MAX_BYTES) throw new Error(`${row.file} is ${buf ? buf.length : 0} bytes`);
      if (dims.width !== PIN_W || dims.height !== PIN_H) {
        throw new Error(`${row.file} is ${dims.width}x${dims.height}`);
      }
      fs.writeFileSync(path.join(outDir, row.file), buf);
      console.log(`${row.file} ${dims.width}x${dims.height} ${(buf.length / 1024).toFixed(0)}KB q=${quality} ${row.stamp}`);
    }

    if (!only) {
      const csv = buildCsv(rows);
      const csvPath = path.join(outDir, `${BATCH.id}.csv`);
      fs.writeFileSync(csvPath, csv);
      console.log(`wrote ${csvPath}`);
    }

    if (contactPath) {
      const sheetUrl = await contactSheet(page, rows, port);
      const sheet = Buffer.from(sheetUrl.split(",")[1], "base64");
      fs.mkdirSync(path.dirname(contactPath), { recursive: true });
      fs.writeFileSync(contactPath, sheet);
      console.log(`contact sheet ${contactPath} ${(sheet.length / 1024).toFixed(0)}KB`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
