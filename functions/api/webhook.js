import { text } from "../lib/http.js";
import {
  MIN_USD_CENTS,
  eventKey,
  readPurchase,
  revokedKey,
  tokenFromEvent,
  usdCents,
  writePurchase,
} from "../lib/purchases.js";
import { verifyWebhook } from "../lib/waffo.js";

export async function onRequestPost({ request, env }) {
  if (!env || !env.PURCHASES || !env.WAFFO_WEBHOOK_PUBLIC_KEY) return text("not configured", 500);
  if (env.WAFFO_MODE !== "test" && env.WAFFO_MODE !== "prod") return text("not configured", 500);

  const raw = await request.text();
  if (raw.length > 100000) return text("payload too large", 413);

  let event;
  try {
    event = await verifyWebhook(raw, request.headers.get("x-waffo-signature"), env.WAFFO_WEBHOOK_PUBLIC_KEY);
  } catch (err) {
    console.error("webhook public key could not be imported");
    return text("not configured", 500);
  }
  if (!event || typeof event !== "object") return text("invalid signature", 401);
  if (event.mode !== env.WAFFO_MODE) return text("OK");

  const dedupe = eventKey(event);
  if (await env.PURCHASES.get(dedupe)) return text("OK");

  try {
    if (event.eventType === "order.completed") await grant(env, event);
    else if (event.eventType === "refund.succeeded") await revoke(env, event);
  } catch (err) {
    console.error("webhook handler failed", event.eventType);
    return text("retry", 500);
  }

  await env.PURCHASES.put(dedupe, "1", { expirationTtl: 30 * 24 * 60 * 60 });
  return text("OK");
}

async function grant(env, event) {
  const data = event.data || {};
  if (data.currency !== "USD") return;
  const charged = data.chargedAmount != null && data.chargedAmount !== ""
    ? data.chargedAmount
    : data.amount;
  const cents = usdCents(charged);
  if (cents == null || cents < MIN_USD_CENTS) return;

  const token = tokenFromEvent(data);
  if (!token) return;
  if (await env.PURCHASES.get(revokedKey(token))) return;

  const record = await readPurchase(env, token);
  if (!record || record.status === "refunded" || record.status === "paid") return;
  // Records written before the per-word unlock shipped only have the design.
  if (!record.word && record.design && typeof record.design.text === "string") record.word = record.design.text;

  record.status = "paid";
  record.orderId = typeof data.orderId === "string" ? data.orderId : null;
  record.paidAt = typeof event.timestamp === "string" ? event.timestamp : new Date().toISOString();
  if (typeof data.buyerEmail === "string" && data.buyerEmail) {
    record.buyerEmail = data.buyerEmail.slice(0, 200);
  }
  await writePurchase(env, token, record);
}

async function revoke(env, event) {
  const token = tokenFromEvent(event.data || {});
  if (!token) return;
  await env.PURCHASES.put(revokedKey(token), "1");
  const record = await readPurchase(env, token);
  if (!record) return;
  record.status = "refunded";
  record.refundedAt = typeof event.timestamp === "string" ? event.timestamp : new Date().toISOString();
  await writePurchase(env, token, record);
}
