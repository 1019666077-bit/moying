# Moying · 墨英

English names and short words, drawn as Chinese brush marks.

## Run locally

```bash
python3 -m http.server 8765
```

Open http://127.0.0.1:8765/

Brush fonts are small Latin subsets in `fonts/`. opentype.js is vendored. Nothing is loaded from a third-party CDN.

## GitHub Pages

1. Open the repo on GitHub.
2. Settings → Pages.
3. Branch: `main`, folder: `/` (root).
4. Save. The public site is https://mymoying.com/

## Features

- Styles: Neat, Regular, Flowing, Grass, Wild (each a different face)
- Horizontal / vertical, wrapping on spaces
- Rice, aged, night paper
- Ink / cinnabar
- Size, space, dry brush, red seal
- Free export: PNG, JPG, WebP, transparent PNG, SVG, PDF
- Every free file is a watermarked 1800×2400 image. SVG only embeds that bitmap. PDF is a real PDF of the same image.
- The $1.99 button is a placeholder. Set `WAFFO_PURCHASE_URL` in `app.js` when the Waffo link is ready. Payment is not connected.
