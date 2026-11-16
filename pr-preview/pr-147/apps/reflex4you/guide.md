# Reflex4You Guide

This guide covers app usage, gestures, sharing, and development workflows. For
the formula syntax and optimization guidance, see README.md.

## Quick Start

1. **Open the live app:** https://mikaelmayer.github.io/apps/reflex4you/  
   The viewer presents the complex function `z -> z` across the rectangular
   domain `[-4 - 4i, 4 + 4i]`, clamped to your screen. Because every formula
   describes a function of `z`, the shorthand `z` means "map `z` to itself."

2. **Enter a formula.** Try:

   ```
   sin(z^2 + D2) $ z - D1
   ```

   Handles `D1` and `D2` appear. Drag them to adjust the parameters; their
   coordinates (and the formula) are stored directly in the URL, so sharing the
   link reproduces the exact view for anyone else.

3. **Explore with gestures.** To inspect something Mandelbrot-like without
   moving handles onto the feature, use the workspace frame:

   ```
   set c = (z - W0) / (W1 - W0) in (z^2 + c $$ 20) $ 0
   ```

   Here `W0`/`W1` follow your fingers: a single finger pans both values, while a
   two-finger gesture solves the similarity transform (pan, zoom, rotate) and
   applies it to the pair. `f $ g` means "compose with" (`f(g(z))`), and `f $$ n`
   repeats `f` exactly `n` times. Formula syntax is summarized in README.md
   under **Formula Language**.

4. **Dive into advanced physics-style demos.** Handles plus gesture control
   make it easy to model optical experiments. For instance, the following
   formula mimics both the Michelson interferometer and Young's double-slit
   patterns:

   ```text
   let sqrt = exp $ 0.5*ln in
   set d1 = 2*D1 in
   set scale = 5 in
   set r = sqrt $ abs(d1.x + i*d1.y)^2 + x^2 + y^2 $ scale*(z - D3) in
   set r2 = sqrt $ abs(d1.x - i*d1.y)^2 + x^2 + y^2 $ scale*(z + D3) in
   abs $
   10*z $ 1/(r^2)*exp(8*abs(D2.x)*i*r) + 1/(r2^2)*exp(8*abs(D2.x)*i*r2)
   ```

   Drag `D1` to change the arm angle, `D2` to tweak the wavelength, and `D3` to
   offset the detectors; the visual interference pattern updates instantly and
   the full configuration is still shareable via the URL.

## Install as a PWA

- On Chrome/Edge/Android, open https://mikaelmayer.github.io/apps/reflex4you/,
  open the browser menu, and choose **Install app** (or **Add to Home screen**
  on iOS Safari).
- The shipped `manifest.json` and service worker let the viewer cache
  `index.html`, all ES modules, and the WebGL assets so you can explore saved
  formulas even when you're offline.
- Updates ship automatically: when a new version is published, the service
  worker pulls fresh files after the next load and activates on the following
  visit.

Interaction constants, SU(2) rotations, and VR formulas are documented in
README.md (they are referenced often when writing formulas).

## Visualization tricks used in the videos

This section records general-purpose tricks that proved useful when building
animated math visualizations, so they can be reused reliably in future videos.

### Split-screen layout using domain-space offsets (no view mapping)

Instead of introducing a separate "view transform", both plots are kept in
**domain coordinates**.  
At the very end, we:
- select which plot to draw (for example, by `y < 0`)
- offset it vertically
- apply a single global zoom

```text
# final layout (zoom and offsets only here)
if y < 0 then
  realGraph    $ z*S $ z+2*i
else
  complexGraph $ z*S $ z-2*i
```

This keeps all geometry, grids, and hit-tests consistent.

### Keep complex plots pure; apply scaling only in the real graph

To preserve correct domain coloring, the complex graph must use the **true
complex values**.  
Any vertical exaggeration is applied only when evaluating the real graph.

```text
# real-only overrides
set K = 6 in # for small functions
let approx  = K*approx0  $ x in
let dApprox = K*dApprox0 $ x in
let ref     = K*ref0     $ x in
```

### Constant-width real curves using the derivative (tangent projection)

Naively testing `|y - f(x)| < g` produces variable thickness depending on
slope. Instead, project onto the tangent direction:

```text
set fx0 = real(approx) in
set s   = clamp(iferror(real(dApprox), 0), -120, 120) in
set e0  = y - fx0 in
set h   = e0*s/(1+s^2) in
set fx1 = real((K*approx0) $ (x+h)) in
(h^2 + (fx1 - y)^2) < g^2
```

This gives a visually constant-width curve even near steep slopes or flat
peaks. Often it's possible to have a closed form of the derivative which
should be preferred compared to approximating the derivative.

### Draw order matters: reference behind approximation

When multiple hit-tests can succeed at the same pixel, the order determines
what remains visible.

```text
if hitApprox > 0.5 then approx else
  if hitRef > 0.5 then colRef else bg
```

Putting the approximation first avoids it being "erased" by the reference at
overlapping regions (for example, near extrema).

### Grids and axes in domain coordinates (not screen coordinates)

Grids and axes are computed directly from `(x, y)` in domain space.

```text
set hitAxes = abs(x) < axisW || abs(y) < axisW in
set hitGrid =
  abs(x - x.floor) < gridW ||
  abs(y - y.floor) < gridW
in
```

Panel-specific colors can then be applied without changing the geometry.

### Error contours as thin bands around a target value

To visualize approximation error without clutter, highlight a narrow band
around a target error (for example, 5%).

```text
set e = abs(ref0 - approx0) in
if abs(e - err0) < errW then colErr else approx0
```

This makes convergence for series visually readable as shrinking contours.

### Avoid `0 x inf`: interpolate terms with `if`, not multiplication

When series terms grow large, multiplying them by a fading weight can produce
numerical artifacts.  
Instead, only interpolate **the single edge term**, and stop computing further
terms explicitly.

```text
let fs(k, s, term) =
  if k < n then s + term else
    if k == n then s + u*term else s
in

let ft(k, s, term) =
  if k < n then nextTerm else 0
in
```

This avoids undefined `0 x inf` behavior and keeps the renderer stable.

### Clamp and easing functions as first-class building blocks

Small helper functions dramatically simplify timeline logic and improve visual
smoothness.

```text
let clamp(v, lo, hi) = if v < lo then lo else if v > hi then hi else v in
let ease01(u) = u^2*(3 - 2*u) in
```

Using eased interpolation for parameter changes avoids abrupt visual artifacts,
especially when animating series terms.

### Color conventions in domain coloring matter

In Reflex4You domain coloring:
- `1` is red
- large magnitudes (for example, `1000`) appear white
- `j` is green, `j.conj` is blue

This can be exploited to control perceived brightness:

```text
set colAxesW = 1000 in   # white axes
set colGridW = 400  in   # light grid
set colAxesB = 0    in   # black axes
set colGridB = 0    in   # black grid
set colRef   = j    in   # green reference
```

### Language constraints (not just style)

Some constructs are **not supported**, not merely discouraged:

- `i` is a reserved identifier (do not use as a variable name)
- `!=` is not supported in conditionals  
  -> use `<` / `>` logic instead
- Prefer `let` functions with implicit `z` so they compose cleanly with `$`

```text
# good
let f = z^2 + 1 in

# avoid (not supported)
# if a != b then ...
```

These patterns form a reusable toolkit for building stable, readable, and
visually accurate mathematical animations in Reflex4You.

## Solo selection (`solos=...`)

When a formula has many parameters (finger constants), you can restrict which
ones your fingers can move by selecting **solos**. This is stored in the URL:

- `solos=D1,D2` (comma-separated labels)
- If `solos` is absent or empty, fingers can move **all parameters**.

## Sharing on-demand videos (URL animations)

Reflex4You links can optionally include **time-based animations** for finger
constants. This is intended for sharing "on-demand videos": open the link and
the parameters animate automatically.

- **Per-constant animation parameter**: append `A` to any finger constant name
  to animate it.
  - Example: `D1A=1+2i..-1-3i`
  - The `..` separates the interval start and end.
  - Only **one interval per constant** is supported (keep it simple; sequences
    can be modeled inside the formula if needed).

- **Timing (`t`)**: all animated constants run **simultaneously**, using the
  same duration.
  - Default: `t=5s`
  - Override: `t=10s` (the trailing `s` is optional; only seconds are supported
    for now).

- **Pause / edit handoff**: tapping/clicking anywhere while the animation is
  playing **stops animations and enters edit mode** for the rest of the
  session (no returning to animation mode until a refresh).

- **Looping**: animations repeat **forward only** (start -> end, then jump back
  to start and repeat). Back-and-forth motion can be modeled inside the formula
  if needed.

### Editing an animation interval

Use the menu:

1. **Set animation start**: records the current values for all active handles.
2. Move the handles to the desired end state.
3. **Set animation end**: writes a single `start..end` interval for each active
   handle into the URL.
4. **Set animation time**: sets `t=` in the URL.

### Viewer mode vs edit mode (`edit=true`)

When opening a link that contains a formula (`?formula=...` or `?formulab64=...`),
Reflex4You starts in a **viewer mode**:

- The menu, formula editor overlay, finger constant value chips, and finger dots
  are hidden **until you interact** with the page (tap/click/press a key).

If you want the full UI to be visible immediately, add:

- `edit=true`

When `edit=true` is present, **URL animations do not play** (so you can adjust
and re-share links without the view moving under you).

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

Implementation details (parsers, traversal helpers, WebGL shaders, and so on)
live in the source tree under `apps/reflex4you`. Use the commands above if you
plan to fork or extend the project locally.

## Running the Playwright UI tests

The Playwright specs cover the interactive UI pieces (menu, finger indicators,
and so on). Getting them to run locally mostly comes down to installing the
managed browsers once:

1. Install dependencies (only once per clone):

   ```bash
   cd apps/reflex4you
   npm install
   ```

2. Install the browsers Playwright expects. Chromium is mandatory; Firefox is
   enabled in `playwright.config.js`, so grab both:

   ```bash
   npx playwright install chromium firefox
   # Optional but helpful on bare Linux images:
   # npx playwright install-deps   # may require sudo
   ```

3. Run the suite (this command automatically starts `http-server` on port 5173
   before executing the tests):

   ```bash
   npx playwright test
   ```

Use `npx playwright test --project=chromium` if you only want to debug
Chromium, but please run the full matrix before sharing your changes so we
keep Firefox coverage healthy.

## Pre-merge checklist (Reflex4You)

- [ ] **Version bump (one command)**: from the repo root, run one of:
  - [ ] `npm run reflex4you:version -- major` (bumps `APP_VERSION` and resets
        SW/cache versions)
  - [ ] `npm run reflex4you:version -- minor` (keeps `APP_VERSION`, bumps
        SW/cache versions)
  - [ ] `npm run reflex4you:version -- set ...` (explicit versions / revert)
  See `apps/reflex4you/VERSIONING.md` for details and what files are touched.
- [ ] **PR preview cache-busting** (recommended): ensure
      `__REFLEX_BUILD_ID__` placeholders exist in:
  - [ ] `apps/reflex4you/index.html`
  - [ ] `apps/reflex4you/formula.html`
  - [ ] `apps/reflex4you/explore.html`
  (CI injects the commit SHA so HTML can cache-bust JS module imports.)
- [ ] **If you changed any boot-critical files**, ensure they are precached:
  - [ ] Verify `PRECACHE_URLS` in `apps/reflex4you/service-worker.js` includes
        any new/renamed modules/assets (viewer + formula page).
- [ ] **Run tests**:
  - [ ] `npm run test:node` (from `apps/reflex4you`)
  - [ ] `npx playwright test` (from `apps/reflex4you`, after
        `npx playwright install chromium firefox`)
- [ ] **PWA sanity**:
  - [ ] Load `index.html` and `formula.html`, hard reload once, then verify both
        are controlled by the service worker and still work offline
        (Application -> Service Workers + Cache Storage).
