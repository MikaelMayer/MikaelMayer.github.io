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
   set c = (z - W1) / (W2 - W1) in (z^2 + c $$ 20) $ 0
   ```

   Here `W1`/`W2` follow your fingers: a single finger pans both values, while a two-finger gesture solves the similarity transform (pan, zoom, rotate) and applies it to the pair. `f $ g` means “compose with” (`f(g(z))`), and `f $$ n` repeats `f` exactly `n` times. Parentheses are optional, and the complete formula syntax is summarized below under **Formula Language**.

4. **Dive into advanced physics-style demos.** Handles plus gesture control make it easy to model optical experiments. For instance, the following formula mimics both the Michelson interferometer and Young’s double-slit patterns:

   ```text
   let sqrt = exp $ 0.5*ln in
   set d1 = 2*D1 in
   set scale = 5 in
   set r = sqrt $ abs((x$d1) + (y$d1))^2 + x^2 + y^2 $ scale*(z - D3) in
   set r2 = sqrt $ abs((x$d1) - (y$d1))^2 + x^2 + y^2 $ scale*(z + D3) in
   abs $
   10*z $ 1/(r^2)*exp(8*abs(x$D2)*i*r) + 1/(r2^2)*exp(8*abs(x$D2)*i*r2)
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
| `F1`, `F2`, `F3` | Fixed handles | Fingers are assigned in order (first touch → `F1`, etc.). |
| `D1`, `D2`, `D3` | Dynamic handles | Touch the handle closest to the complex point you want to move. |
| `W1`, `W2` | Workspace frame | Gestures update both values together. One finger pans; two fingers capture the full similarity transform (pan, zoom, rotate) so you can navigate like Google Maps. |

Rules of thumb:

- A formula can use either the `F` family or the `D` family, plus the `W` pair. If both `F` and `D` appear, the UI refuses to activate the handles to avoid ambiguity.
- If a handle only appears inside an `x`/`real` projection, dragging is locked to the real axis (and similarly for `y`/`imag`). Use both axes anywhere in the formula to regain free movement.
- URLs remember the current formula and each handle’s last position, so you can bookmark exact views.

## Formula Language

The input accepts succinct expressions with complex arithmetic, composition, and built-in helpers:

- **Variables:** `z`, `x`, `y`, `real`, `imag`.
- **Finger tokens:** `F1`‑`F3`, `D1`‑`D3`, `W1`, `W2`.
- **Literals:** `1.25`, `-3.5`, `2+3i`, `0,1`, `i`, `-i`, `j` (for `-½ + √3/2 i`).
- **Operators:** `+`, `-`, `*`, `/`, power (`^` with integer exponents), composition (`o(f, g)` or `f $ g`), repeated composition (`oo(f, n)` or `f $$ n`).
- **Functions:** `exp`, `sin`, `cos`, `tan`, `atan`, `ln`, `sqrt`, `abs`/`modulus`, `floor`, `conj`, `heav`. `sqrt(z, k)` desugars to `exp(0.5 * ln(z, k))`, so the optional second argument shifts the log branch; `heav(x)` evaluates to `1` when `x > 0` and `0` otherwise.
- **Conditionals:** comparisons (`<`, `<=`, `>`, `>=`, `==`), logical ops (`&&`, `||`), and `if(cond, then, else)`.
- **Bindings:** `set name = value in body` introduces reusable values (serialized with the formula when shared).

Examples:

```text
f $ ((z - W2) / (W1 - W2))    # pan/zoom/rotate via W gestures
sin $ z - D1                  # manual handle for offsetting input
set c = abs(z) in c / (1 + c) # temporary value
if(real < 0, conj(z), z)      # axis-aware interaction
```

Tips:

- Use `W1`/`W2` whenever you want freeform navigation without moving your handles onto the area of interest.
- To reset a handle, click its value chip and type `0` (or any new complex literal). The formula itself is preserved across reloads because it lives in the URL.

### Solo selection (`solos=...`)

When a formula has many finger constants, you can restrict which ones can “catch” your finger by selecting **solos**. This is stored in the URL:

- `solos=D1,D2` (comma-separated labels)
- If `solos` is absent or empty, Reflex4You is in **unrestricted** mode (all constants can capture).

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

- [ ] **Bump the app major version**: update `APP_VERSION` in `apps/reflex4you/main.js`.
- [ ] **Keep service-worker in sync with the major version**:
  - [ ] Update `CACHE_MINOR` in `apps/reflex4you/service-worker.js` (should start with the same major, e.g. `12.x`).
  - [ ] Update the SW registration cache-buster query in **both** places:
    - [ ] `apps/reflex4you/main.js` (`service-worker.js?sw=…`)
    - [ ] `apps/reflex4you/formula-page.mjs` (`service-worker.js?sw=…`)
- [ ] **Update any hardcoded UI version fallback**: `apps/reflex4you/index.html` (`#app-version-pill` initial text) so it matches the current major.
- [ ] **If you changed any boot-critical files**, ensure they’re precached:
  - [ ] Verify `PRECACHE_URLS` in `apps/reflex4you/service-worker.js` includes any new/renamed modules/assets (viewer + formula page).
- [ ] **Run tests**:
  - [ ] `npm run test:node` (from `apps/reflex4you`)
  - [ ] `npx playwright test` (from `apps/reflex4you`, after `npx playwright install chromium firefox`)
- [ ] **PWA sanity**:
  - [ ] Load `index.html` and `formula.html`, hard reload once, then verify both are controlled by the SW and still work offline (Application → Service Workers + Cache Storage).
