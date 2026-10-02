// Single source of truth for the price.
// The Waffo product (WAFFO_PRODUCT_ID) must be priced to match: the checkout
// session does not carry an amount, so Waffo charges whatever the dashboard
// product says. A charge below PRICE_USD_CENTS is rejected by the webhook.
export const PRICE_USD_CENTS = 199;
export const PRICE_LABEL = "$1.99";
