#!/usr/bin/env node
/**
 * Point each SEO landing page's og:image / twitter:image at its own pin, and
 * give every one of them a descriptive alt.
 *
 * The pins are JPEG, named after the page slug and what the image shows
 * (pins/emma-chinese-calligraphy-name.jpg), so the file name alone describes
 * the picture. The alt carries the same idea for screen readers and for the
 * social cards: "Emma written in Chinese brush calligraphy style with Chinese
 * name 艾玛".
 *
 * The script rewrites the whole og:image / twitter:image run on each page, so
 * it is safe to re-run and works whether the page currently points at the old
 * slug-only pin, an earlier png pin, or the shared og.png.
 *
 *   node tools/make-pins/set-og-images.mjs [--check]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pinFile } from "./pin-file.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SITE = "https://mymoying.com";
const PIN_W = 1000;
const PIN_H = 1500;

// Landing page slug -> the word its pin draws, for guide/word pages.
const DRAWN = {
  love: "Love",
  peace: "Peace",
  hope: "Hope",
  dream: "Dream",
  "name-in-chinese-calligraphy": "Emma",
  "chinese-calligraphy-tattoo-ideas": "Strength",
  "meaning-of-chinese-characters": "Love",
  "custom-chinese-name-gift": "Family",
};

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

function nameTable() {
  const table = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "names-zh.json"), "utf8"));
  const records = table.names || table;
  const bySlug = new Map();
  for (const [name, value] of Object.entries(records)) {
    if (name.startsWith("_")) continue;
    const zh = value && typeof value === "object" ? value.zh : value;
    bySlug.set(name.toLowerCase(), { name, zh });
  }
  return bySlug;
}

function altFor(slug, names) {
  const named = names.get(slug);
  if (named) return `${named.name} written in Chinese brush calligraphy style with Chinese name ${named.zh}`;
  const word = DRAWN[slug] || slug;
  return `${word} written in Chinese brush calligraphy style`;
}

const check = process.argv.includes("--check");
const names = nameTable();
let changed = 0;

for (const slug of PAGES) {
  const file = path.join(ROOT, `${slug}.html`);
  const original = fs.readFileSync(file, "utf8");
  const pin = pinFile(slug);
  if (!fs.existsSync(path.join(ROOT, "pins", pin))) {
    throw new Error(`pins/${pin} is missing - run make-og-pins.mjs first`);
  }
  const pinUrl = `${SITE}/pins/${pin}`;
  const alt = altFor(slug, names);
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const lines = original.split(/\r?\n/);

  const isOg = (line) => /^\s*<meta property="og:image(:[a-z]+)?"/.test(line);
  const isTwitter = (line) => /^\s*<meta name="twitter:image(:[a-z]+)?"/.test(line);
  const ogBlock = [
    `  <meta property="og:image" content="${pinUrl}" />`,
    `  <meta property="og:image:width" content="${PIN_W}" />`,
    `  <meta property="og:image:height" content="${PIN_H}" />`,
    `  <meta property="og:image:alt" content="${alt}" />`,
  ];
  const twitterBlock = [
    `  <meta name="twitter:image" content="${pinUrl}" />`,
    `  <meta name="twitter:image:alt" content="${alt}" />`,
  ];

  let foundOg = false;
  let foundTwitter = false;
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (isOg(lines[i])) {
      foundOg = true;
      out.push(...ogBlock);
      while (i + 1 < lines.length && isOg(lines[i + 1])) i++;
      continue;
    }
    if (isTwitter(lines[i])) {
      foundTwitter = true;
      out.push(...twitterBlock);
      while (i + 1 < lines.length && isTwitter(lines[i + 1])) i++;
      continue;
    }
    out.push(lines[i]);
  }
  if (!foundOg) throw new Error(`${slug}.html has no og:image tag`);
  if (!foundTwitter) throw new Error(`${slug}.html has no twitter:image tag`);

  const next = out.join(eol);
  if (next !== original) {
    changed += 1;
    if (check) {
      console.log(`WOULD CHANGE ${slug}.html`);
    } else {
      fs.writeFileSync(file, next);
      console.log(`updated ${slug}.html -> ${pin}`);
    }
  } else {
    console.log(`already correct ${slug}.html`);
  }
}

console.log(`${changed} of ${PAGES.length} pages ${check ? "need changes" : "changed"}`);
