# Reflex4You Interaction Roadmap (Temp PR Notes)

**Goal:** enable map-like exploration while keeping all behavior encoded directly in formulas.

## 1. New "W" Finger Semantics
- Introduce `W1`, `W2` finger labels exposed to formulas exactly like existing `F`/`D` slots.
- Single-finger gestures apply the same translation delta to both `W1` and `W2` (shared pan).
- Two-finger gestures capture initial touch points, solve the similarity transform implied by finger movement, and apply it to both `W1`/`W2` as if they were distant anchors. This yields natural pan/zoom/rotation while formulas keep reading only constants.
- Always reserve the first two active pointers for `W` when formulas reference them; serialize their values in the URL just like other fingers.

## 2. Gesture Routing Between W/F/D
- Pointer assignment rules:
  - If a formula uses any `W` fingers, the first two active touches always update `W1`/`W2`; remaining touches fall through.
  - With just one active finger: if the formula references `D` or `F`, map the finger to those handles (existing behavior). Only fall back to updating `W` when no other finger family is present.
  - With two active fingers and no `W` usage, keep current `F` ordering and `D` proximity rules.
  - With three or more fingers, first two stay on `W`, others follow the `F`/`D` rules.
- Prevent simultaneous updates: a touch assigned to `W` never mutates `D`/`F`, and vice versa.

## 3. Axis-Constrained Handles
- Detect when a finger slot feeds an axis-specific context (`x$D1`, `y(D2)`, etc.).
- During interaction, clamp that slot's movement to the relevant axis so the UX matches the formula's intent.

## 4. Shared AST Traversal Utility
- Add a reusable `visitAst(ast, visitor)` (depth-first) helper so gesture routing, axis analysis, and other inspections stop duplicating traversal logic.
- Cover it with unit tests to ensure node ordering and metadata propagation are stable.

## 5. Parser Enhancements & Metadata
- Parse `real` and `imag` as synonyms for `x` and `y` while preserving the user-written token in node metadata.
- Attach a `syntaxLabel` (or similar) to every AST node capturing its original spelling; ensure cloning/substitution utilities preserve it.
- Update relevant tests to assert both AST structure and metadata retention.

## 6. Documentation & Cleanup
- Update developer docs (README/roadmap) with the new finger semantics and traversal helper.
- Remove this temporary file before opening the PR.
