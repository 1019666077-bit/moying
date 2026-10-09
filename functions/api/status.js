import { json } from "../lib/http.js";
import { isToken, purchaseKind, readPurchase, revokedKey, unlockWord } from "../lib/purchases.js";

export async function onRequestGet({ request, env }) {
  if (!env || !env.PURCHASES) return json({ error: "payments_unavailable" }, 503);

  const token = new URL(request.url).searchParams.get("token") || "";
  if (!isToken(token)) return json({ error: "bad_token" }, 400);

  if (await env.PURCHASES.get(revokedKey(token))) return json({ status: "refunded" });

  const record = await readPurchase(env, token);
  // Tattoo-check purchases use /api/tattoo-status; do not treat them as watermark unlocks.
  if (!record || purchaseKind(record) === "tattoo-check") {
    return json({ status: "unknown" });
  }
  if (record.status !== "paid" && record.status !== "pending" && record.status !== "refunded") {
    return json({ status: "unknown" });
  }
  if (record.status === "refunded") return json({ status: "refunded" });
  return json({ status: record.status, design: record.design, word: unlockWord(record) });
}
