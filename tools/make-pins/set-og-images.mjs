#!/usr/bin/env node
/**
 * Point each SEO landing page's og:image / twitter:image at its own pin.
 *
 * Every landing page used to share https://mymoying.com/og.png, so all 16 pins
 * on Pinterest looked identical. Each page now points at the 1000x1500 pin that
 * make-og-pins.mjs renders for it, with matching width/height.
 *
 * index.html keeps og.png, and terms/privacy/404 are untouched.
 *
 *   node tools/make-pins/set-og-images.mjs [--check]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SITE = "https://mymoying.com";
const PIN_W = 1000;
const PIN_H = 1500;

// Landing page slug -> pin file. The page name and the pin name are the same
// slug, which is what makes the mappingauditable by eye.
const PAGES = [
  "emma",
  "michael",
  "sophia",
  "james",
  "grace",
  "lily",
  "ethan",
  "olivia",
  "love",
  "peace",
  "hope",
  "dream",
  "name-in-chinese-calligraphy",
  "chinese-calligraphy-tattoo-ideas",
  "meaning-of-chinese-characters",
  "custom-chinese-name-gift",
];

const check = process.argv.includes("--check");
let changed = 0;

for (const slug of PAGES) {
  const file = path.join(ROOT, `${slug}.html`);
  const original = fs.readFileSync(file, "utf8");
  if (!fs.existsSync(path.join(ROOT, "pins", `${slug}.png`))) {
    throw new Error(`pins/${slug}.png is missing - run make-og-pins.mjs first`);
  }

  // The pages are checked in with CRLF; keep whatever the file already uses so a
  // two-line edit stays a two-line diff.
  const nl = original.includes("\r\n") ? "\r\n" : "\n";

  const edits = [
    [
      `  <meta property="og:image" content="${SITE}/og.png" />${nl}` +
      `  <meta property="og:image:width" content="1200" />${nl}` +
      `  <meta property="og:image:height" content="630" />`,
      `  <meta property="og:image" content="${SITE}/pins/${slug}.png" />${nl}` +
      `  <meta property="og:image:width" content="${PIN_W}" />${nl}` +
      `  <meta property="og:image:height" content="${PIN_H}" />`,
    ],
    [
      `  <meta name="twitter:image" content="${SITE}/og.png" />`,
      `  <meta name="twitter:image" content="${SITE}/pins/${slug}.png" />`,
    ],
  ];

  let next = original;
  for (const [from, to] of edits) {
    const count = next.split(from).length - 1;
    if (count !== 1) throw new Error(`${slug}.html: expected 1 match for [${from.split("\n")[0]}], found ${count}`);
    next = next.replace(from, to);
  }

  const left = next.split("/og.png").length - 1;
  if (left !== 0) throw new Error(`${slug}.html still references og.png ${left} time(s)`);

  if (next !== original) {
    changed += 1;
    if (check) {
      console.log(`WOULD CHANGE ${slug}.html`);
    } else {
      fs.writeFileSync(file, next);
      console.log(`updated ${slug}.html -> ${SITE}/pins/${slug}.png`);
    }
  } else {
    console.log(`already correct ${slug}.html`);
  }
}

console.log(`${changed} of ${PAGES.length} pages ${check ? "need changes" : "changed"}`);
