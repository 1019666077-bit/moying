# Moying · 墨英

English names and short words, drawn as Chinese brush marks.

Live site: https://mymoying.com/

## Run locally

Static page only:

```bash
python3 -m http.server 8765
```

Open http://127.0.0.1:8765/. The pay button reports that payments are unavailable. Free watermarked downloads still work.

Checkout and webhooks (Cloudflare Pages Functions):

```bash
npm install
npm run dev
```

Copy `.dev.vars.example` to `.dev.vars` and fill in test-mode values. See [DEPLOY.md](DEPLOY.md).

Brush fonts are small Latin subsets in `fonts/`. opentype.js is vendored. Nothing is loaded from a third-party CDN.

## Cloudflare Pages

The Pages project is connected to this repo's `main` branch, with no build step and the output directory set to the repo root. `/functions` is the server side (checkout, webhook, payment status). Payment secrets and the KV binding are configured in the Cloudflare dashboard, not in this repo. The steps are in [DEPLOY.md](DEPLOY.md).

## Features

- Styles: Neat, Regular, Flowing, Grass, Wild (each a different face)
- Horizontal / vertical, wrapping on spaces
- Rice, aged, night paper
- Ink / cinnabar
- Size, space, dry brush, red seal
- Free export: PNG, JPG, WebP, transparent PNG, SVG, PDF
- Free files are watermarked 900×1200 previews. SVG and PDF embed that same image, so they are not a clean vector. A paid design exports a clean 1800×2400 file in the format you pick.
- $1.99 once, through Waffo Pancake, removes the watermark for that design. The button starts a server-side checkout. Without the Functions secrets configured, it says payments are unavailable and does not break the page.
