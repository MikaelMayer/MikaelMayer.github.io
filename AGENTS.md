# AGENTS.md

## Purpose

This file gives coding agents practical, repo-specific guidance for reliable execution in Cursor Cloud.

## Cursor Cloud specific instructions

- Use Node/npm from the workspace root.
- Install dependencies before running Playwright tests:
  - `npm install`
  - `npx playwright install chromium`
- Prefer targeted test runs over broad/full-suite runs unless explicitly requested.

## High-signal testing guidance (apps/videodelay)

- Core delayed camera flows:
  - `npx playwright test tests/delaycam.spec.js --project=chromium`
- Share/save behavior:
  - `npx playwright test tests/delaycam.share.spec.js --project=chromium`
- If you need both:
  - `npx playwright test tests/delaycam.spec.js tests/delaycam.share.spec.js --project=chromium`

## Known baseline caveat

- `tests/delaycam.zoom.spec.js` currently includes one expectation for old zoom labels (`1.2x`, `1.7x`) and may fail against current UI labels (`2.8x`, `4x`).
- Treat that as unrelated unless your task explicitly changes zoom labels or the test itself.

## Quality-of-life notes

- Playwright config already starts a static server on `http://127.0.0.1:5173`.
- Camera tests run with fake media stream flags from `playwright.config.js`; no physical camera is required.
