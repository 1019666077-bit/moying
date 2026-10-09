import { json } from "../lib/http.js";
import { TATTOO_PRICE_LABEL, TATTOO_PRICE_USD_CENTS } from "../lib/tattoo-pricing.js";

// Public price source for the tattoo-check page.
export async function onRequestGet() {
  return json({
    kind: "tattoo-check",
    priceCents: TATTOO_PRICE_USD_CENTS,
    priceLabel: TATTOO_PRICE_LABEL,
  });
}
