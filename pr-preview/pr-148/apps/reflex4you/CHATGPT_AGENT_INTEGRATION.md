# Reflex4You ChatGPT agent integration

This note explains how to wire a ChatGPT agent to create Reflex4You formulas,
validate them with the JavaScript parser, and return a shareable link.

## Minimal requirements

- A base viewer URL (default):
  https://mikaelmayer.github.io/apps/reflex4you/index.html
- A way to run the parser outside the static site (see below).

## Important: the site is static (no API)

`apps/reflex4you` is a static web app. It cannot host an API endpoint for
ChatGPT to call. If you want **parse feedback**, you must run the parser in a
separate place:

- **Recommended:** a small HTTP service and a ChatGPT Custom GPT Action.
- **Fallback:** a local CLI script + manual copy/paste (no automated tool calls).

## Share URL format

The viewer reads formulas from query parameters. The easiest path is to write
the raw formula string in `formula`, URL-encoded:

```
https://mikaelmayer.github.io/apps/reflex4you/index.html?formula=sin(z%5E2)%20%24%20z-D1
```

The app can upgrade the URL to the compressed `formulab64` form on first load
if the browser supports CompressionStream.

Optional compressed form (shorter URLs):

- `formulab64` = gzip(formula) encoded as base64url (replace +/ with -_, strip =).
- If you want maximum compatibility, you can include both `formulab64` and
  `formula`. On decode failure the app falls back to `formula`.

Additional query params can serialize handle values:

- Finger handles: `F1`, `F2`, `D1`, `D2`, `W0`, `W1`
- Trackball rotation: `RA`, `RB` (SU(2) pair)
- `solos=D1,D2` to restrict touch handles
- `edit=true` to show the UI immediately

Complex values accept:

- `a+bi` / `a-bi` (example: `D1=0.5-1.25i`)
- `a,b` (example: `D1=0.5,-1.25`)
- real-only (example: `D1=2`)

## Parser feedback for agent iteration

Use `parseFormulaInput` and `formatCaretIndicator` to give the agent a precise
error message and caret location when a formula fails to parse.

Minimal Node example:

```js
import { parseFormulaInput } from './apps/reflex4you/arithmetic-parser.mjs';
import { formatCaretIndicator, getCaretSelection } from './apps/reflex4you/parse-error-format.mjs';

const source = 'sin(z^2 + )';
const result = parseFormulaInput(source, { fingerValues: { D1: { x: 0, y: 0 } } });

if (!result.ok) {
  const caretMessage = formatCaretIndicator(source, result);
  const caretSelection = getCaretSelection(source, result);
  console.log(caretMessage);
  console.log(caretSelection);
}
```

Notes:

- `fingerValues` is used for compile-time evaluation of constructs like `$$` and
  `repeat`. If you do not have values, pass `{ x: 0, y: 0 }` for any referenced
  handles (or parse without values and retry if you see a repeat error).
- If you want stronger validation, you can also run `compileFormulaForGpu` from
  `core-engine.mjs` and report any compilation errors (this matches the in-app
  worker in `formula-compile-worker.mjs`).

## ChatGPT-specific integration (recommended)

### 1) Build a tiny validation API

Here is a minimal Node (ESM) service you can deploy to Vercel/Render/Cloudflare:

```js
// server.mjs
import express from 'express';
import { parseFormulaInput } from './apps/reflex4you/arithmetic-parser.mjs';
import { formatCaretIndicator, getCaretSelection } from './apps/reflex4you/parse-error-format.mjs';

const app = express();
app.use(express.json({ limit: '64kb' }));

app.post('/validate', (req, res) => {
  const source = String(req.body?.source || '');
  const baseUrl = String(req.body?.baseUrl || 'https://mikaelmayer.github.io/apps/reflex4you/index.html');
  const fingerValues = req.body?.fingerValues && typeof req.body.fingerValues === 'object'
    ? req.body.fingerValues
    : {};

  const result = parseFormulaInput(source, { fingerValues });
  if (!result.ok) {
    res.json({
      ok: false,
      url: null,
      caretMessage: formatCaretIndicator(source, result),
      caretSelection: getCaretSelection(source, result),
    });
    return;
  }

  const params = new URLSearchParams();
  params.set('formula', source);
  res.json({
    ok: true,
    url: `${baseUrl}?${params.toString()}`,
    caretMessage: null,
    caretSelection: null,
  });
});

app.listen(3000, () => console.log('Listening on http://localhost:3000'));
```

Notes:

- This uses the **raw** `formula` param to avoid browser-only compression APIs.
- If you want `formulab64`, use `zlib.gzipSync` + base64url encoding on the server.

### 2) Create a Custom GPT Action

In ChatGPT:

1. Create a **Custom GPT**.
2. In the **Actions** tab, add an OpenAPI schema like this (update the URL):

```yaml
openapi: 3.1.0
info:
  title: Reflex4You Formula Validator
  version: 1.0.0
servers:
  - url: https://your-domain.example.com
paths:
  /validate:
    post:
      operationId: validateReflexFormula
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                source:
                  type: string
                baseUrl:
                  type: string
                fingerValues:
                  type: object
                  additionalProperties:
                    type: object
                    properties:
                      x: { type: number }
                      y: { type: number }
              required: [source]
      responses:
        "200":
          description: Validation result
          content:
            application/json:
              schema:
                type: object
                properties:
                  ok: { type: boolean }
                  url: { type: string, nullable: true }
                  caretMessage: { type: string, nullable: true }
                  caretSelection:
                    type: object
                    nullable: true
                    properties:
                      start: { type: number }
                      end: { type: number }
```

### 3) Give the GPT a precise system instruction

Example instruction text:

```
You are a Reflex4You formula agent. Draft a formula, then call
validateReflexFormula. If ok=false, use caretMessage to fix the formula and
retry. Once ok=true, return the url to the user.
```

## Suggested tool API (example)

Single endpoint that both validates and builds the link:

```
POST /api/reflex4you/validate
{
  "source": "sin(z^2 + D1)",
  "baseUrl": "https://mikaelmayer.github.io/apps/reflex4you/index.html",
  "fingerValues": { "D1": { "x": 0.2, "y": -0.3 } },
  "compress": false
}
```

Response:

```
{
  "ok": true,
  "url": "https://.../index.html?formula=sin(z%5E2%2BD1)",
  "caretMessage": null,
  "caretSelection": null
}
```

When invalid:

```
{
  "ok": false,
  "url": null,
  "caretMessage": "z^2 +\n     ^\nExpected expression",
  "caretSelection": { "start": 5, "end": 6 }
}
```

## Agent loop (recommended)

1. Agent drafts a formula from the user request.
2. Call the validation tool (parse).
3. If invalid, use caret feedback to revise and retry.
4. When valid, return the share URL to the user.

## No-API fallback (manual loop)

If you cannot host any API at all, you still have two options:

1. **No validation:** have ChatGPT produce a formula + share link directly.
2. **Manual validation:** run a local CLI script and paste the caret feedback
   back into ChatGPT for the next iteration.

Example local CLI (Node):

```js
// validate.mjs
import { parseFormulaInput } from './apps/reflex4you/arithmetic-parser.mjs';
import { formatCaretIndicator } from './apps/reflex4you/parse-error-format.mjs';

const source = process.argv.slice(2).join(' ');
const result = parseFormulaInput(source);
if (!result.ok) {
  console.error(formatCaretIndicator(source, result));
  process.exit(1);
}

const params = new URLSearchParams();
params.set('formula', source);
console.log(`https://mikaelmayer.github.io/apps/reflex4you/index.html?${params}`);
```

Run:

```
node validate.mjs "sin(z^2 + D1) $ z - D2"
```
