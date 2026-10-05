#!/usr/bin/env node
/**
 * Self-test for the generated name pages.
 *
 *   node tools/check-pages.mjs
 *
 * Checks, for every name page plus names.html:
 *   - unique <title>, meta description and canonical
 *   - exactly one <h1>, one <title>, one canonical, one meta description
 *   - canonical === https://mymoying.com/<slug> (extensionless)
 *   - the sample image referenced on the page exists
 *   - every internal <a href> resolves to a real page
 *   - every name in the data file is listed in names.html and sitemap.xml
 *   - HTML is well-formed enough (balanced structural tags)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadNames, slugFor, imageFileFor } from "./make-name-pages.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SITE = "https://mymoying.com";

const errors = [];
const names = loadNames().filter((n) => !fs.existsSync(path.join(ROOT, `${n.slug}.html`)) || true);

function hrefTarget(href) {
  if (!href || href.startsWith("http://") || href.startsWith("https://") || href.startsWith("//") || href.startsWith("mailto:") || href.startsWith("data:")) return null;
  let h = href;
  if (h.startsWith("./")) h = h.slice(2);
  h = h.split("#")[0].split("?")[0];
  if (h === "") return "index.html";
  if (h.endsWith(".html")) return h;
  return `${h}.html`;
}

function countTag(html, tag) {
  const open = (html.match(new RegExp(`<${tag}(\\s|>)`, "g")) || []).length;
  const close = (html.match(new RegExp(`</${tag}>`, "g")) || []).length;
  return { open, close };
}

const titles = new Map();
const descriptions = new Map();
const canonicals = new Map();

function checkFile(slug) {
  const file = path.join(ROOT, `${slug}.html`);
  const html = fs.readFileSync(file, "utf8");

  const title = html.match(/<title>([\s\S]*?)<\/title>/);
  const desc = html.match(/<meta name="description" content="([\s\S]*?)"\s*\/?>/);
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
  const h1 = (html.match(/<h1[\s>]/g) || []).length;

  if (!title) errors.push(`${slug}: missing <title>`);
  else {
    const t = title[1].trim();
    if (titles.has(t)) errors.push(`${slug}: duplicate title with ${titles.get(t)}`);
    else titles.set(t, slug);
  }
  if (!desc) errors.push(`${slug}: missing meta description`);
  else {
    const d = desc[1];
    if (descriptions.has(d)) errors.push(`${slug}: duplicate description with ${descriptions.get(d)}`);
    else descriptions.set(d, slug);
  }
  if (!canonical) errors.push(`${slug}: missing canonical`);
  else {
    const c = canonical[1];
    if (canonicals.has(c)) errors.push(`${slug}: duplicate canonical with ${canonicals.get(c)}`);
    else canonicals.set(c, slug);
    if (c !== `${SITE}/${slug}`) errors.push(`${slug}: canonical ${c} != ${SITE}/${slug}`);
  }
  if (h1 !== 1) errors.push(`${slug}: expected 1 <h1>, found ${h1}`);
  if ((html.match(/<title>/g) || []).length !== 1) errors.push(`${slug}: expected 1 <title>`);

  // Sample image present.
  const img = imageFileFor(slug);
  if (slug !== "names" && !html.includes(`samples/${img}`)) errors.push(`${slug}: page does not reference samples/${img}`);
  if (slug !== "names" && !fs.existsSync(path.join(ROOT, "samples", img))) errors.push(`${slug}: missing samples/${img}`);

  // Internal links resolve.
  for (const m of html.matchAll(/<a\s[^>]*href="([^"]+)"/g)) {
    const target = hrefTarget(m[1]);
    if (target === null) continue;
    const resolved = target === "index.html" ? "index.html" : target;
    if (!fs.existsSync(path.join(ROOT, resolved))) errors.push(`${slug}: broken link "${m[1]}" -> ${resolved}`);
  }

  // Balanced structural tags.
  for (const tag of ["html", "head", "body", "div", "main", "ul", "header", "footer"]) {
    const c = countTag(html, tag);
    if (c.open !== c.close) errors.push(`${slug}: <${tag}> open=${c.open} close=${c.close}`);
  }
}

for (const entry of names) checkFile(entry.slug);
checkFile("names");

// names.html lists every name and sitemap.xml contains every URL.
const namesHtml = fs.readFileSync(path.join(ROOT, "names.html"), "utf8");
for (const entry of names) {
  if (!namesHtml.includes(`href="${entry.slug}"`)) errors.push(`names.html: missing link to ${entry.slug}`);
}
const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
for (const entry of names) {
  if (!sitemap.includes(`<loc>${SITE}/${entry.slug}</loc>`)) errors.push(`sitemap.xml: missing ${entry.slug}`);
}
// sitemap has no duplicate locs.
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (new Set(locs).size !== locs.length) errors.push("sitemap.xml: duplicate <loc> entries");

const slugs = names.map((n) => n.slug);
console.log(`checked ${slugs.length} name pages + names.html`);
console.log(`unique titles: ${titles.size}, unique descriptions: ${descriptions.size}, unique canonicals: ${canonicals.size}`);
console.log(`sitemap URLs: ${locs.length}`);

if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors.slice(0, 200)) console.error("  " + e);
  if (errors.length > 200) console.error(`  …and ${errors.length - 200} more`);
  process.exit(1);
}
console.log("all checks passed");
