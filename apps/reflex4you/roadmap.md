# Reflex4You Syntax Roadmap

## Prelude
- Reference syntax spec: [Reflex4You next-level syntax](https://docs.google.com/document/d/11knd8_qb8btwi6nGQYCU743OaVlHiD_EV9DyYl5gXUQ/edit?usp=drivesdk).
- Shader-compiled target disallows unbounded loops and requires deterministic constructs.
- Existing `index.html` uses `Offset` for the finger-controlled complex value; the new arithmetic syntax rebrands this construct as `F1`, so parsing/evaluation must keep the same behavior under the new name.
- All parser inputs must be zero-allocation views (string + start/end) and outputs must carry ctor flag, severity, spans, and links to original input plus nested failures.
- Parser combinators should mirror Dafny styles: `Or(p, q)` and `p.Or(q)`, implemented via JS call overrides so builder-style chaining also works.
- Composition syntax `o(A, B)` and `A $ B` both produce composition AST nodes; `$` is not a combinator.
- Operator precedence/associativity need only influence parsing; AST nodes will rely on explicit parentheses during emission.
- Initial language must cover literals (ints, signed numbers, complex forms like `5.2i`), primitive functions (`x`, `y`, `z`, `F1`), unary `-`, binary `+ - * /`, and grouping parentheses.

## Tasks
- [x] Extract the current inline script from `apps/reflex4you` into separate modules (a reusable core engine plus a thin `index.html` harness) and wire the page via `<script type="module">`.
- [x] Add Node-based unit testing plus a Playwright (or similar) smoke test so both the parser helpers and the HTML integration can be exercised automatically.
- [x] Review `dafny/Source/DafnyStandardLibraries` parser/core examples to replicate the functional parser patterns we need (skip the proof artifacts).
  - Captured the Dafny-style callable parser API inside `parser-combinators.mjs`, including builder helpers like `.Or()` alongside `Or(p, q)`.
- [x] Implement the zero-allocation `ParserInput` class and the `ParseResult` success/failure classes with ctor/severity metadata, positional spans, and nested failure support.
- [x] Build the JS parser-combinator toolkit (supporting both standard and builder styles via call overrides) including `Or` as both a combinator and an instance helper.
- [x] Implement the minimal arithmetic-expression grammar with literals, primitives (`x`, `y`, `z`, `F1`), unary minus, binary `+ - * /`, parentheses, and both composition syntaxes `o(A,B)` / `A $ B`.
- [ ] Ensure the generated AST nodes carry spans/input refs and normalize operator precedence by emitting parentheses instead of storing metadata.
- [ ] Integrate the parser output with the existing shader compiler path, surfacing recoverable vs. critical failures with detailed diagnostics for downstream tooling.
- [ ] Update the UI so a successfully parsed formula rewrites the `?formula=` query parameter (URL-encoded) and the page preloads that value from the query string into the textarea on startup.
