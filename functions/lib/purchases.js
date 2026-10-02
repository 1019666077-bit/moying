// $1.99 in cents. Tax may make the charged amount higher. A lower charge does not unlock.
export const MIN_USD_CENTS = 199;

const TOKEN_RE = /^[a-f0-9]{64}$/;

export function isToken(value) {
  return typeof value === "string" && TOKEN_RE.test(value);
}

export function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function purchaseKey(token) {
  return `purchase:${token}`;
}

export function revokedKey(token) {
  return `revoked:${token}`;
}

// Waffo's event id is not guaranteed unique across orders (sandbox events may all
// share `PAY_test`), so an id-only key would dedupe a second buyer's event against
// the first and swallow refunds. Always combine the event type with every
// per-order identifier present; only with none at all fall back to timestamp and
// body. A replayed body yields the same key; distinct orders yield distinct keys.
export function eventKey(event) {
  const source = event && typeof event === "object" ? event : {};
  const data = source.data && typeof source.data === "object" ? source.data : {};
  const parts = [
    source.eventId || source.id,
    data.orderId,
    data.paymentId,
    tokenFromEvent(data),
  ].filter((part) => typeof part === "string" && part);
  if (!parts.length) {
    parts.push(
      [source.timestamp, JSON.stringify(data)].filter((part) => typeof part === "string" && part).join(":"),
    );
  }
  return `event:${source.eventType}:${parts.join(":")}`;
}

export function tokenFromEvent(data) {
  if (!data || typeof data !== "object") return "";
  if (isToken(data.orderMerchantExternalId)) return data.orderMerchantExternalId;
  const meta = data.orderMetadata;
  if (meta && typeof meta === "object" && isToken(meta.unlock)) return meta.unlock;
  return "";
}

export function usdCents(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }
  if (typeof value !== "string") return null;
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return (Number(whole) * 100) + Number(fraction.padEnd(2, "0"));
}

export async function readPurchase(env, token) {
  const raw = await env.PURCHASES.get(purchaseKey(token));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

export async function writePurchase(env, token, record, options) {
  await env.PURCHASES.put(purchaseKey(token), JSON.stringify(record), options);
}
