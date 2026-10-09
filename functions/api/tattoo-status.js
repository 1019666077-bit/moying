import { json } from "../lib/http.js";
import { isToken, purchaseKind, readPurchase, revokedKey, writePurchase } from "../lib/purchases.js";
import { TATTOO_KIND, TATTOO_PRICE_LABEL } from "../lib/tattoo-pricing.js";
import { ensureTattooReport } from "../lib/tattoo-report.js";

export async function onRequestGet({ request, env }) {
  if (!env || !env.PURCHASES) return json({ error: "payments_unavailable" }, 503);

  const token = new URL(request.url).searchParams.get("token") || "";
  if (!isToken(token)) return json({ error: "bad_token" }, 400);

  if (await env.PURCHASES.get(revokedKey(token))) {
    return json({ status: "refunded", kind: TATTOO_KIND, priceLabel: TATTOO_PRICE_LABEL });
  }

  let record = await readPurchase(env, token);
  if (!record || purchaseKind(record) !== TATTOO_KIND) {
    return json({ status: "unknown", kind: TATTOO_KIND });
  }
  if (record.status !== "paid" && record.status !== "pending" && record.status !== "refunded") {
    return json({ status: "unknown", kind: TATTOO_KIND });
  }
  if (record.status === "refunded") {
    return json({ status: "refunded", kind: TATTOO_KIND, priceLabel: TATTOO_PRICE_LABEL });
  }
  if (record.status === "pending") {
    return json({
      status: "pending",
      kind: TATTOO_KIND,
      priceLabel: TATTOO_PRICE_LABEL,
      chineseText: record.chineseText || "",
      intendedMeaning: record.intendedMeaning || "",
    });
  }

  // Paid: generate the report on first poll if the webhook did not finish it.
  try {
    const before = record.report;
    record = await ensureTattooReport(env, record);
    if (!before && record.report) await writePurchase(env, token, record);
  } catch (err) {
    console.error("tattoo report generation failed");
  }

  return json({
    status: "paid",
    kind: TATTOO_KIND,
    priceLabel: TATTOO_PRICE_LABEL,
    chineseText: record.chineseText || "",
    intendedMeaning: record.intendedMeaning || "",
    report: record.report || null,
  });
}
