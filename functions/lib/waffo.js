// Waffo Pancake request signing and webhook verification.
// Checkout: https://docs.waffo.ai/api-reference/authentication
//   canonical = METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + SHA256_BASE64(BODY)
//   X-Signature = Base64(RSA-SHA256(canonical, privateKey))
// Webhooks: https://docs.waffo.ai/api-reference/webhooks
//   header X-Waffo-Signature: t=<unix-ms>,v1=<base64>
//   signed input: `${t}.${rawBody}` with RSA-SHA256 and the environment public key
//   t may be up to 45 minutes old because retries replay the original header.

const CHECKOUT_PATH = "/v1/actions/checkout/create-session";
const API_ORIGIN = "https://api.waffo.ai";
const WEBHOOK_TOLERANCE_MS = 45 * 60 * 1000;

export function paymentsConfigured(env) {
  return !!(
    env
    && env.PURCHASES
    && env.WAFFO_MERCHANT_ID
    && env.WAFFO_PRIVATE_KEY
    && env.WAFFO_WEBHOOK_PUBLIC_KEY
    && env.WAFFO_PRODUCT_ID
    && (env.WAFFO_MODE === "test" || env.WAFFO_MODE === "prod")
  );
}

// Tattoo-check reuses the same merchant/key/webhook/KV; it needs its own $9 product id.
// DeepSeek is required to deliver the report after payment (checked at report time too).
export function tattooPaymentsConfigured(env) {
  return !!(
    paymentsConfigured(env)
    && env.WAFFO_TATTOO_PRODUCT_ID
  );
}

export function normalizePem(value) {
  return String(value || "").replace(/\\n/g, "\n").replace(/\r/g, "").trim();
}

function pemToDer(pem) {
  const body = normalizePem(pem)
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s/g, "");
  return base64ToBytes(body);
}

export function base64ToBytes(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function derLen(length) {
  if (length < 0x80) return Uint8Array.of(length);
  const bytes = [];
  let rest = length;
  while (rest > 0) {
    bytes.unshift(rest & 0xff);
    rest >>= 8;
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function derWrap(tag, content) {
  const len = derLen(content.length);
  const out = new Uint8Array(1 + len.length + content.length);
  out[0] = tag;
  out.set(len, 1);
  out.set(content, 1 + len.length);
  return out;
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// Web Crypto imports PKCS#8. Dashboard downloads may be PKCS#1 ("BEGIN RSA PRIVATE KEY").
function wrapPkcs1Private(pkcs1) {
  const version = Uint8Array.of(0x02, 0x01, 0x00);
  const algorithm = Uint8Array.from([
    0x30, 0x0d,
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
    0x05, 0x00,
  ]);
  const privateKey = derWrap(0x04, pkcs1);
  return derWrap(0x30, concatBytes([version, algorithm, privateKey]));
}

async function importPrivateKey(pem) {
  const normalized = normalizePem(pem);
  const der = pemToDer(normalized);
  const pkcs8 = /BEGIN RSA PRIVATE KEY/.test(normalized) ? wrapPkcs1Private(der) : der;
  return crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function importPublicKey(pem) {
  return crypto.subtle.importKey(
    "spki",
    pemToDer(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

async function sha256Base64(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return bytesToBase64(new Uint8Array(digest));
}

export async function signRequest(privateKeyPem, method, path, timestamp, body) {
  const bodyHash = await sha256Base64(body);
  const canonical = `${method}\n${path}\n${timestamp}\n${bodyHash}`;
  const key = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(canonical),
  );
  return bytesToBase64(new Uint8Array(signature));
}

export function parseSignatureHeader(header) {
  const parts = {};
  for (const pair of String(header || "").split(",")) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    parts[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
  }
  return parts;
}

// Returns the parsed event, or null when the signature is missing or invalid.
// Throws if the public key itself cannot be imported.
export async function verifyWebhook(rawBody, signatureHeader, publicKeyPem, now = Date.now()) {
  const { t, v1 } = parseSignatureHeader(signatureHeader);
  if (!t || !v1 || !/^\d+$/.test(t)) return null;
  const stamped = Number(t);
  if (Math.abs(now - stamped) > WEBHOOK_TOLERANCE_MS) return null;
  let signatureBytes;
  try {
    signatureBytes = base64ToBytes(v1);
  } catch (_) {
    return null;
  }
  const key = await importPublicKey(publicKeyPem);
  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      signatureBytes,
      new TextEncoder().encode(`${t}.${rawBody}`),
    );
  } catch (_) {
    return null;
  }
  if (!ok) return null;
  try {
    return JSON.parse(rawBody);
  } catch (_) {
    return null;
  }
}

export function successOrigin(request, env) {
  const requestOrigin = new URL(request.url).origin;
  if (requestOrigin.startsWith("https://")) return requestOrigin;
  const configured = String(env.PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" && !url.username && !url.password) return url.origin;
    } catch (_) { /* ignore malformed override */ }
  }
  if (env.WAFFO_MODE === "test" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin)) {
    return requestOrigin;
  }
  return "";
}

export async function createCheckoutSession(env, {
  token,
  successUrl,
  productId = env.WAFFO_PRODUCT_ID,
  metadata = { unlock: token },
}) {
  const body = JSON.stringify({
    productId,
    productType: "onetime",
    currency: "USD",
    successUrl,
    metadata,
    orderMerchantExternalId: token,
    language: "en",
    expiresInSeconds: 2700,
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await signRequest(env.WAFFO_PRIVATE_KEY, "POST", CHECKOUT_PATH, timestamp, body);
  const response = await fetch(`${API_ORIGIN}${CHECKOUT_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-merchant-id": env.WAFFO_MERCHANT_ID,
      "x-timestamp": timestamp,
      "x-signature": signature,
    },
    body,
  });
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch (_) { payload = null; }
  return { ok: response.ok, status: response.status, payload };
}
