# Deploy payments

The site is static files plus three Pages Functions. Cloudflare Pages serves `main` with no build step and the output directory set to the repo root. Leave the build command empty. `package.json` is only for local `npm run dev` and `npm run test:payments`. Functions deploy from `/functions` automatically.

Nothing in this repo is a secret. Create the keys in Waffo, then put them in the Cloudflare Pages project.

## How a purchase is tied to a design

1. The browser `POST`s the current design to `/api/checkout`.
2. The function makes a random 256-bit token, stores it in KV as pending, and calls Waffo's Checkout API (`POST /v1/actions/checkout/create-session`) with the API-key signature. The token is sent as `orderMerchantExternalId` and as `metadata.unlock`. `successUrl` is `https://<this-host>/?unlock=<token>`. The price is the $1.99 product. The browser cannot set it.
3. Waffo `POST`s `/api/webhook`. The function checks `X-Waffo-Signature` (`t=<ms>,v1=<base64>` over `t + "." + raw body`, RSA-SHA256, 45-minute window) with that environment's webhook public key. `order.completed` marks the token paid only when the currency is USD and the charged amount is at least $1.99, and only if this server created the token. `refund.succeeded` revokes it.
4. The browser polls `/api/status?token=...`. A paid token returns the design it was bought for. The page then draws a clean 1800×2400 export. There is no URL that returns image bytes. An unpaid token, a missing token, or a forged webhook does not unlock anything.

The artwork is still drawn in the browser. The check stops someone from unlocking a download by editing the address bar or calling an endpoint. It is not a DRM wrapper around the page's JavaScript.

KV binding name: **`PURCHASES`**.

Keys:

| Key | Value |
| --- | --- |
| `purchase:<token>` | JSON: `pending`, `paid`, or `refunded`, plus the design, order id, and the buyer email from the webhook |
| `revoked:<token>` | Set on `refund.succeeded` so a late `order.completed` cannot turn the unlock back on |
| `event:<eventType>:<eventId>` | Dedupes webhook retries for 30 days |

Pending rows expire after 7 days. Paid rows stay until a refund.

## Cloudflare

In the Pages project → Settings → Variables and Secrets, for the **Production** environment (and Preview too, if you test on `*.pages.dev`):

| Name | Secret? | Value |
| --- | --- | --- |
| `WAFFO_MODE` | No | `test` or `prod`. Must match the key and the webhook public key below. |
| `WAFFO_MERCHANT_ID` | Yes | Dashboard → API & Development → Merchant ID. |
| `WAFFO_PRIVATE_KEY` | Yes | PEM private key downloaded when you create the API key. Test and live keys are different. Paste the PEM, or one line with `\n` between lines. |
| `WAFFO_WEBHOOK_PUBLIC_KEY` | Yes | Webhook public key for the **same** mode. Dashboard → Settings → Webhooks → copy the Public Key for Test or Live. |
| `WAFFO_PRODUCT_ID` | Yes | The $1.99 one-time product id (`PROD_...`) in that same mode. Products → open the product. |
| `PUBLIC_SITE_URL` | No | Optional. Example: `https://mymoying.com`. Leave it unset in production. The function uses the request's https origin, so `mymoying.com` and your `pages.dev` host each return to themselves. Set this only if the function is not served on the https host you want buyers to land on. |

Bindings → KV namespace → variable name exactly `PURCHASES`. Create a namespace (for example `moying-purchases`) and bind it.

Start with `WAFFO_MODE=test` and the test key, test product id, and test webhook public key. Run the check below. Then switch all four to the live values together. A test key will not verify live webhooks, and the live public key will not verify test webhooks.

`CNAME` stays in the repo. Cloudflare Pages does not use it for the custom domain; it is only a static file and is harmless.

## Waffo

1. Dashboard → API & Development → API Keys → Create. Choose Test (or Production when you go live). Download the private key. It is shown once.
2. Copy the Merchant ID from that same page.
3. Copy the $1.99 product id in that same mode.
4. Settings → Webhooks. Add an endpoint with format **Raw** (only Raw is RSA-signed). Subscribe to `order.completed` and `refund.succeeded`.

Webhook URLs, one per environment:

- Production site: `https://mymoying.com/api/webhook`
- Pages hostname: `https://<project>.pages.dev/api/webhook` (copy the hostname from the Pages project)

Register the test URL while the Cloudflare variables are test, and the live URL when they are live. Each environment has its own public key. Copy that key into `WAFFO_WEBHOOK_PUBLIC_KEY`.

The session sets its own success URL. You do not need to put the token on the product's purchase link. A plain purchase link still returns with no query string, which is why the button does not use it.

The cashier does not redirect by itself. After a successful test payment the buyer clicks Done, which opens `successUrl`. The token is also saved in the browser before the redirect, so a return without the query string still polls.

## Test mode end to end

1. Set the Production (or Preview) variables to test values, bind `PURCHASES`, and deploy `main`.
2. Register `https://mymoying.com/api/webhook` (or the pages.dev URL you are actually using) as the **Test** Raw webhook.
3. Open the site, set a word, click **Remove watermark · $1.99**. You should land on the sandbox cashier (`cashier-sandbox.waffo.com`).
4. Pay with `4576 7500 0000 0110`, any future expiry, any 3-digit CVC. A decline card is `4576 7500 0000 0220` (you stay on the cashier, and the design stays watermarked).
5. Click Done. The page should say the watermark is removed. Export PNG and SVG: both are 1800×2400, and neither image shows the “mymoying.com preview” label. Change the word: the watermark comes back, and “Show the paid design” restores the one you paid for.
6. In the Waffo dashboard, refund that test order. Reload the page. The unlock is gone.

Dashboard → Webhooks → Send test event only checks that the URL accepts a signed request (the function returns `200`). That sample is amount 0 and has no purchase token, so it will not unlock a download. Use the card for the real check.

Local functions, without a deploy:

```bash
cp .dev.vars.example .dev.vars
# fill in test values
npm install
npm run dev
```

`npm run test:payments` checks signing, webhook verification, the paid/refund rules, and that unpaid calls do not unlock. It does not call Waffo.

`python3 -m http.server` has no Functions. The pay button then says payments are unavailable, and free downloads still work.
