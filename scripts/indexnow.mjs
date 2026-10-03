#!/usr/bin/env node
/**
 * Submit every URL in sitemap.xml to IndexNow.
 *
 *   node scripts/indexnow.mjs            submit
 *   node scripts/indexnow.mjs --dry-run  print the payloads, send nothing
 *
 * IndexNow takes a list of URLs and shares it with the participating engines
 * (Bing, Yandex, Seznam, Naver and others), so a URL is crawled without waiting
 * for the next organic pass. Ownership is proved by the key file at the
 * repository root, which the deploy root serves at
 * https://mymoying.com/<key>.txt; the key is not a secret, it is public by
 * design and only shows that whoever submits the URLs can also publish files on
 * the host.
 *
 * The key lives in KEY below, matching the <key>.txt file in this directory's
 * parent. INDEXNOW_KEY overrides it, and INDEXNOW_ENDPOINT points the script at
 * a local stub for testing. A request takes at most 10,000 URLs, so the list is
 * batched; the current sitemap is well under one batch.
 *
 * The key file must already be live at the deployed site before running this,
 * or api.indexnow.org answers 403 (key not found).
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const KEY = "33c72895dbdf859026c968b8dd38331e";
const KEY_FILE = path.join(ROOT, `${KEY}.txt`);
const SITEMAP_FILE = path.join(ROOT, "sitemap.xml");
const ENDPOINT = process.env.INDEXNOW_ENDPOINT || "https://api.indexnow.org/indexnow";
const HOST = "mymoying.com";

// IndexNow rejects a request carrying more than 10,000 URLs.
const MAX_URLS_PER_REQUEST = 10_000;

const dryRun = process.argv.includes("--dry-run");

/** Every <loc> in the sitemap, trimmed, in document order, without duplicates. */
function readSitemapUrls(file) {
  const xml = readFileSync(file, "utf8");
  const urls = [];
  const seen = new Set();
  for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
    const url = match[1];
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** IndexNow returns 200 or 202 on success; anything else means the batch was not accepted. */
function describeStatus(status) {
  switch (status) {
    case 200:
    case 202:
      return "accepted";
    case 400:
      return "bad request (malformed JSON or missing fields)";
    case 403:
      return "forbidden (key file not found at keyLocation, or key invalid)";
    case 422:
      return "unprocessable (URLs do not belong to the host, or key does not match)";
    case 429:
      return "too many requests (rate limited, try again later)";
    default:
      return "unexpected response";
  }
}

async function submit(payload) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  return response;
}

async function main() {
  const key = process.env.INDEXNOW_KEY || KEY;

  if (!key || !/^[A-Za-z0-9-]{8,128}$/.test(key)) {
    throw new Error(`IndexNow key must be 8-128 characters of a-z, A-Z, 0-9 or dash; got ${JSON.stringify(key)}`);
  }
  if (key !== KEY) {
    console.warn(`Warning: key ${key} does not match the committed ${KEY}.txt; make sure ${key}.txt is deployed too.`);
  }
  if (!existsSync(KEY_FILE) && key === KEY) {
    console.warn(`Warning: ${path.basename(KEY_FILE)} is missing from the repository root.`);
  } else if (key === KEY) {
    const onDisk = readFileSync(KEY_FILE, "utf8").trim();
    if (onDisk !== KEY) {
      throw new Error(`${path.basename(KEY_FILE)} contains ${JSON.stringify(onDisk)}, expected ${KEY}`);
    }
  }

  if (!existsSync(SITEMAP_FILE)) throw new Error(`No sitemap at ${SITEMAP_FILE}`);
  const urls = readSitemapUrls(SITEMAP_FILE);

  const foreign = urls.filter((url) => {
    try {
      return new URL(url).host !== HOST;
    } catch {
      return true;
    }
  });
  if (foreign.length > 0) {
    throw new Error(`sitemap has ${foreign.length} URL(s) not on ${HOST}, first: ${foreign[0]}`);
  }
  if (urls.length === 0) throw new Error("sitemap has no <loc> entries");

  const batches = chunk(urls, MAX_URLS_PER_REQUEST);
  console.log(`${urls.length} URLs in sitemap.xml, ${batches.length} request(s) to ${ENDPOINT}`);

  let failures = 0;
  for (const [index, urlList] of batches.entries()) {
    const payload = {
      host: HOST,
      key,
      keyLocation: `https://${HOST}/${key}.txt`,
      urlList,
    };

    if (dryRun) {
      console.log(`batch ${index + 1}/${batches.length}: ${urlList.length} URLs (dry run, not sent)`);
      console.log(JSON.stringify(payload, null, 2));
      continue;
    }

    let response;
    try {
      response = await submit(payload);
    } catch (err) {
      failures += 1;
      console.error(`batch ${index + 1}/${batches.length}: request failed - ${err && err.message}`);
      continue;
    }

    const ok = response.status === 200 || response.status === 202;
    console.log(`batch ${index + 1}/${batches.length}: ${response.status} ${describeStatus(response.status)}`);
    if (!ok) {
      failures += 1;
      const body = await response.text().catch(() => "");
      if (body) console.error(body.slice(0, 500));
    }
  }

  if (failures > 0) {
    console.error(`${failures} of ${batches.length} batch(es) were not accepted`);
    process.exitCode = 1;
  } else if (!dryRun) {
    console.log("All URLs submitted.");
  }
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exitCode = 1;
});
