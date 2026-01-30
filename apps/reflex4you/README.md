# Reflex4You

Reflex4You is an interactive complex-function explorer built around a compact
formula language.

For app usage, gestures, SU(2) rotations, VR, sharing links, and development
workflows, see `guide.md`.

## Formula Language

The input accepts succinct expressions with complex arithmetic, composition,
and built-in helpers:

- **Variables:** `z`, `x`, `y`, `real`, `imag`.
- **Finger tokens:** `F0`-`F3`, `D0`-`D3`, `W0`, `W1`.
- **3D rotations (SU(2))**: `QA`, `QB` (device), `RA`, `RB` (trackball).
- **Literals:** `1.25`, `-3.5`, `2+3i`, `0,1`, `i`, `-i`, `j`
  (for `-1/2 + sqrt(3)/2 i`).
- **Operators:** `+`, `-`, `*`, `/`, power (`^` with integer exponents),
  composition (`o(f, g)` or `f $ g`), repeated composition (`oo(f, n)` or
  `f $$ n`).
- **Loops:** `repeat n from a1, a2, ..., ak by f1, f2, ..., fk` iterates a
  **k-register state** for `n` steps and returns the final `r1`.
  - `n` must be a **compile-time integer** (for example, `10`, `floor(3.9)`).
    If `n <= 0` it performs zero iterations and returns `a1`.
  - Each `fj` must be a **user-defined** `let` function with exactly `k+1`
    parameters: `fj(k, r1, ..., rk)`.
  - Dot composition is equivalent: `f $ expr` is the same as `expr.f`
    (so `a.b` means `b(a(z))`).
- **Functions:** `exp`, `sin`, `cos`, `tan`, `atan`/`arctan`, `arg`/`argument`,
  `asin`/`arcsin`, `acos`/`arccos`, `ln`, `sqrt`, `abs`/`modulus`, `abs2`,
  `floor`, `conj`, `heav`, `isnan`, `ifnan`/`iferror`. `sqrt(z, k)` desugars to
  `exp(0.5 * ln(z, k))`, so the optional second argument shifts the log branch.
  `heav(x)` evaluates to `1` when `x > 0` and `0` otherwise.
- **Conditionals:** comparisons (`<`, `<=`, `>`, `>=`, `==`), logical ops
  (`&&`, `||`), and `if cond then then else else`.
- **Bindings:**
  - `set name = value in body` introduces a **value** (evaluated once at the
    binding site; it can "capture" the current `z`).
  - `let name = expr in body` introduces a **function** (not evaluated until
    used; it always receives the ambient `z`).
    - You can also define extra parameters:
      `let name(set p1, set p2, ...) = expr in body`.
    - `z` is reserved and cannot be used as a parameter name.

Examples:

```text
f $ ((z - W0) / (W1 - W0))        # pan/zoom/rotate via W gestures
sin $ z - D1                      # manual handle for offsetting input
set c = abs(z) in c / (1 + c)     # temporary value
if real < 0 then conj(z) else z   # axis-aware interaction
```

### Functions (`let`) and calls

Reflex formulas are **functions of `z`**, so a `let` binding defines a reusable
function expression.

- **Unary functions (no extra params)**:
  - Define: `let f = z^2 + 1 in ...`
  - Use at the current `z`: `f` (shorthand for "apply to ambient `z`").
  - Use at a specific input: `f(expr)` (equivalently `f $ expr`).

- **Multi-argument functions (extra params)**:
  - Define: `let max(set w) = if z < w then w else z in ...`
  - Call with explicit arguments:
    - `max(a)` binds `w = a` and uses the current `z`.
    - `max(a, z0)` binds `w = a` and uses `z0` **instead of** the ambient `z`
      (the optional final argument overrides `z`).
  - If you reference a function that requires extra parameters without
    supplying them, it is a compile-time error.

- **Passing functions to functions**:
  - Mark parameters explicitly with `set` (value) or `let` (function). If you
    omit the keyword, it is treated like `set`.
  - Example (numerical derivative):

```text
let derivative(let f) = (f(z + 0.001) - f(z)) / 0.001 in
derivative(sin)
```

  - Function parameters can declare extra arguments by repeating a signature:
    - `let apply1(let filter(set w), set w0) = filter(w0 + 1) in apply1(sin, 0)`

- **Repeated composition (`$$`)** works inside `let` bodies as well:
  - `f $$ n` repeats `f` exactly `n` times (same as `oo(f, n)`).
  - Example:

```text
let fn = z^2 + 0.1 $$ 4 in
fn
```

This means apply `z -> z^2 + 0.1` four times.

### Loops (`repeat`) examples

All examples below return a **single complex value** (no tuples/arrays are
introduced at runtime).

```text
# Sum of integers: 0 + 1 + ... + 9 = 45
let step(k, s) = s + k in
repeat 10 from 0 by step

# Sum of squares: 0^2 + 1^2 + ... + 9^2 = 285
let step(k, s) = s + k*k in
repeat 10 from 0 by step

# Alternate sum of cubes: sum (-1)^i * i^3 for i=0..9
let fs(k, s, sign) = s + sign*(k^3) in
let fsign(k, s, sign) = -sign in
repeat 10 from 0, 1 by fs, fsign

# Sum of fourth powers: sum i^4 for i=0..9
let step(k, s) = s + k^4 in
repeat 10 from 0 by step

# Truncated exp series (n terms): sum z^i / i! for i=0..n-1
# Registers: (sum, term, zConst). Keep zConst unchanged across iterations.
let fsum(k, sum, term, zc) = sum + term in
let fterm(k, sum, term, zc) = term * zc / (k + 1) in
let fz(k, sum, term, zc) = zc in
repeat 12 from 0, 1, z by fsum, fterm, fz
```

## Formula optimization principles (GPU-friendly)

The GPU compiler lowers formulas to GLSL. These patterns keep shaders smaller
and more likely to compile on strict WebGL drivers.

- **Cache repeated values with `set` when the `z` input is the same.**

  Before:

  ```text
  let base = exp in
  base + base
  ```

  After:

  ```text
  set base = exp(z) in
  base + base
  ```

- **Hoist repeated clamp/ease logic once.**

  Before:

  ```text
  set a = ease(clamp(t0, t1, t)) in
  set b = ease(clamp(t0, t1, t)) in
  a + b
  ```

  After:

  ```text
  set u = ease(clamp(t0, t1, t)) in
  u + u
  ```

- **Avoid nested `set` inside hot branches.**
  This reduces captures and temporary values in functions that are sampled many
  times (for example, finite differences or glow paths).

  Before:

  ```text
  let glow =
    if t < t1 then f
    else if t < t2 then
      set u = ease(clamp(t2, t3, t)) in
      g + u*z
    else h
  in
  glow
  ```

  After:

  ```text
  set u = ease(clamp(t2, t3, t)) in
  let glow =
    if t < t1 then f
    else if t < t2 then g + u*z
    else h
  in
  glow
  ```

- **Reuse function values in finite differences.**

  Before:

  ```text
  let slope = (real(f(x + eps)) - real(f(x))) / eps in
  slope
  ```

  After:

  ```text
  let fx = real(f(x)) in
  let slope = (real(f(x + eps)) - fx) / eps in
  slope
  ```

- **Prefer closed-form derivatives when you have them.**

  ```text
  let f = z^2 + c in
  let df = 2*z in
  df
  ```

- **Keep captures small.** Hoist constants to outer `set` bindings and pass only
  what a helper function needs, so the generated GLSL has fewer parameters.
