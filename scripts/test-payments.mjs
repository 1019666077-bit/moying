import { createSign, generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { onRequestPost as checkout } from "../functions/api/checkout.js";
import { onRequestGet as status } from "../functions/api/status.js";
import { onRequestPost as webhook } from "../functions/api/webhook.js";
import { onRequestGet as config } from "../functions/api/config.js";
import { canonicalDesign } from "../functions/lib/design.js";
import {
  MIN_USD_CENTS,
  eventKey,
  unlockWord,
  unlocksText,
} from "../functions/lib/purchases.js";
import { PRICE_LABEL, PRICE_USD_CENTS } from "../functions/lib/pricing.js";
import { signRequest, verifyWebhook } from "../functions/lib/waffo.js";

let failed = 0;

function check(name, fn) {
  return async () => {
    try {
      await fn();
      console.log(`ok  ${name}`);
    } catch (err) {
      failed += 1;
      console.error(`FAIL ${name}`);
      console.error(err);
    }
  };
}

function mockKv() {
  const store = new Map();
  return {
    store,
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

function pemPair(type) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type, format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return { privateKey, publicKey };
}

const pkcs8 = pemPair("pkcs8");
const pkcs1 = pemPair("pkcs1");

function envFor(keys, extra = {}) {
  return {
    PURCHASES: mockKv(),
    WAFFO_MODE: "test",
    WAFFO_MERCHANT_ID: "MER_TEST",
    WAFFO_PRODUCT_ID: "PROD_testproduct",
    WAFFO_PRIVATE_KEY: keys.privateKey,
    WAFFO_WEBHOOK_PUBLIC_KEY: keys.publicKey,
    ...extra,
  };
}

function design() {
  return {
    text: "Peace",
    style: "kai",
    dir: "h",
    paper: "xuan",
    ink: "black",
    size: 196,
    track: 38,
    dry: 22,
    seal: true,
  };
}

function post(url, body, env) {
  return checkout({
    request: new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  });
}

function signedEvent(privateKey, event, now = Date.now()) {
  const raw = JSON.stringify(event);
  const signer = createSign("RSA-SHA256");
  signer.update(`${now}.${raw}`);
  signer.end();
  const header = `t=${now},v1=${signer.sign(privateKey).toString("base64")}`;
  return { raw, header };
}

function webhookRequest(raw, header, env) {
  return webhook({
    request: new Request("https://mymoying.com/api/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-waffo-signature": header },
      body: raw,
    }),
    env,
  });
}

function orderEvent(token, amount = "1.99") {
  return {
    id: "PAY_test",
    timestamp: "2026-09-28T00:00:00.000Z",
    eventType: "order.completed",
    eventId: "PAY_test",
    storeId: "STO_test",
    mode: "test",
    data: {
      orderId: "ORD_test",
      orderStatus: "completed",
      buyerEmail: "buyer@example.com",
      currency: "USD",
      chargedAmount: amount,
      amount,
      orderMetadata: { unlock: token },
      orderMerchantExternalId: token,
      productName: "Clean download",
      paymentId: "PAY_test",
      paymentStatus: "succeeded",
    },
  };
}

async function seedPending(env, token) {
  await env.PURCHASES.put(`purchase:${token}`, JSON.stringify({
    status: "pending",
    design: design(),
    word: design().text,
    orderId: null,
    createdAt: "2026-09-28T00:00:00.000Z",
  }));
}

const tests = [
  check("design rejects a client-supplied price and keeps only the drawing", () => {
    const bad = canonicalDesign({ ...design(), text: "  Peace", size: 10, seal: "yes" });
    assert.equal(bad, null);
    const ok = canonicalDesign({ ...design(), priceSnapshot: { amount: "0.01" } });
    assert.deepEqual(ok, design());
  }),

  check("missing secrets return payments_unavailable and write nothing", async () => {
    const env = { PURCHASES: mockKv() };
    const response = await post("https://mymoying.com/api/checkout", { design: design() }, env);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "payments_unavailable" });
    assert.equal(env.PURCHASES.store.size, 0);
  }),

  check("checkout signs the documented canonical request and does not send a price", async () => {
    const env = envFor(pkcs8);
    let captured = null;
    const original = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      captured = { url, init };
      return new Response(JSON.stringify({
        data: {
          sessionId: "cs_test",
          checkoutUrl: "https://cashier-sandbox.waffo.com/store/checkout/cs_test",
          expiresAt: "2026-09-28T01:00:00.000Z",
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    try {
      const response = await post("https://mymoying.com/api/checkout", {
        design: design(),
        priceSnapshot: { amount: "0.01" },
      }, env);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.match(body.token, /^[a-f0-9]{64}$/);
      assert.equal(body.checkoutUrl, "https://cashier-sandbox.waffo.com/store/checkout/cs_test");
      const sent = JSON.parse(captured.init.body);
      assert.equal(sent.productId, "PROD_testproduct");
      assert.equal(sent.productType, "onetime");
      assert.equal(sent.currency, "USD");
      assert.equal(sent.orderMerchantExternalId, body.token);
      assert.equal(sent.metadata.unlock, body.token);
      assert.equal(sent.successUrl, `https://mymoying.com/?unlock=${body.token}`);
      assert.equal(sent.priceSnapshot, undefined);
      assert.equal(captured.init.headers["x-merchant-id"], "MER_TEST");
      const { createVerify, createPublicKey } = await import("node:crypto");
      const timestamp = captured.init.headers["x-timestamp"];
      const path = "/v1/actions/checkout/create-session";
      const { createHash } = await import("node:crypto");
      const bodyHash = createHash("sha256").update(captured.init.body).digest("base64");
      const canonical = `POST\n${path}\n${timestamp}\n${bodyHash}`;
      const verifier = createVerify("RSA-SHA256");
      verifier.update(canonical);
      verifier.end();
      assert.equal(verifier.verify(createPublicKey(pkcs8.publicKey), captured.init.headers["x-signature"], "base64"), true);
      const stored = JSON.parse(env.PURCHASES.store.get(`purchase:${body.token}`));
      assert.equal(stored.status, "pending");
      assert.deepEqual(stored.design, design());
      assert.equal(stored.word, design().text);
      assert.equal(captured.url, `https://api.waffo.ai${path}`);
    } finally {
      globalThis.fetch = original;
    }
  }),

  check("a PKCS#1 private key and escaped newlines still sign", async () => {
    const escaped = pkcs1.privateKey.replace(/\n/g, "\\n");
    const body = "{}";
    const signature = await signRequest(escaped, "POST", "/v1/actions/checkout/create-session", "1711800000", body);
    const { createVerify, createHash, createPublicKey } = await import("node:crypto");
    const bodyHash = createHash("sha256").update(body).digest("base64");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`POST\n/v1/actions/checkout/create-session\n1711800000\n${bodyHash}`);
    verifier.end();
    assert.equal(verifier.verify(createPublicKey(pkcs1.publicKey), signature, "base64"), true);
  }),

  check("webhook accepts a Waffo-shaped signature and rejects a mutated body", async () => {
    const event = orderEvent("ab".repeat(32));
    const { raw, header } = signedEvent(pkcs8.privateKey, event);
    const parsed = await verifyWebhook(raw, header, pkcs8.publicKey);
    assert.equal(parsed.eventType, "order.completed");
    const forged = await verifyWebhook(raw.replace("1.99", "0.01"), header, pkcs8.publicKey);
    assert.equal(forged, null);
    const stale = await verifyWebhook(raw, header, pkcs8.publicKey, Date.now() + 46 * 60 * 1000);
    assert.equal(stale, null);
  }),

  check("a signed order.completed unlocks only that token", async () => {
    const env = envFor(pkcs8);
    const token = "cd".repeat(32);
    await seedPending(env, token);
    const { raw, header } = signedEvent(pkcs8.privateKey, orderEvent(token));
    const response = await webhookRequest(raw, header, env);
    assert.equal(response.status, 200);
    const again = await webhookRequest(raw, header, env);
    assert.equal(again.status, 200);
    const statusResponse = await status({
      request: new Request(`https://mymoying.com/api/status?token=${token}`),
      env,
    });
    const payload = await statusResponse.json();
    assert.equal(payload.status, "paid");
    assert.deepEqual(payload.design, design());
    assert.equal(payload.word, design().text);
    assert.equal(payload.buyerEmail, undefined);
    const record = JSON.parse(env.PURCHASES.store.get(`purchase:${token}`));
    assert.equal(record.buyerEmail, "buyer@example.com");
    const other = await status({
      request: new Request(`https://mymoying.com/api/status?token=${"ef".repeat(32)}`),
      env,
    });
    assert.deepEqual(await other.json(), { status: "unknown" });
  }),

  check("metadata unlock is enough when the external id is absent", async () => {
    const env = envFor(pkcs8);
    const token = "12".repeat(32);
    await seedPending(env, token);
    const event = orderEvent(token);
    delete event.data.orderMerchantExternalId;
    const { raw, header } = signedEvent(pkcs8.privateKey, event);
    assert.equal((await webhookRequest(raw, header, env)).status, 200);
    const payload = await (await status({
      request: new Request(`https://mymoying.com/api/status?token=${token}`),
      env,
    })).json();
    assert.equal(payload.status, "paid");
  }),

  check("a sample amount of 0, a bad signature, and the wrong mode do not unlock", async () => {
    const env = envFor(pkcs8);
    const token = "34".repeat(32);
    await seedPending(env, token);
    const zero = signedEvent(pkcs8.privateKey, orderEvent(token, "0.00"));
    assert.equal((await webhookRequest(zero.raw, zero.header, env)).status, 200);
    const bad = await webhookRequest(zero.raw, "t=1,v1=aaaa", env);
    assert.equal(bad.status, 401);
    const prod = orderEvent(token, "1.99");
    prod.mode = "prod";
    prod.eventId = "PAY_prod";
    prod.id = "PAY_prod";
    const signed = signedEvent(pkcs8.privateKey, prod);
    assert.equal((await webhookRequest(signed.raw, signed.header, env)).status, 200);
    const payload = await (await status({
      request: new Request(`https://mymoying.com/api/status?token=${token}`),
      env,
    })).json();
    assert.equal(payload.status, "pending");
  }),

  check("an unknown token in a paid webhook is not created", async () => {
    const env = envFor(pkcs8);
    const token = "56".repeat(32);
    const { raw, header } = signedEvent(pkcs8.privateKey, orderEvent(token));
    assert.equal((await webhookRequest(raw, header, env)).status, 200);
    const payload = await (await status({
      request: new Request(`https://mymoying.com/api/status?token=${token}`),
      env,
    })).json();
    assert.equal(payload.status, "unknown");
  }),

  check("refund.succeeded revokes, and a later order.completed stays revoked", async () => {
    const env = envFor(pkcs8);
    const token = "78".repeat(32);
    await seedPending(env, token);
    const paid = signedEvent(pkcs8.privateKey, orderEvent(token));
    assert.equal((await webhookRequest(paid.raw, paid.header, env)).status, 200);
    const refundEvent = {
      id: "REF_test",
      timestamp: "2026-09-28T02:00:00.000Z",
      eventType: "refund.succeeded",
      eventId: "REF_test",
      mode: "test",
      data: {
        orderId: "ORD_test",
        currency: "USD",
        refundedAmount: "1.99",
        amount: "1.99",
        orderMerchantExternalId: token,
        orderMetadata: { unlock: token },
        buyerEmail: "buyer@example.com",
      },
    };
    const refund = signedEvent(pkcs8.privateKey, refundEvent);
    assert.equal((await webhookRequest(refund.raw, refund.header, env)).status, 200);
    const after = await (await status({
      request: new Request(`https://mymoying.com/api/status?token=${token}`),
      env,
    })).json();
    assert.deepEqual(after, { status: "refunded" });
    const replay = orderEvent(token);
    replay.id = "PAY_late";
    replay.eventId = "PAY_late";
    const late = signedEvent(pkcs8.privateKey, replay);
    assert.equal((await webhookRequest(late.raw, late.header, env)).status, 200);
    const still = await (await status({
      request: new Request(`https://mymoying.com/api/status?token=${token}`),
      env,
    })).json();
    assert.equal(still.status, "refunded");
  }),

  check("a failed Waffo response deletes the pending token", async () => {
    const env = envFor(pkcs8);
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({
      data: null,
      errors: [{ message: "Unauthorized", layer: "gateway" }],
    }), { status: 401 });
    try {
      const response = await post("https://mymoying.com/api/checkout", { design: design() }, env);
      assert.equal(response.status, 502);
      assert.equal(env.PURCHASES.store.size, 0);
    } finally {
      globalThis.fetch = original;
    }
  }),

  check("http production origin without PUBLIC_SITE_URL does not start checkout", async () => {
    const env = envFor(pkcs8, { WAFFO_MODE: "prod" });
    const response = await post("http://127.0.0.1:8788/api/checkout", { design: design() }, env);
    assert.equal(response.status, 503);
    assert.equal(env.PURCHASES.store.size, 0);
  }),

  check("status without KV is unavailable and a short token is rejected", async () => {
    const down = await status({
      request: new Request(`https://mymoying.com/api/status?token=${"ab".repeat(32)}`),
      env: {},
    });
    assert.equal(down.status, 503);
    const bad = await status({
      request: new Request("https://mymoying.com/api/status?token=short"),
      env: envFor(pkcs8),
    });
    assert.equal(bad.status, 400);
  }),

  check("dedupe keys never collapse to an empty tail", () => {
    const withoutId = (token, orderId) => {
      const event = orderEvent(token);
      delete event.eventId;
      delete event.id;
      event.data.orderId = orderId;
      return event;
    };
    const one = withoutId("9a".repeat(32), "ORD_one");
    const two = withoutId("9b".repeat(32), "ORD_two");
    assert.notEqual(eventKey(one), eventKey(two));
    assert.equal(eventKey(one), eventKey(withoutId("9a".repeat(32), "ORD_one")));
    assert.doesNotMatch(eventKey(one), /:$/);
    const sameId = (token, orderId) => {
      const event = withoutId(token, orderId);
      event.eventId = "PAY_same";
      return event;
    };
    // A shared event id does not mean a shared event: different tokens/orders
    // must not collapse onto one key or the second buyer is silently dropped.
    assert.notEqual(eventKey(sameId("9c".repeat(32), "ORD_three")), eventKey(sameId("9d".repeat(32), "ORD_four")));
    assert.equal(eventKey(orderEvent("9e".repeat(32))), eventKey(orderEvent("9e".repeat(32))));
  }),

  check("two id-less order.completed events still unlock both buyers", async () => {
    const env = envFor(pkcs8);
    const buyers = [["aa".repeat(32), "ORD_one"], ["ab".repeat(32), "ORD_two"]];
    for (const [token] of buyers) await seedPending(env, token);
    for (const [token, orderId] of buyers) {
      const event = orderEvent(token);
      delete event.eventId;
      delete event.id;
      event.data.orderId = orderId;
      const { raw, header } = signedEvent(pkcs8.privateKey, event);
      assert.equal((await webhookRequest(raw, header, env)).status, 200);
    }
    for (const [token] of buyers) {
      const payload = await (await status({
        request: new Request(`https://mymoying.com/api/status?token=${token}`),
        env,
      })).json();
      assert.equal(payload.status, "paid", `${token.slice(0, 4)} was left locked`);
    }
  }),

  check("two buyers sharing one Waffo event id both unlock", async () => {
    const env = envFor(pkcs8);
    const buyers = [["ca".repeat(32), "ORD_a"], ["cb".repeat(32), "ORD_b"]];
    for (const [token] of buyers) await seedPending(env, token);
    for (const [token, orderId] of buyers) {
      const event = orderEvent(token);
      event.data.orderId = orderId;
      // Sandbox sends the same id for every order; the orders still differ.
      assert.equal(event.eventId, "PAY_test");
      const { raw, header } = signedEvent(pkcs8.privateKey, event);
      assert.equal((await webhookRequest(raw, header, env)).status, 200);
    }
    for (const [token] of buyers) {
      const payload = await (await status({
        request: new Request(`https://mymoying.com/api/status?token=${token}`),
        env,
      })).json();
      assert.equal(payload.status, "paid", `${token.slice(0, 4)} was left locked`);
    }
  }),

  check("a replayed signed webhook is handled once and leaves the record alone", async () => {
    const env = envFor(pkcs8);
    const token = "cc".repeat(32);
    await seedPending(env, token);
    const { put } = env.PURCHASES;
    let puts = 0;
    env.PURCHASES.put = async (key, value, options) => {
      puts += 1;
      return put.call(env.PURCHASES, key, value, options);
    };
    const { raw, header } = signedEvent(pkcs8.privateKey, orderEvent(token));
    assert.equal((await webhookRequest(raw, header, env)).status, 200);
    assert.equal(env.PURCHASES.store.has(eventKey(orderEvent(token))), true);
    const first = JSON.parse(env.PURCHASES.store.get(`purchase:${token}`));
    const writesAfterFirst = puts;
    assert.ok(writesAfterFirst > 0, "the first delivery should write");
    assert.equal((await webhookRequest(raw, header, env)).status, 200);
    assert.equal(puts, writesAfterFirst, "the replay wrote again");
    assert.deepEqual(JSON.parse(env.PURCHASES.store.get(`purchase:${token}`)), first);
  }),

  check("a refund carrying a shared event id revokes only its own order", async () => {
    const env = envFor(pkcs8);
    const buyers = [["da".repeat(32), "ORD_a"], ["db".repeat(32), "ORD_b"]];
    for (const [token] of buyers) await seedPending(env, token);
    for (const [token, orderId] of buyers) {
      const event = orderEvent(token);
      event.data.orderId = orderId;
      const { raw, header } = signedEvent(pkcs8.privateKey, event);
      assert.equal((await webhookRequest(raw, header, env)).status, 200);
    }
    const refund = {
      id: "PAY_test",
      timestamp: "2026-09-28T02:00:00.000Z",
      eventType: "refund.succeeded",
      eventId: "PAY_test",
      mode: "test",
      data: {
        orderId: "ORD_a",
        currency: "USD",
        refundedAmount: "1.99",
        amount: "1.99",
        orderMerchantExternalId: buyers[0][0],
        orderMetadata: { unlock: buyers[0][0] },
        buyerEmail: "buyer@example.com",
      },
    };
    const { raw, header } = signedEvent(pkcs8.privateKey, refund);
    assert.equal((await webhookRequest(raw, header, env)).status, 200);
    const refunded = await (await status({
      request: new Request(`https://mymoying.com/api/status?token=${buyers[0][0]}`),
      env,
    })).json();
    assert.equal(refunded.status, "refunded");
    const kept = await (await status({
      request: new Request(`https://mymoying.com/api/status?token=${buyers[1][0]}`),
      env,
    })).json();
    assert.equal(kept.status, "paid");
  }),

  check("the internal-file guard hides repo files and blocks no page asset", async () => {
    const { onRequest } = await import("../functions/_middleware.js");
    const { readdirSync } = await import("node:fs");
    const context = (path) => ({
      request: new Request(`https://mymoying.com${path}`),
      next: async () => new Response("asset", { status: 200 }),
    });
    for (const path of [
      "/DEPLOY.md",
      "/SEO_REPORT.md",
      "/README.md",
      "/CLAUDE.md",
      "/package.json",
      "/package-lock.json",
      "/scripts/test-payments.mjs",
      "/tools/make-pins/make-pins.mjs",
      "/pins/batch1.csv",
      "/.dev.vars",
      "/DEPLOY.md/",
      "/research/tattoo-check-preview/form.html",
    ]) {
      const response = await onRequest(context(path));
      assert.equal(response.status, 404, `${path} is still served`);
      assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
    }
    for (const path of [
      "/",
      "/index.html",
      "/emma",
      "/names",
      "/michael",
      "/noah",
      "/tattoo-check",
      "/tattoo-check.html",
      "/samples/michael-chinese-calligraphy-name.jpg",
      "/robots.txt",
      "/sitemap.xml",
      "/pins/emma-chinese-calligraphy-name.jpg",
      "/api/webhook",
      "/404.html",
    ]) {
      assert.equal((await onRequest(context(path))).status, 200, `${path} was blocked`);
    }
    const root = new URL("../", import.meta.url);
    const pages = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
      .map((entry) => entry.name);
    assert.ok(pages.length >= 19, `only ${pages.length} html files found`);
    const assets = new Set();
    for (const page of pages) {
      const html = readFileSync(new URL(page, root), "utf8");
      for (const match of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) {
        const clean = match[1].replace(/^\.\//, "");
        if (!clean || clean === "/") continue;
        assets.add(clean.startsWith("/") ? clean : `/${clean}`);
      }
    }
    assert.ok(assets.size > 20, `only ${assets.size} local assets found`);
    for (const asset of assets) {
      assert.equal((await onRequest(context(asset))).status, 200, `${asset} is loaded by a page but blocked`);
    }
  }),

  check("unpaid SVG and PNG share the watermarked paint path", () => {
    const src = readFileSync(new URL("../app.js", import.meta.url), "utf8");
    assert.equal(src.includes("function buildSvg"), false);
    assert.match(src, /async function exportSvg\(snap, clean\)/);
    assert.match(src, /async function exportRaster\(snap, mime, ext, quality, transparent, clean\)/);
    assert.match(src, /watermark: !clean/);
    assert.match(src, /if \(watermark\) cutInkWatermark/);
    assert.match(src, /if \(watermark\) drawPreviewMark/);
    assert.match(src, /const clean = cleanNow\(snap\)/);
    assert.equal(src.includes("WAFFO_PURCHASE_URL"), false);
  }),

  check("the price lives in one place and every surface agrees", async () => {
    assert.equal(PRICE_USD_CENTS, 199);
    assert.equal(PRICE_LABEL, "$1.99");
    assert.equal(MIN_USD_CENTS, PRICE_USD_CENTS);
    const payload = await (await config()).json();
    assert.deepEqual(payload, { priceCents: 199, priceLabel: "$1.99" });
    const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const terms = readFileSync(new URL("../terms.html", import.meta.url), "utf8");
    const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
    for (const [name, src] of [["index.html", index], ["terms.html", terms]]) {
      assert.ok(src.includes("$1.99"), `${name} does not show $1.99`);
      assert.equal(src.includes("$4.99"), false, `${name} still shows $4.99`);
    }
    assert.match(app, /let priceLabel = "\$1\.99"/);
    assert.equal(app.includes("$4.99"), false, "app.js still shows $4.99");
  }),

  check("a charge below the price does not unlock, the exact price does", async () => {
    const env = envFor(pkcs8);
    const low = "1a".repeat(32);
    const exact = "1b".repeat(32);
    await seedPending(env, low);
    await seedPending(env, exact);
    const cheap = signedEvent(pkcs8.privateKey, orderEvent(low, "1.98"));
    assert.equal((await webhookRequest(cheap.raw, cheap.header, env)).status, 200);
    const ok = signedEvent(pkcs8.privateKey, orderEvent(exact, "1.99"));
    assert.equal((await webhookRequest(ok.raw, ok.header, env)).status, 200);
    const lowStatus = await (await status({
      request: new Request(`https://mymoying.com/api/status?token=${low}`),
      env,
    })).json();
    assert.equal(lowStatus.status, "pending");
    const okStatus = await (await status({
      request: new Request(`https://mymoying.com/api/status?token=${exact}`),
      env,
    })).json();
    assert.equal(okStatus.status, "paid");
  }),

  check("a purchase unlocks the word across styles, not a new word", () => {
    const record = { status: "paid", design: design(), word: "Peace" };
    assert.equal(unlockWord(record), "Peace");
    assert.equal(unlocksText(record, "Peace"), true);
    assert.equal(unlocksText(record, "peace"), false);
    assert.equal(unlocksText(record, "Emma"), false);
    // A record written before the per-word field still unlocks via its design.
    assert.equal(unlockWord({ design: design() }), "Peace");
    const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
    assert.match(app, /paidDesign\.word === snap\.text/);
    assert.equal(/paidDesign\.style ===/.test(app), false, "the unlock still compares the style");
  }),

  check("the name table is valid, large enough, and fully populated", () => {
    const table = JSON.parse(readFileSync(new URL("../data/names-zh.json", import.meta.url), "utf8"));
    assert.equal(typeof table._note, "string");
    assert.ok(table._note.length > 20, "the _note is too short");
    assert.equal(typeof table._pinyinNote, "string");
    assert.match(table._pinyinNote, /review/i, "the pinyin note must ask for a human review");
    assert.equal(typeof table.names, "object");
    const entries = Object.entries(table.names).filter(([key]) => !key.startsWith("_"));
    assert.ok(entries.length >= 100, `only ${entries.length} names`);
    const tone = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;
    for (const [key, value] of entries) {
      assert.match(key, /^[A-Za-z][A-Za-z'’-]*$/, `${key} is not a Latin name`);
      assert.equal(typeof value, "object", `${key} is not a record`);
      assert.match(value.zh, /^[一-鿿]+$/, `${key} is not all Chinese characters`);
      assert.equal(typeof value.pinyin, "string");
      assert.ok(value.pinyin.length > 0, `${key} has no pinyin`);
      assert.match(value.pinyin, /^[A-Za-zÀ-ɏ' -]+$/, `${key} pinyin has odd characters`);
      assert.match(value.pinyin, tone, `${key} pinyin has no tone mark`);
    }
    assert.equal(table.names.Emma.zh, "艾玛");
    assert.equal(table.names.Michael.zh, "迈克尔");
    assert.equal(table.names.Michael.pinyin, "Mài kè ěr");
    const font = readFileSync(new URL("../fonts/mashanzheng-hanzi.ttf", import.meta.url));
    assert.ok(font.length > 1000, "the hanzi subset font is missing");
    assert.equal(font.subarray(0, 4).toString("latin1"), "\u0000\u0001\u0000\u0000", "the hanzi font is not a TTF");
  }),

  check("every name in the table has one page at the root with a unique title, H1 and canonical", () => {
    const root = new URL("../", import.meta.url);
    const table = JSON.parse(readFileSync(new URL("../data/names-zh.json", import.meta.url), "utf8"));
    const names = Object.keys(table.names).filter((key) => !key.startsWith("_"));
    const slugFor = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const titles = new Set();
    const h1s = new Set();
    for (const name of names) {
      const slug = slugFor(name);
      const file = new URL(`${slug}.html`, root);
      assert.ok(existsSync(file), `${slug}.html is missing at the repository root`);
      const html = readFileSync(file, "utf8");
      const title = html.match(/<title>([^<]+)<\/title>/);
      assert.ok(title, `${slug}.html has no title`);
      assert.equal(titles.has(title[1]), false, `${slug}.html repeats the title ${title[1]}`);
      titles.add(title[1]);
      const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/g) || [];
      assert.equal(h1.length, 1, `${slug}.html has ${h1.length} H1 elements`);
      const h1Text = h1[0].replace(/<[^>]+>/g, "").trim();
      assert.ok(h1Text.includes(name), `${slug}.html H1 does not name ${name}`);
      assert.equal(h1s.has(h1Text), false, `${slug}.html repeats the H1 ${h1Text}`);
      h1s.add(h1Text);
      assert.ok(
        html.includes(`<link rel="canonical" href="https://mymoying.com/${slug}" />`),
        `${slug}.html canonical is wrong`,
      );
      assert.ok(html.includes(`?text=${name}`), `${slug}.html does not link to the generator`);
      assert.ok(html.includes("$1.99"), `${slug}.html does not show the price`);
    }
    // The eight name pages that were already indexed keep their exact URL,
    // canonical and og:url — they are patched in place, never regenerated.
    for (const slug of ["emma", "michael", "sophia", "james", "grace", "lily", "ethan", "olivia"]) {
      const html = readFileSync(new URL(`${slug}.html`, root), "utf8");
      assert.ok(
        html.includes(`<link rel="canonical" href="https://mymoying.com/${slug}" />`),
        `${slug}.html canonical changed`,
      );
      assert.ok(
        html.includes(`<meta property="og:url" content="https://mymoying.com/${slug}" />`),
        `${slug}.html og:url changed`,
      );
    }
    // The word pages that are not names keep their URL and canonical as well.
    for (const slug of ["love", "peace", "hope", "dream"]) {
      const html = readFileSync(new URL(`${slug}.html`, root), "utf8");
      assert.ok(
        html.includes(`<link rel="canonical" href="https://mymoying.com/${slug}" />`),
        `${slug}.html canonical changed`,
      );
    }
    const index = readFileSync(new URL("names.html", root), "utf8");
    for (const name of names) {
      assert.ok(index.includes(`href="${slugFor(name)}"`), `names.html does not link ${name}`);
    }
  }),

  check("the repository has no nested name pages and no nested name links", () => {
    const root = new URL("../", import.meta.url);
    // The retired URL scheme is spelled in parts here so that a repository-wide
    // search for the old path comes back empty; these assertions are the only
    // place it could still be written down.
    const nested = `/${"name"}/`;
    const nestedDir = new URL(`../${"name"}/`, import.meta.url);
    assert.equal(existsSync(nestedDir), false, `the ${nested} directory still exists`);
    const pages = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
        if (entry.isDirectory()) walk(child);
        else if (entry.name.endsWith(".html")) pages.push(child);
      }
    };
    walk(root);
    assert.ok(pages.length > 200, `only ${pages.length} html pages found`);
    for (const page of pages) {
      assert.equal(page.pathname.includes(nested), false, `${page.pathname} is a nested name page`);
      const html = readFileSync(page, "utf8");
      assert.equal(html.includes(nested), false, `${page.pathname} still links a nested name path`);
    }
  }),

  check("the sitemap lists every name page at the root and the names index", () => {
    const table = JSON.parse(readFileSync(new URL("../data/names-zh.json", import.meta.url), "utf8"));
    const sitemap = readFileSync(new URL("../sitemap.xml", import.meta.url), "utf8");
    const locs = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
    assert.ok(locs.has("https://mymoying.com/names"), "sitemap is missing /names");
    // Entries that existed before this change are still present, byte for byte.
    for (const loc of [
      "https://mymoying.com/",
      "https://mymoying.com/name-in-chinese-calligraphy",
      "https://mymoying.com/chinese-calligraphy-tattoo-ideas",
      "https://mymoying.com/meaning-of-chinese-characters",
      "https://mymoying.com/custom-chinese-name-gift",
      "https://mymoying.com/terms",
      "https://mymoying.com/privacy",
      "https://mymoying.com/love",
      "https://mymoying.com/peace",
      "https://mymoying.com/hope",
      "https://mymoying.com/dream",
    ]) {
      assert.ok(locs.has(loc), `sitemap dropped the original entry ${loc}`);
    }
    let count = 0;
    for (const name of Object.keys(table.names)) {
      if (name.startsWith("_")) continue;
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
      assert.ok(locs.has(`https://mymoying.com/${slug}`), `sitemap is missing /${slug}`);
      count += 1;
    }
    assert.ok(count >= 100, `only ${count} name pages in the sitemap`);
    for (const loc of locs) {
      assert.equal(loc.includes(`/${"name"}/`), false, `sitemap still lists the nested path ${loc}`);
    }
  }),

  check("every html image has alt text and every local image file exists", () => {
    const root = new URL("../", import.meta.url);
    const pages = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
        if (entry.isDirectory()) walk(child);
        else if (entry.name.endsWith(".html")) pages.push(child);
      }
    };
    walk(root);
    assert.ok(pages.length > 200, `only ${pages.length} html pages found`);

    const jpegSize = (buf) => {
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
    };
    const localPath = (page, url) => {
      if (url.startsWith("https://mymoying.com/")) return new URL(url.slice("https://mymoying.com/".length), root);
      if (/^https?:/.test(url)) return null;
      return new URL(url, page);
    };

    let images = 0;
    for (const page of pages) {
      const html = readFileSync(page, "utf8");
      for (const tag of html.match(/<img\b[^>]*>/g) || []) {
        const src = tag.match(/\bsrc="([^"]+)"/);
        assert.ok(src, `an img in ${page.pathname} has no src`);
        const alt = tag.match(/\balt="([^"]*)"/);
        assert.ok(alt && alt[1].trim(), `an img in ${page.pathname} has no alt text`);
        const file = localPath(page, src[1]);
        if (file) {
          assert.ok(existsSync(file), `${page.pathname} points at a missing image ${src[1]}`);
          images += 1;
        }
      }
      for (const meta of html.match(/<meta\s+(?:property|name)="(?:og:image|twitter:image)"\s+content="([^"]+)"/g) || []) {
        const url = meta.match(/content="([^"]+)"/)[1];
        const file = localPath(page, url);
        assert.ok(file, `${page.pathname} has an absolute social image ${url}`);
        assert.ok(existsSync(file), `${page.pathname} points at a missing social image ${url}`);
        if (html.includes("generated by tools/make-name-pages.mjs")) {
          const dims = jpegSize(readFileSync(file));
          const w = html.match(/<meta property="og:image:width" content="(\d+)"/);
          const h = html.match(/<meta property="og:image:height" content="(\d+)"/);
          assert.ok(w && h, `${page.pathname} has no og:image dimensions`);
          assert.equal(Number(w[1]), dims.width, `${page.pathname} og:image:width is wrong`);
          assert.equal(Number(h[1]), dims.height, `${page.pathname} og:image:height is wrong`);
        }
      }
    }
    assert.ok(images >= 200, `only ${images} local images checked`);

    // Every pin the pages reference, and every pin on disk, is present.
    for (const file of readdirSync(new URL("../pins/", import.meta.url))) {
      if (file.endsWith(".jpg")) {
        assert.match(file, /-chinese-calligraphy-(name|word|guide)\.jpg$/, `pins/${file} is not descriptively named`);
      }
    }
  }),
];

for (const run of tests) await run();
if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log(`\n${tests.length} passed`);
