# Reflex4You

Reflex4You is an interactive complex-function explorer. Type a formula, drag the on-screen handles, or pinch to zoom, and the fractal view updates in real time. This document focuses on using the app; implementation details live in the source.

## Quick Start

```bash
cd apps/reflex4you
npm install

# Run the viewer (any static server works)
npx http-server .
# ...then open http://localhost:8080/apps/reflex4you in your browser
```

Playwright/node tests are optional but available:

```bash
npm run test:node
```

## Interaction Constants

Formulas can reference special complex constants that you edit directly on the canvas:

| Label family | Meaning | How to move |
| --- | --- | --- |
| `F1`, `F2`, `F3` | Fixed handles | Fingers are assigned in order (first touch → `F1`, etc.). |
| `D1`, `D2`, `D3` | Dynamic handles | Touch the handle closest to the complex point you want to move. |
| `W1`, `W2` | Workspace frame | Gestures update both values together. One finger pans; two fingers capture the full similarity transform (pan, zoom, rotate) so you can navigate like Google Maps. |

Rules of thumb:

- A formula can use either the `F` family or the `D` family, plus the `W` pair. If both `F` and `D` appear, the UI refuses to activate the handles to avoid ambiguity.
- If a handle only appears inside an `x`/`real` projection, dragging is locked to the real axis (and similarly for `y`/`imag`). Use both axes anywhere in the formula to regain free movement.
- URLs remember the current formula and each handle’s last position, so you can bookmark exact views.

## Writing Formulas

The input accepts succinct expressions with complex arithmetic, composition, and built-in helpers:

- **Variables:** `z`, `x`, `y`, `real`, `imag`.
- **Finger tokens:** `F1`‑`F3`, `D1`‑`D3`, `W1`, `W2`.
- **Literals:** `1.25`, `-3.5`, `2+3i`, `0,1`, `i`, `-i`, `j` (for `-½ + √3/2 i`).
- **Operators:** `+`, `-`, `*`, `/`, power (`^` with integer exponents), composition (`o(f, g)` or `f $ g`), repeated composition (`oo(f, n)` or `f $$ n`).
- **Functions:** `exp`, `sin`, `cos`, `tan`, `atan`, `ln`, `abs`, `floor`, `conj`.
- **Conditionals:** comparisons (`<`, `<=`, `>`, `>=`, `==`), logical ops (`&&`, `||`), and `if(cond, then, else)`.
- **Bindings:** `set name = value in body` introduces reusable values (serialized with the formula when shared).

Examples:

```text
(z - W1) / W2                 # pan/zoom via gestures
sin(z $ D1)                   # manual handle for offsetting input
set c = abs(z) in c / (1 + c) # temporary value
if(real < 0, conj(z), z)      # axis-aware interaction
```

Tips:

- Use `W1`/`W2` whenever you want freeform navigation without moving your handles onto the area of interest.
- Mix `W` with `D` or `F` for advanced effects: e.g., `f((z - W1 - D1)/W2)` pans/zooms globally while still letting you drag `D1` as a parameter inside the function.
- To reset pointers, clear the formula or press reload; the query string always reflects the latest state.
