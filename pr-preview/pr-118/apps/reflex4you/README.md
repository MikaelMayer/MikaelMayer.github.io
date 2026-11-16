# Reflex4You

Reflex4You is an interactive complex-function explorer. Type a formula, drag the on-screen handles, or pinch to zoom, and the fractal view updates in real time.

## Quick Start

1. **Open the live app:** https://mikaelmayer.github.io/apps/reflex4you/  
   The viewer presents the complex function `z → z` across the rectangular domain `[-4 - 4i, 4 + 4i]`, clamped to your screen. Because every formula describes a function of `z`, the shorthand `z` means “map `z` to itself.”

2. **Enter a formula.** Try:

   ```
   sin(z^2 + D2) $ z - D1
   ```

   Handles `D1` and `D2` appear. Drag them to adjust the parameters; their coordinates (and the formula) are stored directly in the URL, so sharing the link reproduces the exact view for anyone else.

3. **Explore with gestures.** To inspect something Mandelbrot-like without moving handles onto the feature, use the workspace frame:

   ```
   set c = (z - W0) / (W1 - W0) in (z^2 + c $$ 20) $ 0
   ```

   Here `W0`/`W1` follow your fingers: a single finger pans both values, while a two-finger gesture solves the similarity transform (pan, zoom, rotate) and applies it to the pair. `f $ g` means “compose with” (`f(g(z))`), and `f $$ n` repeats `f` exactly `n` times. Parentheses are optional, and the complete formula syntax is summarized below under **Formula Language**.

4. **Dive into advanced physics-style demos.** Handles plus gesture control make it easy to model optical experiments. For instance, the following formula mimics both the Michelson interferometer and Young’s double-slit patterns:

   ```text
   let sqrt = exp $ 0.5*ln in
   set d1 = 2*D1 in
   set scale = 5 in
   set r = sqrt $ abs(d1.x + i*d1.y)^2 + x^2 + y^2 $ scale*(z - D3) in
   set r2 = sqrt $ abs(d1.x - i*d1.y)^2 + x^2 + y^2 $ scale*(z + D3) in
   abs $
   10*z $ 1/(r^2)*exp(8*abs(D2.x)*i*r) + 1/(r2^2)*exp(8*abs(D2.x)*i*r2)
   ```

   Drag `D1` to change the arm angle, `D2` to tweak the wavelength, and `D3` to offset the detectors; the visual interference pattern updates instantly and the full configuration is still shareable via the URL.

## Install as a PWA

- On Chrome/Edge/Android, open https://mikaelmayer.github.io/apps/reflex4you/, open the browser menu, and choose **Install app** (or **Add to Home screen** on iOS Safari).  
- The shipped `manifest.json` and service worker let the viewer cache `index.html`, all ES modules, and the WebGL assets so you can explore saved formulas even when you're offline.
- Updates ship automatically: when a new version is published, the service worker pulls fresh files after the next load and activates on the following visit.

## Interaction Constants

Formulas can reference special complex constants that you edit directly on the canvas—either drag their on-screen handle or click the value chip to type an exact complex number:

| Label family | Meaning | How to move |
| --- | --- | --- |
| `F0`, `F1`, `F2`, `F3` | Fixed handles | Fingers are assigned in order (first touch → `F1`, etc.). (`F0` is supported as an alias of `F1`.) |
| `D0`, `D1`, `D2`, `D3` | Dynamic handles | Touch the handle closest to the complex point you want to move. (`D0` is supported as an alias of `D1`.) |
| `W0`, `W1` | Workspace frame | Gestures update both values together. One finger pans; two fingers capture the full similarity transform (pan, zoom, rotate) so you can navigate like Google Maps. |

### 3D rotations via SU(2): device (`QA`/`QB`) + trackball (`RA`/`RB`)

Reflex4You works in the complex plane, but many demos want **true 3D rotations** (e.g. rotating a function on the Riemann sphere). For that, the app exposes rotations as **SU(2) elements**: a pair of complex numbers \((A,B)\) with \(|A|^2 + |B|^2 = 1\).

| Token | Meaning | Serialized? |
| --- | --- | --- |
| `QA`, `QB` | **Device rotation** as a *relative* SU(2) element (baseline captured on the first valid sensor reading after load / permission). | No |
| `RA`, `RB` | **Draggable trackball rotation** (two-finger gesture by default). | Yes (`RA=...&RB=...`) |

Notes:

- **Identity rotation** is `A = 1+0i`, `B = 0+0i` (so “zero rotation” is `(1, 0)`, not `(0, 0)`).
- On iOS Safari, motion access requires a user gesture; the viewer requests permission on first touch.
- `QA/QB` are never written to the URL. `RA/RB` *are* shareable, like other parameters.

#### Rotate a complex sphere coordinate (Möbius action)

Under stereographic projection, SU(2) acts by a Möbius transform. If your sphere coordinate is `u` (a complex number), then rotating by `(A,B)` is:

```text
u_rot = (A*u + B) / (-(B.conj)*u + A.conj)
```

(`A.conj` means `conj(A)` via dot-composition.)

#### “View from the inside” (simple effect)

If you want the feeling of viewing a function from *inside* the sphere (a different but very intuitive Möbius warp), you can use:

```text
sin $ 3*z $ (QA*z+i*QB)/(i*QB.conj*z+QA.conj)
```

Here `(QA,QB)` is an SU(2) pair (same idea as `(A,B)` above). Try swapping `QA/QB` for `RA/RB` (or any composed rotation) to steer the “inside view”.

#### Reverse (invert) a rotation

The inverse (undo / reverse) of an SU(2) rotation `(A,B)` is:

```text
set Ainv = A.conj in
set Binv = -B in
...
```

Using the inverse in the Möbius action is often what you want for “grab the sphere and drag it” interactions:

```text
u_rot = (Ainv*u + Binv) / (-(Binv.conj)*u + Ainv.conj)
```

#### Compose two rotations (e.g. device ∘ trackball)

If you want to combine device rotation `(QA,QB)` with trackball rotation `(RA,RB)`, form a composed pair `(A,B)`:

```text
set A = QA*RA - QB*(RB.conj) in
set B = QA*RB + QB*(RA.conj) in
...
```

Swap the order if you want trackball ∘ device instead.

#### Base rotations (yaw/pitch/roll style building blocks)

If you want a “base rotation” about a principal axis by an angle `t` (in radians), you can build an SU(2) pair directly. Let:

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

Tip: if you store `t` in a handle like `D1`, use `D1.x` (real part) as the angle.

#### Sphere example (minimal): rotate then `sin`

This is a compact “Riemann sphere” template that:

- maps the screen point onto the sphere (front hemisphere),
- composes device + trackball rotations,
- applies the **inverse** rotation (so dragging feels like grabbing the sphere),
- evaluates a simple function (`sin`) on the rotated sphere coordinate.

```text
set R = 1.5 in
set r2 = abs^2 in
if(r2 > R*R, 0,
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
)
```

The `i*u` / `(-i)` sandwich is a fixed basis alignment so “screen up/right” matches the on-screen trackball axes.

#### Recover yaw/pitch/roll (optional)

If you really need Euler-style angles, derive them from `(A,B)` by first converting to a quaternion:

- `w = A.x`, `z = A.y`, `x = B.x`, `y = B.y`

Then apply your preferred yaw/pitch/roll convention. Here is one **concrete example in the Reflex formula language** (Euler order **`YXZ`**: yaw about **Y**, then pitch about **X**, then roll about **Z**).

Notes:

- Reflex supports `arg(z)` (and synonym `argument(z)`): it returns the **phase** of `z` (i.e. `atan2(im(z), re(z))`) as a **real** angle in radians.
- `arg(z, k)` forwards `k` to `ln(z, k)` so you can control the branch cut (it is computed as `imag(ln(z, k))`).
- Clamping to `[-1, 1]` is written explicitly with nested `if(...)`.

```text
set qw = A.x in
set qx = B.x in
set qy = B.y in
set qz = A.y in

set tPitch = 2*(qw*qx - qy*qz) in
set tPitchClamped = if(tPitch < -1, -1, if(tPitch > 1, 1, tPitch)) in
set pitchX = asin(tPitchClamped) in

set yawNum = 2*(qw*qy + qx*qz) in
set yawDen = 1 - 2*(qx*qx + qy*qy) in
set yawY = arg(yawDen + i*yawNum) in

set rollNum = 2*(qw*qz + qx*qy) in
set rollDen = 1 - 2*(qx*qx + qz*qz) in
set rollZ = arg(rollDen + i*rollNum) in

yawY + i*pitchX
```

This computes `pitchX`, `yawY`, and `rollZ` (all real, in radians). The final line returns a single complex number packing **yaw** (real part) and **pitch** (imag part); to inspect roll instead, replace the last line with `rollZ` (or `rollZ + i*pitchX`).

Euler angles always have singularities (for `YXZ`, the singularity is at `pitchX = ±π/2`), so SU(2) is the recommended default.

Rules of thumb:

- A formula can use the `F` family and/or the `D` family, plus the `W` pair.
  - If both `F` and `D` appear, Reflex4You uses a “first finger decides” rule: if your first touch starts closer to the first fixed handle (`F1`), the gesture assigns fingers to `F1`, `F2`, ... (then falls back to dynamic `D*` if you use more fingers); otherwise, it behaves like pure `D*` mode (closest-handle matching).
- If a handle only appears inside an `x`/`real` projection, dragging is locked to the real axis (and similarly for `y`/`imag`). Use both axes anywhere in the formula to regain free movement.
- URLs remember the current formula and each handle’s last position, so you can bookmark exact views.

## Formula Language

The input accepts succinct expressions with complex arithmetic, composition, and built-in helpers:

- **Variables:** `z`, `x`, `y`, `real`, `imag`.
- **Finger tokens:** `F0`‑`F3`, `D0`‑`D3`, `W0`, `W1`.
- **3D rotations (SU(2))**: `QA`, `QB` (device), `RA`, `RB` (trackball).
- **Literals:** `1.25`, `-3.5`, `2+3i`, `0,1`, `i`, `-i`, `j` (for `-½ + √3/2 i`).
- **Operators:** `+`, `-`, `*`, `/`, power (`^` with integer exponents), composition (`o(f, g)` or `f $ g`), repeated composition (`oo(f, n)` or `f $$ n`).
  - Dot composition is equivalent: `f $ expr` is the same as `expr.f` (so `a.b` means `b(a(z))`).
- **Functions:** `exp`, `sin`, `cos`, `tan`, `atan`/`arctan`, `arg`/`argument`, `asin`/`arcsin`, `acos`/`arccos`, `ln`, `sqrt`, `abs`/`modulus`, `abs2`, `floor`, `conj`, `heav`, `isnan`, `ifnan`/`iferror`. `sqrt(z, k)` desugars to `exp(0.5 * ln(z, k))`, so the optional second argument shifts the log branch; `heav(x)` evaluates to `1` when `x > 0` and `0` otherwise.
- **Conditionals:** comparisons (`<`, `<=`, `>`, `>=`, `==`), logical ops (`&&`, `||`), and `if(cond, then, else)`.
- **Bindings:**
  - `set name = value in body` introduces a **value** (evaluated once at the binding site; it can “capture” the current `z`).
  - `let name = expr in body` introduces a **function** (not evaluated until used; it always receives the ambient `z`).
    - You can also define extra parameters: `let name(p1, p2, ...) = expr in body`.
    - `z` is reserved and cannot be used as a parameter name.

Examples:

```text
f $ ((z - W0) / (W1 - W0))    # pan/zoom/rotate via W gestures (W0 is the "zero" end)
sin $ z - D1                  # manual handle for offsetting input
set c = abs(z) in c / (1 + c) # temporary value
if(real < 0, conj(z), z)      # axis-aware interaction
```

### Functions (`let`) and calls

Reflex formulas are **functions of `z`**, so a `let` binding defines a reusable function expression.

- **Unary functions (no extra params)**:
  - Define: `let f = z^2 + 1 in ...`
  - Use at the current `z`: `f` (shorthand for “apply to ambient `z`”).
  - Use at a specific input: `f(expr)` (equivalently `f $ expr`).

- **Multi-argument functions (extra params)**:
  - Define: `let max(w) = if(z < w, w, z) in ...`
  - Call with explicit arguments:
    - `max(a)` binds `w = a` and uses the current `z`.
    - `max(a, z0)` binds `w = a` and uses `z0` **instead of** the ambient `z` (the optional final argument overrides `z`).
  - If you reference a function that requires extra parameters without supplying them, it is a compile-time error.

- **Repeated composition (`$$`)** works inside `let` bodies as well:
  - `f $$ n` repeats `f` exactly `n` times (same as `oo(f, n)`).
  - Example:

```text
let fn = z^2 + 0.1 $$ 4 in
fn
```

This means apply \(z \mapsto z^2 + 0.1\) four times.

Tips:

- Use `W0`/`W1` whenever you want freeform navigation without moving your handles onto the area of interest.
- To reset a handle, click its value chip and type `0` (or any new complex literal). The formula itself is preserved across reloads because it lives in the URL.

### Solo selection (`solos=...`)

When a formula has many parameters (finger constants), you can restrict which ones your fingers can move by selecting **solos**. This is stored in the URL:

- `solos=D1,D2` (comma-separated labels)
- If `solos` is absent or empty, fingers can move **all parameters**.

## Sharing on-demand videos (URL animations)

Reflex4You links can optionally include **time-based animations** for finger constants. This is intended for sharing “on-demand videos”: open the link and the parameters animate automatically.

- **Per-constant animation parameter**: append `A` to any finger constant name to animate it.
  - Example: `D1A=1+2i..-1-3i`
  - The `..` separates the interval start and end.
  - Only **one interval per constant** is supported (keep it simple; sequences can be modeled inside the formula if needed).

- **Timing (`t`)**: all animated constants run **simultaneously**, using the same duration.
  - Default: `t=5s`
  - Override: `t=10s` (the trailing `s` is optional; only seconds are supported for now).

- **Pause / edit handoff**: tapping/clicking anywhere while the animation is playing **stops animations and enters edit mode** for the rest of the session (no returning to animation mode until a refresh).

- **Looping**: animations repeat **forward only** (start → end, then jump back to start and repeat). Back-and-forth motion can be modeled inside the formula if needed.

### Editing an animation interval

Use the menu:

1. **Set animation start**: records the current values for all active handles.
2. Move the handles to the desired end state.
3. **Set animation end**: writes a single `start..end` interval for each active handle into the URL.
4. **Set animation time**: sets `t=` in the URL.

### Viewer mode vs edit mode (`edit=true`)

When opening a link that contains a formula (`?formula=...` or `?formulab64=...`), Reflex4You starts in a **viewer mode**:

- The menu, formula editor overlay, finger constant value chips, and finger dots are hidden **until you interact** with the page (tap/click/press a key).

If you want the full UI to be visible immediately, add:

- `edit=true`

When `edit=true` is present, **URL animations do not play** (so you can adjust and re-share links without the view moving under you).

## Forking / Developing Locally

```bash
cd apps/reflex4you
npm install

# Run the viewer (any static server works)
npx http-server .
# ...then open http://localhost:8080/apps/reflex4you in your browser

# Optional: run parser/engine unit tests
npm run test:node
```

Implementation details (parsers, traversal helpers, WebGL shaders, etc.) live in the source tree under `apps/reflex4you`. Use the commands above if you plan to fork or extend the project locally.***

## Running the Playwright UI tests

The Playwright specs cover the interactive UI pieces (menu, finger indicators, etc.). Getting them to run locally mostly comes down to installing the managed browsers once:

1. Install dependencies (only once per clone):

   ```bash
   cd apps/reflex4you
   npm install
   ```

2. Install the browsers Playwright expects. Chromium is mandatory; Firefox is enabled in `playwright.config.js`, so grab both:

   ```bash
   npx playwright install chromium firefox
   # Optional but helpful on bare Linux images:
   # npx playwright install-deps   # may require sudo
   ```

3. Run the suite (this command automatically starts `http-server` on port 5173 before executing the tests):

   ```bash
   npx playwright test
   ```

Use `npx playwright test --project=chromium` if you only want to debug Chromium, but please run the full matrix before sharing your changes so we keep Firefox coverage healthy.***

## Pre-merge checklist (Reflex4You)

- [ ] **Version bump (one command)**: from the repo root, run one of:
  - [ ] `npm run reflex4you:version -- major` (bumps `APP_VERSION` and resets SW/cache versions)
  - [ ] `npm run reflex4you:version -- minor` (keeps `APP_VERSION`, bumps SW/cache versions)
  - [ ] `npm run reflex4you:version -- set …` (explicit versions / revert)
  See `apps/reflex4you/VERSIONING.md` for details and what files are touched.
- [ ] **PR preview cache-busting** (recommended): ensure `__REFLEX_BUILD_ID__` placeholders exist in:
  - [ ] `apps/reflex4you/index.html`
  - [ ] `apps/reflex4you/formula.html`
  - [ ] `apps/reflex4you/explore.html`
  (CI injects the commit SHA so HTML can cache-bust JS module imports.)
- [ ] **If you changed any boot-critical files**, ensure they’re precached:
  - [ ] Verify `PRECACHE_URLS` in `apps/reflex4you/service-worker.js` includes any new/renamed modules/assets (viewer + formula page).
- [ ] **Run tests**:
  - [ ] `npm run test:node` (from `apps/reflex4you`)
  - [ ] `npx playwright test` (from `apps/reflex4you`, after `npx playwright install chromium firefox`)
- [ ] **PWA sanity**:
  - [ ] Load `index.html` and `formula.html`, hard reload once, then verify both are controlled by the SW and still work offline (Application → Service Workers + Cache Storage).
