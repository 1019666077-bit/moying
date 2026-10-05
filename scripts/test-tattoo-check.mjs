import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { onRequestPost as tattooCheckout } from "../functions/api/tattoo-checkout.js";
import { onRequestGet as tattooStatus } from "../functions/api/tattoo-status.js";
import { onRequestGet as tattooConfig } from "../functions/api/tattoo-config.js";
import { onRequestGet as unlockStatus } from "../functions/api/status.js";
import { onRequestPost as webhook } from "../functions/api/webhook.js";
import {
  looksLikeOkVerdict,
  normalizeTattooInput,
  parseTattooReport,
  VERDICT_PROBLEMS,
  VERDICT_UNCERTAIN,
} from "../functions/lib/tattoo-report.js";
import { TATTOO_KIND, TATTOO_PRICE_LABEL, TATTOO_PRICE_USD_CENTS } from "../functions/lib/tattoo-pricing.js";
import { PRICE_USD_CENTS } from "../functions/lib/pricing.js";

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
    async put(key, value, _opts) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

function pemPair() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return { privateKey, publicKey };
}

const keys = pemPair();

function envFor(extra = {}) {
  return {
    PURCHASES: mockKv(),
    WAFFO_MODE: "test",
    WAFFO_MERCHANT_ID: "MER_TEST",
    WAFFO_PRODUCT_ID: "PROD_watermark",
    WAFFO_TATTOO_PRODUCT_ID: "PROD_tattoo9",
    WAFFO_PRIVATE_KEY: keys.privateKey,
    WAFFO_WEBHOOK_PUBLIC_KEY: keys.publicKey,
    DEEPSEEK_API_KEY: "sk-test",
    ...extra,
  };
}

function signedEvent(privateKey, event, now = Date.now()) {
  const raw = JSON.stringify(event);
  const signer = createSign("RSA-SHA256");
  signer.update(`${now}.${raw}`);
  signer.end();
  const header = `t=${now},v1=${signer.sign(privateKey).toString("base64")}`;
  return { raw, header };
}

function orderEvent(token, amount, kind = TATTOO_KIND) {
  return {
    id: "PAY_tattoo",
    timestamp: "2026-10-05T00:00:00.000Z",
    eventType: "order.completed",
    eventId: "PAY_tattoo",
    storeId: "STO_test",
    mode: "test",
    data: {
      orderId: "ORD_tattoo",
      orderStatus: "completed",
      buyerEmail: "buyer@example.com",
      currency: "USD",
      chargedAmount: amount,
      amount,
      orderMetadata: { unlock: token, tattoo: token, kind },
      orderMerchantExternalId: token,
      productName: "Tattoo check",
      paymentId: "PAY_tattoo",
      paymentStatus: "succeeded",
    },
  };
}

async function seedTattooPending(env, token) {
  await env.PURCHASES.put(`purchase:${token}`, JSON.stringify({
    status: "pending",
    kind: TATTOO_KIND,
    chineseText: "免费",
    intendedMeaning: "free spirit",
    orderId: null,
    createdAt: "2026-10-05T00:00:00.000Z",
  }));
}

function mockDeepseek(content) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("api.deepseek.com")) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).includes("api.waffo.ai")) {
      return new Response(JSON.stringify({
        data: {
          sessionId: "cs_tattoo",
          checkoutUrl: "https://cashier-sandbox.waffo.com/store/checkout/cs_tattoo",
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return original(url, init);
  };
  return () => { globalThis.fetch = original; };
}

const tests = [
  check("config exposes the $9 tattoo price", async () => {
    const res = await tattooConfig();
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      kind: "tattoo-check",
      priceCents: TATTOO_PRICE_USD_CENTS,
      priceLabel: TATTOO_PRICE_LABEL,
    });
    assert.equal(TATTOO_PRICE_USD_CENTS, 900);
    assert.ok(TATTOO_PRICE_USD_CENTS > PRICE_USD_CENTS);
  }),

  check("normalizeTattooInput requires Chinese and rejects empty/latin-only", () => {
    assert.equal(normalizeTattooInput({ chineseText: "hello" }), null);
    assert.equal(normalizeTattooInput({ chineseText: "" }), null);
    assert.equal(normalizeTattooInput(null), null);
    const ok = normalizeTattooInput({ chineseText: "  免费  ", intendedMeaning: " free spirit " });
    assert.deepEqual(ok, { chineseText: "免费", intendedMeaning: "free spirit" });
  }),

  check("looksLikeOkVerdict catches approval wording", () => {
    assert.equal(looksLikeOkVerdict("OK to ink"), true);
    assert.equal(looksLikeOkVerdict("Safe to tattoo"), true);
    assert.equal(looksLikeOkVerdict("approved"), true);
    assert.equal(looksLikeOkVerdict("no problems"), true);
    assert.equal(looksLikeOkVerdict("all clear"), true);
    assert.equal(looksLikeOkVerdict("go ahead"), true);
    assert.equal(looksLikeOkVerdict("green light"), true);
    assert.equal(looksLikeOkVerdict(VERDICT_PROBLEMS), false);
    assert.equal(looksLikeOkVerdict(VERDICT_UNCERTAIN), false);
  }),

  check("parseTattooReport rejects OK verdicts and coerces to Uncertain", () => {
    const okish = parseTattooReport({
      verdict: "OK to ink",
      summary: "Looks good, safe to ink.",
      issues: [],
    }, { chineseText: "爱", intendedMeaning: "love" });
    assert.equal(okish.verdict, VERDICT_UNCERTAIN);
    assert.equal(looksLikeOkVerdict(okish.verdict), false);
    assert.ok(!/ok to ink|safe to ink|approved|all clear/i.test(okish.summary));

    const cleared = parseTattooReport({
      verdict: "All clear",
      summary: "No problems found. Go ahead.",
      issues: [],
    });
    assert.equal(cleared.verdict, VERDICT_UNCERTAIN);

    const approved = parseTattooReport(JSON.stringify({
      verdict: "Approved",
      summary: "Green light",
      issues: [{ problem: "none", nativeReading: "fine" }],
    }));
    assert.equal(approved.verdict, VERDICT_UNCERTAIN);
  }),

  check("parseTattooReport keeps Problems found with issues and never labels alternatives OK", () => {
    const report = parseTattooReport({
      verdict: "Problems found",
      summary: "Wrong character for the intent.",
      issues: [{
        problem: "免费 means free of charge",
        nativeReading: "A Chinese reader may read this as 'complimentary / no cost', not 'free spirit'.",
      }],
      alternatives: [{
        text: "自由",
        note: "OK to ink this instead",
      }],
    }, { chineseText: "免费", intendedMeaning: "free spirit" });
    assert.equal(report.verdict, VERDICT_PROBLEMS);
    assert.equal(report.issues.length, 1);
    assert.equal(report.alternatives.length, 1);
    assert.equal(report.alternatives[0].text, "自由");
    assert.equal(looksLikeOkVerdict(report.alternatives[0].note), false);
    assert.match(report.alternatives[0].note, /not approval/i);
    assert.match(report.disclaimer, /not liable/i);
  }),

  check("Problems found without issues becomes Uncertain", () => {
    const report = parseTattooReport({
      verdict: "Problems found",
      summary: "Nothing specific",
      issues: [],
    });
    assert.equal(report.verdict, VERDICT_UNCERTAIN);
  }),

  check("tattoo checkout uses the $9 product and stores kind tattoo-check", async () => {
    const env = envFor();
    const restore = mockDeepseek({});
    try {
      const response = await tattooCheckout({
        request: new Request("https://mymoying.com/api/tattoo-checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chineseText: "母牛", intendedMeaning: "strength" }),
        }),
        env,
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.match(body.token, /^[a-f0-9]{64}$/);
      assert.match(body.checkoutUrl, /^https:\/\/cashier-sandbox\.waffo\.com\//);
      const stored = JSON.parse(env.PURCHASES.store.get(`purchase:${body.token}`));
      assert.equal(stored.kind, TATTOO_KIND);
      assert.equal(stored.chineseText, "母牛");
      assert.equal(stored.status, "pending");
    } finally {
      restore();
    }
  }),

  check("webhook grants tattoo-check only at >= $9 and stores a non-OK report", async () => {
    const env = envFor();
    const token = "ab".repeat(32);
    await seedTattooPending(env, token);
    const restore = mockDeepseek({
      verdict: "OK to ink",
      summary: "All clear, safe to ink.",
      issues: [],
    });
    try {
      const low = signedEvent(keys.privateKey, orderEvent(token, "1.99"));
      assert.equal((await webhook({
        request: new Request("https://mymoying.com/api/webhook", {
          method: "POST",
          headers: { "content-type": "application/json", "x-waffo-signature": low.header },
          body: low.raw,
        }),
        env,
      })).status, 200);
      assert.equal(JSON.parse(env.PURCHASES.store.get(`purchase:${token}`)).status, "pending");

      // Fresh dedupe: use a distinct event id / payment id for the $9 event.
      const paidEvent = orderEvent(token, "9.00");
      paidEvent.eventId = "PAY_tattoo_9";
      paidEvent.id = "PAY_tattoo_9";
      paidEvent.data.paymentId = "PAY_tattoo_9";
      paidEvent.data.orderId = "ORD_tattoo_9";
      const ok = signedEvent(keys.privateKey, paidEvent);
      assert.equal((await webhook({
        request: new Request("https://mymoying.com/api/webhook", {
          method: "POST",
          headers: { "content-type": "application/json", "x-waffo-signature": ok.header },
          body: ok.raw,
        }),
        env,
      })).status, 200);
      const record = JSON.parse(env.PURCHASES.store.get(`purchase:${token}`));
      assert.equal(record.status, "paid");
      assert.equal(record.kind, TATTOO_KIND);
      assert.ok(record.report);
      assert.equal(record.report.verdict, VERDICT_UNCERTAIN);
      assert.equal(looksLikeOkVerdict(record.report.verdict), false);
    } finally {
      restore();
    }
  }),

  check("watermark status ignores tattoo-check tokens", async () => {
    const env = envFor();
    const token = "cd".repeat(32);
    await env.PURCHASES.put(`purchase:${token}`, JSON.stringify({
      status: "paid",
      kind: TATTOO_KIND,
      chineseText: "爱",
      report: { verdict: VERDICT_UNCERTAIN, summary: "Ask a native speaker.", issues: [], alternatives: [] },
    }));
    const res = await unlockStatus({
      request: new Request(`https://mymoying.com/api/status?token=${token}`),
      env,
    });
    assert.deepEqual(await res.json(), { status: "unknown" });

    const tattoo = await tattooStatus({
      request: new Request(`https://mymoying.com/api/tattoo-status?token=${token}`),
      env,
    });
    const payload = await tattoo.json();
    assert.equal(payload.status, "paid");
    assert.equal(payload.kind, TATTOO_KIND);
    assert.equal(payload.report.verdict, VERDICT_UNCERTAIN);
  }),

  check("tattoo status returns pending without a report", async () => {
    const env = envFor();
    const token = "ef".repeat(32);
    await seedTattooPending(env, token);
    const res = await tattooStatus({
      request: new Request(`https://mymoying.com/api/tattoo-status?token=${token}`),
      env,
    });
    const payload = await res.json();
    assert.equal(payload.status, "pending");
    assert.equal(payload.chineseText, "免费");
    assert.equal(payload.report, undefined);
  }),
];

for (const test of tests) await test();
if (failed) {
  console.error(`\n${failed} tattoo-check test(s) failed`);
  process.exit(1);
}
console.log(`\n${tests.length} tattoo-check tests passed`);
