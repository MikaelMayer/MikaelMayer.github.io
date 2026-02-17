# Reflex4You Formula Roadmap

Sync status for the arithmetic language powering reflex4you.com. Items are distilled from the public syntax doc and expressed as checkboxes for quick tracking.

## ✅ Already Implemented
- [x] Complex literals (`a+bi`, `a,b`, shorthand `i`) plus unary `+`/`-`.
- [x] Variables `x`, `y`, `z`, and finger offsets `F1`, `F2` with live editing + query sync.
- [x] Binary operators `+`, `-`, `*`, `/`, composition (`o(f,g)` / `f $ g`), and repeated composition (`oo(...)`, `$$n`).
- [x] Integer exponentiation `^` including zero/negative powers via exponentiation-by-squaring.
- [x] Elementary functions `exp`, `sin`, `cos`, `ln` emitted as dedicated complex helpers.
- [x] Parser spans + caret diagnostics surfaced in the UI and URL persistence for formulas/fingers.

## ⏳ Formula Gaps To Match reflex4you.com
- [ ] **Summations (`sum`)** — syntax such as `sum(i = a..b, f(i))`, expanded into deterministic addition loops.
- [ ] **Products (`prod`)** — multiplicative counterpart to `sum`, expanding into repeated complex multiplication.
- [ ] **General repeat macros** — add `repeat(expr, count)` / similar constructs required by the doc beyond `oo`/`$$`.
- [ ] **`let` bindings (function definitions)** — allow `let name(arg) = expr in body`, storing a function AST that can be reused.
- [ ] **`set` bindings (value assignment)** — add `set name = expr; body`, where `name` captures the evaluated complex value.
- [ ] **Call shorthand `name(arg)`** — treat as a direct function invocation (more efficient than desugaring to `o(name, arg)`).
- [ ] **Absolute + hyperbolic functions** — implement `abs`, `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh`, etc., to mirror the legacy library.
- [ ] **Comparison operators** — parse/evaluate `>`, `<`, `<=`, `>=`, `==` using only the real part; return `1` for true, `0` for false.
- [ ] **Logical operators** — support `&&` and `||` with “non-zero is truthy” semantics for composable boolean expressions.
- [ ] **`if(cond, thn, els)`** — add a ternary node that interprets `cond` via the boolean rules above and selects between branches without divergent control flow.
