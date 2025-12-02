# Reflex4You Formula Roadmap

## Supported Today (apps/reflex4you)
- Complex literals (`a+bi`, `a,b`, shorthand `i`) plus unary `+`/`-`.
- Variables `x`, `y`, `z` and finger offsets `F1`, `F2` with live editing via the overlay controls.
- Binary operators `+`, `-`, `*`, `/`, composition (`o(f,g)` and `f $ g`), and repeated composition (`oo(...)`, `$$n`).
- Integer exponentiation via `^` with zero and negative powers compiled using exponentiation-by-squaring.
- Elementary analytic functions `exp(z)`, `sin(z)`, `cos(z)`, and `ln(z)` mapped to dedicated GLSL helpers.
- Parser spans, caret diagnostics, and URL/query synchronization for both formulas and finger coordinates.

## Referenced in RenderReflex.cpp (not yet implemented here)
- Randomized helpers (`randh`, `randf`) tied to the CLI `--seed` flag.
- Auto-scaling / normalization passes (see `autoscale_function` usage) to keep magnitudes in a workable range.
- Additional intrinsic functions from `functions.h` (hyperbolic/inverse trig, conditional nodes, macro expanders, etc.).
- Formatting/export targets (OpenOffice, LaTeX) and symbolic simplification pathways provided by the original parser.
- Advanced window management features (real-mode rendering, window shifting, PNG/BMP metadata blocks).

## Formula Gaps (to match RenderReflex.cpp)
- Summation constructs (e.g., `sum(i=a..b, f(i))`) that expand into repeated additions.
- Product constructs (e.g., `prod(i=a..b, f(i))`) for multiplicative loops.
- Explicit repeat/iteration macros beyond `oo`/`$$`, such as `repeat(expr, count)` used in macros.
- Let-style assignments or macro parameters that bind a name once (`let x = ... in ...`).
- Conditional forms (`if`, `case`) that guard expressions without branching in shader code.
- Function library entries from `functions.h` (e.g., `tan`, `sinh`, `asin`, `atan2`, `abs`, `max`, `min`) that appear in legacy formulas.
