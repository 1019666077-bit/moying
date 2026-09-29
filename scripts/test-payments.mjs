import { createSign, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { onRequestPost as checkout } from "../functions/api/checkout.js";
import { onRequestGet as status } from "../functions/api/status.js";
import { onRequestPost as webhook } from "../functions/api/webhook.js";
import { canonicalDesign } from "../functions/lib/design.js";
import { eventKey } from "../functions/lib/purchases.js";
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
    const sameId = (token) => {
      const event = withoutId(token, "ORD_three");
      event.eventId = "PAY_same";
      return event;
    };
    assert.equal(eventKey(sameId("9c".repeat(32))), eventKey(sameId("9d".repeat(32))));
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
    ]) {
      const response = await onRequest(context(path));
      assert.equal(response.status, 404, `${path} is still served`);
      assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
    }
    for (const path of ["/", "/index.html", "/emma", "/robots.txt", "/sitemap.xml", "/pins/emma.jpg", "/api/webhook", "/404.html"]) {
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
];

for (const run of tests) await run();
if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log(`\n${tests.length} passed`);
