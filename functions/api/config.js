import { json } from "../lib/http.js";
import { PRICE_LABEL, PRICE_USD_CENTS } from "../lib/pricing.js";

// Public price source so the front end never hardcodes a second copy.
export async function onRequestGet() {
  return json({ priceCents: PRICE_USD_CENTS, priceLabel: PRICE_LABEL });
}
