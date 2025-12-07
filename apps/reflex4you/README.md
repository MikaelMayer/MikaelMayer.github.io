# Reflex4You Parser Toolkit

## Overview
This app separates the GPU renderer (`core-engine.mjs`), the UI harness (`index.html` / `main.js`), and the new arithmetic parser (`arithmetic-parser.mjs`). The parser consumes free-form formulas, produces span-aware AST nodes, and the renderer turns those AST nodes into GLSL that drives the WebGL viewer.

All parsing code lives in `parser-primitives.mjs`, `parser-combinators.mjs`, and `arithmetic-parser.mjs`:
- `parser-primitives.mjs` implements zero-allocation slices (`ParserInput`) plus typed success/failure envelopes with span metadata.
- `parser-combinators.mjs` defines a fluent combinator DSL that mirrors the primitives above but stays friendly to modern JS ergonomics.
- `arithmetic-parser.mjs` wires the combinators into the concrete language (numbers, primitives, operators, compositions) and feeds the AST into the renderer.

## Parser combinator essentials
Every parser is a callable value that also carries helper methods via `parserPrototype`. The most frequently used helpers are:

### Concatenation shorthands
| Helper | Meaning |
| --- | --- |
| `p.i_i(q)` | Parse `p` then `q`, returning both as a pair `[left, right]`. |
| `p._i(q)` | Parse `p` then `q`, returning only `q`'s value ("keep right"). |
| `p.i_(q)` | Parse `p` then `q`, returning only `p`'s value ("keep left"). |

These map directly to `Concat`, `ConcatRight`, and `ConcatLeft`. They keep spans for the entire concatenated region so downstream tooling can surface precise diagnostics.

### Failure handling
`p._q_q()` replays `p` but, on a recoverable failure, resets the error span back to the point where `p` started. Use this when one branch of an `Or` should not consume input unless it fully succeeds. Fatal failures (`ParseSeverity.error`) always propagate without resetting.

### Repetition without extra copies
`p.Rep({ min, max, seed, append, finish })` accumulates the results of `p` using an efficient mutable buffer:
```js
const digits = digitParser.Rep({
  min: 1,
  seed: () => [],
  append: (bucket, value) => {
    bucket.push(value);
    return bucket;
  },
  finish: (bucket) => bucket.join(''),
});
```
Because the accumulator is reused, this avoids repeated array spreading when parsing long sequences.

### Other building blocks
- `Succeed`, `Fail`, `Optional`, `Many`, `Choice`, `Sequence`, and `Map` match what their names suggest.
- `WS()` and `WS1()` use sticky regular expressions so whitespace handling composes cleanly (`WS()._i(Literal(','))`).
- `lazy(() => parser)` enables recursive grammars without upfront declarations.

`parser-combinators.mjs` exports each helper individually, so feel free to pull them into bespoke parsers outside of the arithmetic grammar if needed.

## Arithmetic grammar highlights
`arithmetic-parser.mjs` focuses on the formula language described in the roadmap:
- Numeric literals (real, imaginary, shorthand `i`/`-i`).
- Axis projection symbols `x`, `y`, `real`, and `imag`. `real`/`imag` are synonyms for `x`/`y`, but we now track the original token in `syntaxLabel` metadata so UI layers can mirror the source spelling.
- Built-in symbols `z`, `F1`, `F2`, `F3`, `D1`, `D2`, `D3`, plus the new navigation pair `W1`, `W2`.
- Unary minus/plus, binary `+ - * /`, grouping parentheses.
- Composition notations `o(A, B)` and `A $ B`.
- Elementary functions `exp`, `sin`, `cos`, `tan`, `atan`, `ln`, `abs`, `conj`, and the newly added `floor`. Every unary helper shares the same AST shape, so extending the language just requires registering a new factory and GLSL emitter.
- Span annotations on every AST node (used for error messages and future tooling).
- Optional metadata (`syntaxLabel`) on primitives so downstream tools can recover whether a node came from `x` vs `real`, etc.

Helpers like `wsLiteral('foo')` reuse the `_i` shortcut so whitespace logic stays centralized.

### Interaction constants
Reflex exposes three finger families, all accessible from formulas via `FingerOffset('label')` or the shorthand tokens (`F1`, `D2`, etc.):

- **Fixed fingers (`F1`‑`F3`)** – ordered handles that capture touches in declaration order.
- **Dynamic fingers (`D1`‑`D3`)** – proximity-based handles; whichever touch starts closest to a handle's complex value takes control.
- **Workspace fingers (`W1`, `W2`)** – gesture-driven constants. With one finger (when no `D`/`F` handles are present) both `W` values translate together. With two fingers, we solve the complex similarity defined by the gesture (pan/zoom/rotate) and apply it to `W1` and `W2`, enabling map-like navigation entirely through formulas such as `f((z - W1)/W2)`.

Formulas can freely mix `W` with either `F` or `D`, but `F` and `D` remain mutually exclusive to keep the interaction model deterministic. The UI analyzes each AST to decide which labels are active and whether a given slot should be clamped to a single axis. If every occurrence of `D1` sits inside an `x$D1` (or `real $ D1`) projection, pointer deltas are restricted to the real axis; mixing both axes (or any other expression) immediately lifts the constraint.

### Formula & interaction documentation
- **Parser keywords:** numerical literals (real/imag shorthand), projection keywords (`x`, `y`, `real`, `imag`), finger tokens (`F1`‑`F3`, `D1`‑`D3`, `W1`, `W2`), and elementary functions (`exp`, `sin`, `cos`, `tan`, `atan`, `ln`, `abs`, `floor`, `conj`).
- **Metadata:** every AST node carries `span` information, and primitives also carry `syntaxLabel` so UI layers can echo the author's original spelling.
- **Gestures:** single-touch pans manipulate either `F`/`D` handles (when referenced) or the `W` frame. Two-touch gestures always reserve the first two touches for `W` when the formula references those slots, ensuring consistent pinch-to-zoom even while other parameters are exposed via `F`/`D`.
- **Axis locking:** handled automatically by scanning the AST with `visitAst`. Slots are only considered axis-constrained when *all* of their usages are projections to the same axis, regardless of repetition count.

## Testing
From `apps/reflex4you/` run:
```
npm run test:node
```
This executes the Node-based unit tests for the parser infrastructure and the core rendering helpers.
