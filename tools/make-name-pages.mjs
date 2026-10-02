#!/usr/bin/env node
/**
 * Generate one page per English name from the fixed name table.
 *
 *   node tools/make-name-pages.mjs
 *
 * Reads data/names-zh.json (English name -> { zh, pinyin }) and writes:
 *   name/<slug>.html   one page per name, canonical /name/<slug>
 *   names.html         the /names index linking every name page
 *   sitemap.xml        every page, including the new name pages
 *
 * The pages are static: each one shows a small watermarked sample image
 * (name/img/<slug>-chinese-calligraphy-name.jpg, rendered by
 * tools/make-name-images.mjs), the Chinese name and its pinyin, and a link
 * that opens the generator with the name prefilled. The price shown here comes
 * from the same functions/lib/pricing.js constant the checkout uses.
 *
 * Cloudflare Pages serves name/<slug>.html at the clean URL /name/<slug>, which
 * is what every canonical, sitemap entry and internal link uses.
 *
 * Re-runnable: each run overwrites the generated files from the table, so the
 * pages and the sitemap can never drift from the data.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRICE_LABEL } from "../functions/lib/pricing.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SITE = "https://mymoying.com";
const NAMES_FILE = path.join(ROOT, "data", "names-zh.json");
const OUT_DIR = path.join(ROOT, "name");
const IMG_DIR = "img";
const LASTMOD = "2026-10-02";

export function slugFor(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function imageFileFor(slug) {
  return `${slug}-chinese-calligraphy-name.jpg`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function loadNames() {
  const table = JSON.parse(fs.readFileSync(NAMES_FILE, "utf8"));
  const records = table.names || table;
  const names = [];
  for (const [name, value] of Object.entries(records)) {
    if (name.startsWith("_")) continue;
    const zh = value && typeof value === "object" ? value.zh : value;
    const pinyin = value && typeof value === "object" ? value.pinyin : "";
    if (typeof zh !== "string" || !zh) continue;
    names.push({ name, slug: slugFor(name), zh, pinyin: pinyin || "" });
  }
  return names;
}

export function namePage(entry, prev, next) {
  const { name, slug, zh, pinyin } = entry;
  const img = imageFileFor(slug);
  const url = `${SITE}/name/${slug}`;
  const title = `${name} in Chinese Calligraphy — ${zh} | Moying`;
  const pinyinClause = pinyin ? ` (${pinyin})` : "";
  const description =
    `See how the name ${name} looks in Chinese brush calligraphy, with the Chinese ` +
    `transliteration ${zh}${pinyinClause}. Free watermarked preview; a clean ` +
    `high-resolution download costs ${PRICE_LABEL}.`;
  const alt = `${name} written in Chinese brush calligraphy style with Chinese name ${zh}`;
  const e = escapeHtml;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${e(title)}</title>
  <meta name="description" content="${e(description)}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Moying" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${e(title)}" />
  <meta property="og:description" content="${e(description)}" />
  <meta property="og:image" content="${SITE}/name/${IMG_DIR}/${img}" />
  <meta property="og:image:width" content="480" />
  <meta property="og:image:height" content="640" />
  <meta property="og:image:alt" content="${e(alt)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${e(title)}" />
  <meta name="twitter:description" content="${e(description)}" />
  <meta name="twitter:image" content="${SITE}/name/${IMG_DIR}/${img}" />
  <meta name="twitter:image:alt" content="${e(alt)}" />
  <link rel="stylesheet" href="../styles.css" />
</head>
<body>
  <div class="app">
    <header class="top">
      <div class="brand">
        <span class="seal-mini" aria-hidden="true">墨</span>
        <div>
          <span class="brand-name">Moying</span>
          <p>English · Chinese brush</p>
        </div>
      </div>
      <a class="ghost" href="/">Try your name →</a>
    </header>

    <main class="article">
      <h1>${e(name)} in Chinese Calligraphy — ${e(zh)}</h1>
      <p class="lead">See how the name ${e(name)} looks written with a traditional Chinese brush, alongside the Chinese transliteration ${e(zh)}.</p>

      <div class="stage-wrap">
        <img src="${IMG_DIR}/${img}" width="480" height="640" alt="${e(alt)}" />
      </div>
      <p class="caption">Sample. "${e(name)}" in the Regular (楷书) brush style with the Chinese name ${e(zh)}${pinyin ? ` (${e(pinyin)})` : ""}. The paid file removes the watermark.</p>

      <h2>The Chinese characters for ${e(name)}</h2>
      <p>As a transliteration, ${e(name)} is usually written <strong>${e(zh)}</strong>${pinyin ? ` (${e(pinyin)})` : ""}. These characters are chosen for their sound, not their meaning, and are given here for reference — Moying does not translate names. Please have a person review the characters before any permanent use such as a tattoo.</p>

      <h2>How ${e(name)} is written</h2>
      <p>Moying draws each letter of ${e(name)} with a brush font made for Chinese calligraphy, so the name keeps its spelling but gains the weight, stroke and ink-on-paper texture of traditional writing. Five styles are available — Neat, Regular, Flowing, Grass and Wild — along with horizontal or vertical layout.</p>

      <a class="cta" href="/?text=${encodeURIComponent(name)}">Open ${e(name)} in the generator</a>
      <p class="hint price">Free watermarked preview. ${PRICE_LABEL} once for a clean high-resolution download of this word in every style and setting. No subscription. Digital product, delivered instantly; see <a href="/terms">Terms</a>.</p>

      <div class="pill-row">
        <a class="pill" href="/names">All names</a>
        <a class="pill" href="/name/${prev.slug}">${e(prev.name)}</a>
        <a class="pill" href="/name/${next.slug}">${e(next.name)}</a>
        <a class="pill" href="/">Try your own name</a>
      </div>
    </main>

    <footer class="legal">
      <a href="/">Generator</a>
      <a href="/terms">Terms</a>
      <a href="/privacy">Privacy</a>
      <a href="/names">Names</a>
    </footer>
  </div>
  <script data-goatcounter="https://mymoying.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
</body>
</html>
`;
}

function namesIndex(names) {
  const pills = names
    .map((entry) => `        <a class="pill" href="/name/${entry.slug}">${escapeHtml(entry.name)}</a>`)
    .join("\n");
  const title = "English Names in Chinese Calligraphy — Full List | Moying";
  const description =
    `Browse ${names.length} English names, each with its conventional Chinese ` +
    "transliteration, pinyin and a brush-calligraphy sample. Open any name in the generator.";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${title}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${SITE}/names" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Moying" />
  <meta property="og:url" content="${SITE}/names" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${SITE}/og.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="The word Peace drawn in Chinese brush-calligraphy style on rice paper" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${SITE}/og.png" />
  <meta name="twitter:image:alt" content="The word Peace drawn in Chinese brush-calligraphy style on rice paper" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div class="app">
    <header class="top">
      <div class="brand">
        <span class="seal-mini" aria-hidden="true">墨</span>
        <div>
          <span class="brand-name">Moying</span>
          <p>English · Chinese brush</p>
        </div>
      </div>
      <a class="ghost" href="/">Try your name →</a>
    </header>

    <main class="article">
      <h1>English names in Chinese calligraphy</h1>
      <p class="lead">Every name below has its own page with the conventional Chinese characters, the pinyin reading and a brush-calligraphy sample. Pick a name to see it, or open the generator and type your own.</p>
      <div class="pill-row">
${pills}
      </div>
      <a class="cta" href="/">Open the generator</a>
    </main>

    <footer class="legal">
      <a href="/">Generator</a>
      <a href="/terms">Terms</a>
      <a href="/privacy">Privacy</a>
    </footer>
  </div>
  <script data-goatcounter="https://mymoying.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
</body>
</html>
`;
}

function sitemap(names) {
  const fixed = [
    ["/", "1.0", "monthly", "2026-09-29"],
    ["/names", "0.8", "weekly", LASTMOD],
    ["/name-in-chinese-calligraphy", "0.8", "monthly", "2026-09-29"],
    ["/chinese-calligraphy-tattoo-ideas", "0.8", "monthly", "2026-09-29"],
    ["/meaning-of-chinese-characters", "0.8", "monthly", "2026-09-29"],
    ["/custom-chinese-name-gift", "0.8", "monthly", "2026-09-29"],
    ...["emma", "michael", "sophia", "james", "grace", "lily", "ethan", "olivia", "love", "peace", "hope", "dream"]
      .map((slug) => [`/${slug}`, "0.7", "monthly", "2026-09-29"]),
    ["/terms", "0.3", "yearly", "2026-09-29"],
    ["/privacy", "0.3", "yearly", "2026-09-29"],
  ];
  const rows = [
    ...fixed,
    ...names.map((entry) => [`/name/${entry.slug}`, "0.6", "monthly", LASTMOD]),
  ];
  const body = rows
    .map(([loc, priority, changefreq, lastmod]) =>
      `  <url><loc>${SITE}${loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function main() {
  const names = loadNames();
  if (names.length < 100) throw new Error(`only ${names.length} names in ${NAMES_FILE}`);
  const slugs = new Set(names.map((entry) => entry.slug));
  if (slugs.size !== names.length) throw new Error("two names collapse onto one slug");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  names.forEach((entry, index) => {
    const prev = names[(index - 1 + names.length) % names.length];
    const next = names[(index + 1) % names.length];
    fs.writeFileSync(path.join(OUT_DIR, `${entry.slug}.html`), namePage(entry, prev, next));
  });
  fs.writeFileSync(path.join(ROOT, "names.html"), namesIndex(names));
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemap(names));
  console.log(`wrote ${names.length} name pages, names.html and sitemap.xml`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
