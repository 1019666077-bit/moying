#!/usr/bin/env node
/**
 * Render the small sample image used by every name page.
 *
 *   cd tools/make-pins && npm install
 *   node tools/make-name-images.mjs
 *
 * One 480x640 JPEG per name lands in samples/. The image is the site's own
 * brush renderer (app.js) drawing the English letters plus the Chinese name
 * below them, at the free-preview quality: the same "mymoying.com preview"
 * mark the unpaid generator shows, so a page can never leak the clean
 * high-resolution file that a purchase unlocks.
 *
 * Output files are named <slug>-chinese-calligraphy-name.jpg, matching the
 * og:image the page generator writes. Requires Google Chrome or Chromium
 * (CHROME_PATH overrides the binary).
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { imageFileFor, slugFor } from "../make-name-pages.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const IMG_W = 480;
const IMG_H = 640;
const MAX_BYTES = 120 * 1024;

// Site defaults: Regular brush, horizontal, rice paper, black ink, seal, dry 22.
const LOOK = { style: "kai", track: 38, dry: 22, seal: true };

function loadNames() {
  const table = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "names-zh.json"), "utf8"));
  const records = table.names || table;
  const names = [];
  for (const [name, value] of Object.entries(records)) {
    if (name.startsWith("_")) continue;
    const zh = value && typeof value === "object" ? value.zh : value;
    if (typeof zh !== "string" || !zh) continue;
    names.push({ name, zh, slug: slugFor(name) });
  }
  return names;
}

// Patch app.js in memory: draw at sample size and expose a renderer that keeps
// the free-preview watermark. Every replacement is counted so a refactor of
// app.js fails loudly instead of silently drawing something else.
function buildRuntime() {
  let src = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  const replacements = [
    ["const BASE_W = 900;", `const BASE_W = ${IMG_W};`],
    ["const BASE_H = 1200;", `const BASE_H = ${IMG_H};`],
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
  function nameSnap(raw, text) {
    return {
      text,
      style: raw.style || ${JSON.stringify(LOOK.style)},
      dir: "h",
      paper: "xuan",
      ink: "black",
      size: Number(raw.size ?? 196),
      track: ${LOOK.track},
      dry: ${LOOK.dry},
      seal: true,
      combo: "",
    };
  }

  async function measureNameImage(raw) {
    const font = await loadFont("kai");
    const filtered = filterGlyphs(font, String(raw.text || ""));
    if (!filtered.text) throw new Error("nothing to draw for " + raw.text);
    const layout = layoutHorizontal(font, nameSnap(raw, filtered.text));
    return { size: layout.size, text: filtered.text };
  }

  async function renderNameImage(raw) {
    const font = await loadFont("kai");
    const [sealFont, hanziFont] = await Promise.all([
      loadFont("seal").catch(() => null),
      loadFont(HANZI_FONT).catch(() => null),
    ]);
    const filtered = filterGlyphs(font, String(raw.text || ""));
    if (!filtered.text) throw new Error("nothing to draw for " + raw.text);
    const combo = String(raw.combo || "");
    let comboFont = hanziFont;
    if (comboFont && ![...combo].every((ch) => {
      const glyph = comboFont.charToGlyph(ch);
      return glyph && glyph.name !== ".notdef";
    })) comboFont = null;
    const target = document.getElementById("stage");
    target.width = BASE_W;
    target.height = BASE_H;
    const snap = { ...nameSnap(raw, filtered.text), combo: comboFont ? combo : "" };
    paintScene(target, snap, font, sealFont, { watermark: true, hanziFont: comboFont });
    return {
      dataUrl: target.toDataURL("image/jpeg", Number(raw.quality ?? 0.82)),
      width: target.width,
      height: target.height,
      combo: comboFont ? combo : "",
    };
  }

  window.measureNameImage = measureNameImage;
  window.renderNameImage = renderNameImage;
})();
`;
  return head + tail;
}

const HARNESS = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <base href="/" />
  <title>Moying name image renderer</title>
</head>
<body>
  <canvas id="stage" width="${IMG_W}" height="${IMG_H}"></canvas>
  <input id="textInput" value="" />
  <script src="/vendor/opentype.min.js"></script>
  <script src="/name-runtime.js"></script>
</body>
</html>
`;

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "text/javascript; charset=utf-8";
  if (ext === ".ttf") return "font/ttf";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function startServer(runtimeJs) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname === "/name-harness.html") {
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(HARNESS);
      return;
    }
    if (url.pathname === "/name-runtime.js") {
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
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error("not a jpeg");
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0xd9) { i += 2; continue; }
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

async function main() {
  const args = process.argv.slice(2);
  const onlyAt = args.indexOf("--only");
  const only = onlyAt >= 0 ? args[onlyAt + 1].toLowerCase() : "";
  const missingOnly = args.includes("--missing");
  let names = loadNames().filter((entry) => !only || entry.slug === only);
  if (missingOnly) {
    names = names.filter((entry) => !fs.existsSync(path.join(ROOT, "samples", imageFileFor(entry.slug))));
  }
  if (!names.length) throw new Error(`No names matched --only ${only}`);

  const outDir = path.join(ROOT, "samples");
  fs.mkdirSync(outDir, { recursive: true });
  const { server, port } = await startServer(buildRuntime());
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  let total = 0;
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    page.on("pageerror", (err) => console.error("pageerror", err));
    await page.goto(`http://127.0.0.1:${port}/name-harness.html`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => typeof window.renderNameImage === "function");

    for (const entry of names) {
      const fitted = await page.evaluate((text) => window.measureNameImage({ text, size: 260 }), entry.name);
      const slider = Math.max(90, Math.min(260, Math.round(fitted.size / 1.06)));
      let quality = 0.82;
      let buf = null;
      let dims = null;
      while (quality >= 0.6) {
        const rendered = await page.evaluate(async (job) => window.renderNameImage(job), {
          text: entry.name,
          combo: entry.zh,
          size: slider,
          quality,
        });
        if (!rendered.combo) throw new Error(`${entry.slug}: the hanzi font has no glyphs for ${entry.zh}`);
        buf = Buffer.from(rendered.dataUrl.split(",")[1], "base64");
        dims = jpegSize(buf);
        if (buf.length <= MAX_BYTES) break;
        quality = Math.round((quality - 0.04) * 100) / 100;
      }
      if (!buf || buf.length > MAX_BYTES) throw new Error(`${entry.slug} is ${buf ? buf.length : 0} bytes`);
      if (dims.width !== IMG_W || dims.height !== IMG_H) {
        throw new Error(`${entry.slug} is ${dims.width}x${dims.height}`);
      }
      fs.writeFileSync(path.join(outDir, imageFileFor(entry.slug)), buf);
      total += buf.length;
      console.log(`${imageFileFor(entry.slug)} ${dims.width}x${dims.height} ${(buf.length / 1024).toFixed(0)}KB q=${quality}`);
    }
    console.log(`\n${names.length} images, ${(total / 1024 / 1024).toFixed(2)}MB total`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
