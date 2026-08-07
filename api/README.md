# Reflex4You API (Vercel)

This folder contains a minimal serverless API to validate Reflex4You formulas
and generate shareable URLs (including finger values, animations, and timing).

## Files

- `reflex4you.mjs` – Vercel Serverless Function
  - Endpoint: `/api/reflex4you`
  - Method: `POST`
  - Returns: `{ ok, url, caretMessage, caretSelection }`
- `reflex4you-render.mjs` – Vercel Serverless Function
  - Endpoint: `/api/reflex4you-render`
  - Method: `GET` or `POST`
  - Returns: `image/png` (or JSON when `format=json`)
- `reflex4you-preview.mjs` – Legacy alias (kept for compatibility)
  - Endpoint: `/api/reflex4you-preview`

## Quick deploy on Vercel (from GitHub)

1. Push this repo to GitHub (public is fine).
2. In Vercel, click **New Project** and import the repo.
3. Vercel will detect the API under `/api`.
4. Deploy. Your endpoint becomes:

```
https://YOUR_PROJECT.vercel.app/api/reflex4you
```

> Note: GitHub Pages cannot run APIs. Vercel (or Netlify/Cloudflare) is required.

## Request format

You can test this on https://hoppscotch.io/, just select POST, select body, content type application/json and paste the following


```json
{
  "source": "sin(z^2 + D1) $ z - D2",
  "baseUrl": "https://mikaelmayer.github.io/apps/reflex4you/index.html",
  "values": {
    "D1": { "x": 0.2, "y": -0.3 },
    "D2": "0.4+0.1i",
    "RA": [1, 0],
    "RB": [0, 0]
  },
  "animations": {
    "D1": { "start": "0+0i", "end": "1+0i" }
  },
  "duration": "6s",
  "solos": ["D1", "D2"],
  "edit": true,
  "compress": true,
  "validate": true,
  "compile": false
}
```

### Notes

- `values` accepts objects (`{ x, y }` or `{ re, im }`), arrays (`[re, im]`), or
  strings (`a+bi`, `a-bi`, `a,b`, or `a`).
- `animations` encodes `labelA=start..end` for finger labels only.
- `duration` sets `t=...` in seconds (e.g. `"5s"` or `5`).
- `compress` defaults to `true` and uses `formulab64` (gzip + base64url). Set
  `compress=false` to emit a raw `formula=` instead.

## Preview endpoint

Render a WebGL preview image via Playwright (PNG):

```json
POST /api/reflex4you-render
{
  "source": "sin(z^2 + D1)",
  "values": { "D1": "0.2+0.3i" },
  "height": 8,
  "pixelWidth": 540,
  "pixelHeight": 1080,
  "format": "json"
}
```

When `format=json`, the response includes metadata and a base64 PNG:

```json
{
  "ok": true,
  "pixelWidth": 540,
  "pixelHeight": 1080,
  "ratio": 0.5,
  "view": { "viewXMin": -2, "viewXMax": 2, "viewYMin": -4, "viewYMax": 4 },
  "image": "iVBORw0KGgoAAA...",
  "imageType": "image/png"
}
```

You can also call it via GET for `<img src>` embedding:

```
/api/reflex4you-render?formulab64=...&height=8&pixels=1080
```

### Preview parameters

- `width` or `height`: view span in the complex plane (centered at 0). Default: `height=8`.
- `pixels`: long-side pixel count when `pixelWidth`/`pixelHeight` are omitted. Default: `1080` (1:2 aspect).
- `pixelWidth`/`pixelHeight`: explicit output pixel size (overrides `pixels`).
- `baseUrl`: optional viewer URL (defaults to the GitHub Pages Reflex4You index).
- `compile`: when true, validates the formula via GPU compilation before rendering.

## Example response

```json
{
  "ok": true,
  "url": "https://mikaelmayer.github.io/apps/reflex4you/index.html?formulab64=H4sIA...&D1=0.2-0.3i",
  "query": "formulab64=H4sIA...&D1=0.2-0.3i",
  "warnings": null
}
```

If the formula fails to parse:

```json
{
  "ok": false,
  "url": null,
  "caretMessage": "z^2 +\n     ^\nExpected expression",
  "caretSelection": { "start": 5, "end": 6 }
}
```

## Local test

If you run this on a local Vercel dev server:

```bash
npm i -g vercel
vercel dev
```

Then test:

```bash
curl -X POST http://localhost:3000/api/reflex4you \
  -H "Content-Type: application/json" \
  -d '{"source":"z","values":{"D1":"0.2+0.3i"}}'
```
