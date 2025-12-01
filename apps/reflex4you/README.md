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
- Built-in symbols `x`, `y`, `z`, `F1` (renaming what the renderer previously called `Offset`).
- Unary minus/plus, binary `+ - * /`, grouping parentheses.
- Composition notations `o(A, B)` and `A $ B`.
- Span annotations on every AST node (used for error messages and future tooling).

Helpers like `wsLiteral('foo')` reuse the `_i` shortcut so whitespace logic stays centralized.

## Testing
From `apps/reflex4you/` run:
```
npm run test:node
```
This executes the Node-based unit tests for the parser infrastructure and the core rendering helpers.
