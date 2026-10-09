# Deploy payments

The site is static files plus Pages Functions. Cloudflare Pages serves `main` with no build step and the output directory set to the repo root. Leave the build command empty. `package.json` is only for local `npm run dev`, `npm run test:payments`, and `npm run test:tattoo`. Functions deploy from `/functions` automatically.

Nothing in this repo is a secret. Create the keys in Waffo (and DeepSeek for tattoo-check), then put them in the Cloudflare Pages project.

## How a purchase is tied to a design ($1.99 watermark)

1. The browser `POST`s the current design to `/api/checkout`.
2. The function makes a random 256-bit token, stores it in KV as pending, and calls Waffo's Checkout API (`POST /v1/actions/checkout/create-session`) with the API-key signature. The token is sent as `orderMerchantExternalId` and as `metadata.unlock`. `successUrl` is `https://<this-host>/?unlock=<token>`. The price is the $1.99 product (`WAFFO_PRODUCT_ID`). The browser cannot set it.
3. Waffo `POST`s `/api/webhook`. The function checks `X-Waffo-Signature` (`t=<ms>,v1=<base64>` over `t + "." + raw body`, RSA-SHA256, 45-minute window) with that environment's webhook public key. `order.completed` marks the token paid only when the currency is USD and the charged amount is at least $1.99, and only if this server created the token. `refund.succeeded` revokes it.
4. The browser polls `/api/status?token=...`. A paid token returns the design it was bought for. The page then draws a clean 1800×2400 export. There is no URL that returns image bytes. An unpaid token, a missing token, or a forged webhook does not unlock anything.

The artwork is still drawn in the browser. The check stops someone from unlocking a download by editing the address bar or calling an endpoint. It is not a DRM wrapper around the page's JavaScript.

## How a tattoo-check purchase works ($9)

Same merchant, private key, webhook public key, `WAFFO_MODE`, and **`PURCHASES`** KV. Distinct product id and KV `kind`.

1. The browser `POST`s `{ chineseText, intendedMeaning? }` to `/api/tattoo-checkout` (text only; no images).
2. The function stores a pending KV record with `kind: "tattoo-check"`, the pasted text, and optional English intent. Checkout uses `WAFFO_TATTOO_PRODUCT_ID` ($9). `successUrl` is `https://<this-host>/tattoo-check?report=<token>`. Metadata includes `unlock`, `tattoo`, and `kind: tattoo-check`.
3. On `order.completed`, the webhook marks the token paid only when USD charged amount is at least **$9** and the stored record is `kind: tattoo-check`. It then calls DeepSeek (`DEEPSEEK_API_KEY`, model `deepseek-chat`) and stores a structured report on the same KV record. If generation is slow or fails, `/api/tattoo-status` retries on poll.
4. The report page polls `/api/tattoo-status?token=...`. Verdicts are only **Problems found** or **Uncertain — ask a native speaker**. The parser rejects any “OK / safe to ink / approved / all clear” wording.

A tattoo-check token never unlocks a watermark download (`/api/status` ignores `kind: tattoo-check`). A $1.99 charge never pays a tattoo-check token (amount floor is $9 for that kind).

KV binding name: **`PURCHASES`** (one namespace for both products).

Keys:

| Key | Value |
| --- | --- |
| `purchase:<token>` | JSON: `pending`, `paid`, or `refunded`. Watermark rows have `design` / `word`. Tattoo-check rows have `kind: "tattoo-check"`, `chineseText`, optional `intendedMeaning`, and after payment `report`. Plus order id and buyer email from the webhook. |
| `revoked:<token>` | Set on `refund.succeeded` so a late `order.completed` cannot turn access back on |
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
| `WAFFO_TATTOO_PRODUCT_ID` | Yes | The **$9** one-time tattoo-check product id (`PROD_...`) in that same mode. Create a second product; do not reuse the $1.99 id. |
| `DEEPSEEK_API_KEY` | Yes | DeepSeek API key for report generation after tattoo-check payment. Never commit this key. |
| `PUBLIC_SITE_URL` | No | Optional. Example: `https://mymoying.com`. Leave it unset in production. The function uses the request's https origin, so `mymoying.com` and your `pages.dev` host each return to themselves. Set this only if the function is not served on the https host you want buyers to land on. |

Bindings → KV namespace → variable name exactly `PURCHASES`. Create a namespace (for example `moying-purchases`) and bind it. No second KV binding is required for tattoo-check.

### Preview environment first (tattoo-check)

Before Production:

1. In Cloudflare Pages → **Preview** variables, set the same Waffo **test** secrets as Production test, plus `WAFFO_TATTOO_PRODUCT_ID` (test $9 product) and `DEEPSEEK_API_KEY`.
2. Bind `PURCHASES` for Preview as well (same or separate test namespace).
3. Deploy this branch; open the branch preview URL (e.g. `https://cursor-tattoo-check-cbf8.moying-5aa.pages.dev/tattoo-check`).
4. Register the Preview webhook URL if it differs from Production: `https://<preview-host>/api/webhook` (Test / Raw).
5. Run the tattoo-check test-mode checkout below on Preview. Only then copy `WAFFO_TATTOO_PRODUCT_ID` and `DEEPSEEK_API_KEY` into Production (with live product id when you leave test mode).

Start with `WAFFO_MODE=test` and the test key, test product ids, and test webhook public key. Run the checks below. Then switch Waffo values to live together. A test key will not verify live webhooks, and the live public key will not verify test webhooks.

`CNAME` stays in the repo. Cloudflare Pages does not use it for the custom domain; it is only a static file and is harmless.

## Waffo

1. Dashboard → API & Development → API Keys → Create. Choose Test (or Production when you go live). Download the private key. It is shown once.
2. Copy the Merchant ID from that same page.
3. Copy the $1.99 product id in that same mode (`WAFFO_PRODUCT_ID`).
4. Create a **second** one-time product priced **$9.00 USD** (name e.g. “Chinese tattoo check report”). Copy its product id into `WAFFO_TATTOO_PRODUCT_ID`. Use a Test product while `WAFFO_MODE=test`.
5. Settings → Webhooks. Add an endpoint with format **Raw** (only Raw is RSA-signed). Subscribe to `order.completed` and `refund.succeeded`. The same webhook handles both products.

Webhook URLs, one per environment:

- Production site: `https://mymoying.com/api/webhook`
- Pages hostname: `https://<project>.pages.dev/api/webhook` (copy the hostname from the Pages project)

Register the test URL while the Cloudflare variables are test, and the live URL when they are live. Each environment has its own public key. Copy that key into `WAFFO_WEBHOOK_PUBLIC_KEY`.

The session sets its own success URL. You do not need to put the token on the product's purchase link. A plain purchase link still returns with no query string, which is why the button does not use it.

The cashier does not redirect by itself. After a successful test payment the buyer clicks Done, which opens `successUrl`. The token is also saved in the browser before the redirect, so a return without the query string still polls.

## Test mode end to end

### Watermark ($1.99)

1. Set the Production (or Preview) variables to test values, bind `PURCHASES`, and deploy `main`.
2. Register `https://mymoying.com/api/webhook` (or the pages.dev URL you are actually using) as the **Test** Raw webhook.
3. Open the site, set a word, click **Remove watermark · $1.99**. You should land on the sandbox cashier (`cashier-sandbox.waffo.com`).
4. Pay with `4576 7500 0000 0110`, any future expiry, any 3-digit CVC. A decline card is `4576 7500 0000 0220` (you stay on the cashier, and the design stays watermarked).
5. Click Done. The page should say the watermark is removed. Export PNG and SVG: both are 1800×2400, and neither image shows the “mymoying.com preview” label. Change the word: the watermark comes back, and “Show the paid design” restores the one you paid for.
6. In the Waffo dashboard, refund that test order. Reload the page. The unlock is gone.

### Tattoo-check ($9) — manual checkout steps

1. Confirm Preview (or Production test) has `WAFFO_TATTOO_PRODUCT_ID` (test $9 product), `DEEPSEEK_API_KEY`, and shared Waffo test secrets + `PURCHASES`.
2. Open `/tattoo-check`. Paste Chinese text (e.g. `免费` with intended meaning `free spirit`). Click **Check before you ink · $9**.
3. Pay on the sandbox cashier with `4576 7500 0000 0110`. Click Done.
4. You should land on `/tattoo-check?report=<token>` and see a report whose verdict is only **Problems found** or **Uncertain — ask a native speaker** — never OK / safe to ink.
5. Refund in the Waffo dashboard; reload the report link — status should be refunded.
6. Confirm a $1.99 watermark purchase still works on `/` (regression).

Dashboard → Webhooks → Send test event only checks that the URL accepts a signed request (the function returns `200`). That sample is amount 0 and has no purchase token, so it will not unlock a download or a report. Use the card for the real check.

Local functions, without a deploy:

```bash
cp .dev.vars.example .dev.vars
# fill in test values (include WAFFO_TATTOO_PRODUCT_ID and DEEPSEEK_API_KEY)
npm install
npm run dev
```

`npm run test:payments` checks signing, webhook verification, the paid/refund rules, and that unpaid calls do not unlock. It does not call Waffo.

`npm run test:tattoo` checks tattoo-check verdict parsing (rejects OK wording), amount floors by kind, and that watermark status ignores tattoo tokens. It does not call Waffo or DeepSeek.

`python3 -m http.server` has no Functions. The pay button then says payments are unavailable, and free downloads still work.

## Tattoo-check: first two weeks (ops)

This is a demand experiment, not a main SKU.

- **Manual spot-check:** For every paid report in the first two weeks, open the KV/`?report=` result and sanity-check the verdict and issue list yourself (especially classic fails like 免费 for “free spirit”). Do not publish model accuracy claims.
- **Success:** ≥5 paid, non-disputed orders in 2 weeks, and spot-checks look sane → consider continuing carefully.
- **Stop:** fewer than 5 paid orders in 2 weeks, a “I inked because of your report” complaint, or repeated miss on obvious bad samples → turn off the page CTA / unset `WAFFO_TATTOO_PRODUCT_ID` on Production (checkout returns unavailable) and stop marketing the experiment.
- Keep disclaimer copy on the page and in every report footer. Never add an “OK to ink” path.
