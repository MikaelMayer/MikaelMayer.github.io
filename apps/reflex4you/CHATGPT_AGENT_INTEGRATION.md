# Reflex4You ChatGPT agent integration

This note explains how to wire a ChatGPT agent to create Reflex4You formulas,
validate them with the JavaScript parser, and return a shareable link.

## Minimal requirements

- A small HTTP service (or OpenAI Action) that can run the Reflex4You parser
  modules in Node 18+ (ESM) or a bundler.
- A base viewer URL (default):
  https://mikaelmayer.github.io/apps/reflex4you/index.html

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
