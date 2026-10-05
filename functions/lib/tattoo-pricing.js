// Tattoo-check product. Separate from the $1.99 watermark unlock in pricing.js.
// The Waffo product (WAFFO_TATTOO_PRODUCT_ID) must be priced to match: the checkout
// session does not send an amount, so Waffo charges whatever the dashboard product says.
// A charge below TATTOO_PRICE_USD_CENTS is rejected by the webhook for kind tattoo-check.
export const TATTOO_PRICE_USD_CENTS = 900;
export const TATTOO_PRICE_LABEL = "$9";
export const TATTOO_KIND = "tattoo-check";
