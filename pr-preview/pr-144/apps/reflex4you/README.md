# Reflex4You

Reflex4You is an interactive complex-function explorer built around a compact
formula language.

For app usage, sharing links, and development workflows, see `guide.md`.

## Interaction Constants

Formulas can reference special complex constants that you edit directly on the
canvas. Either drag their on-screen handle or click the value chip to type an
exact complex number:

| Label family | Meaning | How to move |
| --- | --- | --- |
| `F0`, `F1`, `F2`, `F3` | Fixed handles | Fingers are assigned in order (first touch -> `F1`, etc.). (`F0` is supported as an alias of `F1`.) |
| `D0`, `D1`, `D2`, `D3` | Dynamic handles | Touch the handle closest to the complex point you want to move. (`D0` is supported as an alias of `D1`.) |
| `W0`, `W1` | Workspace frame | Gestures update both values together. One finger pans; two fingers capture the full similarity transform (pan, zoom, rotate) so you can navigate like Google Maps. |

Rules of thumb:

- A formula can use the `F` family and/or the `D` family, plus the `W` pair.
  - If both `F` and `D` appear, Reflex4You uses a "first finger decides" rule:
    if your first touch starts closer to the first fixed handle (`F1`), the
    gesture assigns fingers to `F1`, `F2`, ... (then falls back to dynamic `D*`
    if you use more fingers); otherwise, it behaves like pure `D*` mode
    (closest-handle matching).
- If a handle only appears inside an `x`/`real` projection, dragging is locked
  to the real axis (and similarly for `y`/`imag`). Use both axes anywhere in the
  formula to regain free movement.
- URLs remember the current formula and each handle's last position, so you can
  bookmark exact views.

### 3D rotations via SU(2): device (`QA`/`QB`) + trackball (`RA`/`RB`)

Reflex4You works in the complex plane, but many demos want **true 3D
rotations** (for example, rotating a function on the Riemann sphere). For that,
the app exposes rotations as **SU(2) elements**: a pair of complex numbers
`(A,B)` with `|A|^2 + |B|^2 = 1`.

| Token | Meaning | Serialized? |
| --- | --- | --- |
| `QA`, `QB` | **Device rotation** as a *relative* SU(2) element (baseline captured on the first valid sensor reading after load / permission). | No |
| `RA`, `RB` | **Draggable trackball rotation** (two-finger gesture by default). | Yes (`RA=...&RB=...`) |

Notes:

- **Identity rotation** is `A = 1+0i`, `B = 0+0i` (so "zero rotation" is
  `(1, 0)`, not `(0, 0)`).
- On iOS Safari, motion access requires a user gesture; the viewer requests
  permission on first touch.
- `QA/QB` are never written to the URL. `RA/RB` *are* shareable, like other
  parameters.

#### Rotate a complex sphere coordinate (Mobius action)

Under stereographic projection, SU(2) acts by a Mobius transform. If your
sphere coordinate is `u` (a complex number), then rotating by `(A,B)` is:

```text
u_rot = (A*u + B) / (-(B.conj)*u + A.conj)
```

(`A.conj` means `conj(A)` via dot-composition.)

#### "View from the inside" (simple effect)

If you want the feeling of viewing a function from *inside* the sphere (a
different but very intuitive Mobius warp), you can use:

```text
sin $ 3*z $ (QA*z+i*QB)/(i*QB.conj*z+QA.conj)
```

Here `(QA,QB)` is an SU(2) pair (same idea as `(A,B)` above). Try swapping
`QA/QB` for `RA/RB` (or any composed rotation) to steer the "inside view".

#### Reverse (invert) a rotation

The inverse (undo / reverse) of an SU(2) rotation `(A,B)` is:

```text
set Ainv = A.conj in
set Binv = -B in
...
```

Using the inverse in the Mobius action is often what you want for
"grab the sphere and drag it" interactions:

```text
u_rot = (Ainv*u + Binv) / (-(Binv.conj)*u + Ainv.conj)
```

#### Compose two rotations (for example, device o trackball)

If you want to combine device rotation `(QA,QB)` with trackball rotation
`(RA,RB)`, form a composed pair `(A,B)`:

```text
set A = QA*RA - QB*(RB.conj) in
set B = QA*RB + QB*(RA.conj) in
...
```

Swap the order if you want trackball o device instead.

#### Base rotations (yaw/pitch/roll style building blocks)

If you want a "base rotation" about a principal axis by an angle `t` (in
radians), you can build an SU(2) pair directly. Let:

- `c = cos(t/2)`
- `s = sin(t/2)`

Then:

- **Rotate about +X by `t`**:

```text
set A = c in
set B = s in
...
```

- **Rotate about +Y by `t`**:

```text
set A = c in
set B = i*s in
...
```

- **Rotate about +Z by `t`**:

```text
set A = c + i*s in
set B = 0 in
...
```

Tip: if you store `t` in a handle like `D1`, use `D1.x` (real part) as the
angle.

#### Sphere example (minimal): rotate then `sin`

This is a compact "Riemann sphere" template that:

- maps the screen point onto the sphere (front hemisphere),
- composes device + trackball rotations,
- applies the **inverse** rotation (so dragging feels like grabbing the
  sphere),
- evaluates a simple function (`sin`) on the rotated sphere coordinate.

```text
set R = 1.5 in
set r2 = abs^2 in
if r2 > R*R then 0 else
  set z_s = -sqrt(R*R - r2) in
    set u = z/(R - z_s) in
  set u1 = i*u in
  set A = QA*RA - QB*(RB.conj) in
  set B = QA*RB + QB*(RA.conj) in
  set Ainv = A.conj in
  set Binv = -B in
  set u2 = (Ainv*u1 + Binv)/(-(Binv.conj)*u1 + Ainv.conj) in
  set u_rot = (-i)*u2 in
  sin(u_rot)
```

The `i*u` / `(-i)` sandwich is a fixed basis alignment so "screen up/right"
matches the on-screen trackball axes.

#### Recover yaw/pitch/roll (optional)

If you really need Euler-style angles, derive them from `(A,B)` by first
converting to a quaternion:

- `w = A.x`, `z = A.y`, `x = B.x`, `y = B.y`

Then apply your preferred yaw/pitch/roll convention. Here is one concrete
example in the Reflex formula language (Euler order **`YXZ`**: yaw about **Y**,
then pitch about **X**, then roll about **Z**).

Notes:

- Reflex supports `arg(z)` (and synonym `argument(z)`): it returns the **phase**
  of `z` (that is, `atan2(im(z), re(z))`) as a **real** angle in radians.
- `arg(z, k)` forwards `k` to `ln(z, k)` so you can control the branch cut (it
  is computed as `imag(ln(z, k))`).
- Clamping to `[-1, 1]` is written explicitly with nested
  `if ... then ... else ...`.

```text
set qw = A.x in
set qx = B.x in
set qy = B.y in
set qz = A.y in

set tPitch = 2*(qw*qx - qy*qz) in
set tPitchClamped = if tPitch < -1 then -1 else if tPitch > 1 then 1 else tPitch in
set pitchX = asin(tPitchClamped) in

set yawNum = 2*(qw*qy + qx*qz) in
set yawDen = 1 - 2*(qx*qx + qy*qy) in
set yawY = arg(yawDen + i*yawNum) in

set rollNum = 2*(qw*qz + qx*qy) in
set rollDen = 1 - 2*(qx*qx + qz*qz) in
set rollZ = arg(rollDen + i*rollNum) in

yawY + i*pitchX
```

This computes `pitchX`, `yawY`, and `rollZ` (all real, in radians). The final
line returns a single complex number packing **yaw** (real part) and **pitch**
(imag part). To inspect roll instead, replace the last line with `rollZ` (or
`rollZ + i*pitchX`).

Euler angles always have singularities (for `YXZ`, the singularity is at
`pitchX = +/-pi/2`), so SU(2) is the recommended default.

## Virtual Reality

Reflex4You can be used as a virtual-reality viewer by rendering two views and
offsetting them by the physical eye separation.

Example formula:

    set halfEyeDistance = 1.805 in
    set FOV = 1 in

    let view =
      (z*QA + i*QB) / (i*QB.conj*z + QA.conj) $ z * FOV / 4
    in
    let vrview =
      view $ z + halfEyeDistance*i*if y < 0 then 1 else -1
    in
    let fn =
      z^2 + D2 $$ 50 $ z/2
    in
    fn $ vrview

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
