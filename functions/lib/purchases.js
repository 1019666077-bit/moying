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

// Waffo sends an id, but a missing one must not collapse the key to a bare
// `event:order.completed:`. That empty tail would make the first event of a type
// dedupe every later one for the whole 30-day window, so a second buyer would stay
// locked and refunds would be swallowed. Fall back to what the event is about.
export function eventKey(event) {
  const source = event && typeof event === "object" ? event : {};
  const explicit = source.eventId || source.id;
  if (typeof explicit === "string" && explicit) {
    return `event:${source.eventType}:${explicit}`;
  }
  const data = source.data && typeof source.data === "object" ? source.data : {};
  const parts = [
    data.orderId,
    data.paymentId,
    tokenFromEvent(data),
    source.timestamp,
  ].filter((part) => typeof part === "string" && part);
  // A replayed body keeps the same key. An event with nothing identifiable is
  // impossible in practice, but its body still has to keep two events apart.
  return `event:${source.eventType}:${parts.length ? parts.join(":") : JSON.stringify(data)}`;
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
