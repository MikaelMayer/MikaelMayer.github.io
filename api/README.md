# Reflex4You API (Vercel)

This folder contains a minimal serverless API to validate Reflex4You formulas
and generate shareable URLs (including finger values, animations, and timing).

## Files

- `reflex4you.mjs` – Vercel Serverless Function
  - Endpoint: `/api/reflex4you`
  - Method: `POST`
  - Returns: `{ ok, url, caretMessage, caretSelection }`
- `reflex4you-preview.mjs` – Vercel Serverless Function
  - Endpoint: `/api/reflex4you-preview`
  - Method: `GET` or `POST`
  - Returns: `image/svg+xml` (or JSON when `format=json`)

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
  "includeFormulaParam": false,
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
- `includeFormulaParam=true` also includes `formula=` alongside `formulab64`.

## Preview endpoint

Render a formula preview image (MathJax SVG):

```json
POST /api/reflex4you-preview
{
  "source": "sin(z^2 + D1)",
  "values": { "D1": "0.2+0.3i" },
  "inlineFingerConstants": true,
  "format": "json"
}
```

When `format=json`, the response includes the SVG as a string:

```json
{
  "ok": true,
  "svg": "<svg ...>...</svg>",
  "latex": "\\operatorname{sin}(z^2 + D_1)",
  "caretMessage": null,
  "caretSelection": null
}
```

You can also call it via GET for `<img src>` embedding:

```
/api/reflex4you-preview?formulab64=...&format=svg
```

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
