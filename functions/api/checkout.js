import { canonicalDesign } from "../lib/design.js";
import { json } from "../lib/http.js";
import { isToken, purchaseKey, randomToken, writePurchase } from "../lib/purchases.js";
import { createCheckoutSession, paymentsConfigured, successOrigin } from "../lib/waffo.js";

const PENDING_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function onRequestPost({ request, env }) {
  if (!paymentsConfigured(env)) return json({ error: "payments_unavailable" }, 503);

  let bodyText = "";
  try {
    bodyText = await request.text();
  } catch (_) {
    return json({ error: "bad_request" }, 400);
  }
  if (bodyText.length > 4000) return json({ error: "bad_request" }, 400);

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch (_) {
    return json({ error: "bad_request" }, 400);
  }

  const design = canonicalDesign(body && body.design);
  if (!design) return json({ error: "bad_design" }, 400);

  const origin = successOrigin(request, env);
  if (!origin) return json({ error: "payments_unavailable" }, 503);

  const token = randomToken();
  if (!isToken(token)) return json({ error: "payments_unavailable" }, 503);

  const record = {
    status: "pending",
    design,
    orderId: null,
    createdAt: new Date().toISOString(),
  };
  await writePurchase(env, token, record, { expirationTtl: PENDING_TTL_SECONDS });

  const successUrl = `${origin}/?unlock=${token}`;
  let result;
  try {
    result = await createCheckoutSession(env, { token, successUrl });
  } catch (_) {
    console.error("waffo checkout request failed");
    await env.PURCHASES.delete(purchaseKey(token));
    return json({ error: "checkout_failed" }, 502);
  }

  const checkoutUrl = result.payload && result.payload.data && result.payload.data.checkoutUrl;
  if (!result.ok || typeof checkoutUrl !== "string" || !checkoutUrl.startsWith("https://")) {
    const reason = result.payload && result.payload.errors && result.payload.errors[0] && result.payload.errors[0].message;
    console.error("waffo checkout rejected", result.status, reason || "");
    await env.PURCHASES.delete(purchaseKey(token));
    return json({ error: "checkout_failed" }, 502);
  }

  return json({ token, checkoutUrl });
}
