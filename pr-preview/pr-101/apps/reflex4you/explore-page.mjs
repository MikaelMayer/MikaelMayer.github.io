import { ReflexCore, createDefaultFormulaAST, FINGER_DECIMAL_PLACES } from './core-engine.mjs';
import { parseFormulaInput } from './arithmetic-parser.mjs';
import { visitAst } from './ast-utils.mjs';
import { formatCaretIndicator } from './parse-error-format.mjs';
import {
  verifyCompressionSupport,
  readFormulaFromQuery,
  writeFormulaToSearchParams,
  replaceUrlSearch,
} from './formula-url.mjs';
import { setupMenuDropdown } from './menu-ui.mjs';
import { easeInOutCubic, lerp, waitForNextFrame } from './anim-utils.mjs';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Top portion of the screen (0..1). Bottom takes the remainder.
const TOP_FRACTION = 2 / 3;

// Number of miniature choices (excluding refresh).
const THUMB_COUNT = 7;

// View transition timing: seconds per unit of RMS finger distance.
// Example: distance 1 => 1 second when set to 1.
const TRANSITION_SECONDS_PER_DISTANCE = 1;
// Small-distance transitions were often too fast to perceive; ensure a minimum.
const MIN_TRANSITION_MS = 260;

// Thumbnail distance bands (roughly increasing).
// Note: THUMB_COUNT is 7; the last band is a pure random jump (no distance limit).
// The user-requested list has 6 items, so we insert one extra "very far" band to
// keep 7 thumbnails while maintaining an increasing progression.
const DISTANCE_BANDS = [
  { min: 0.001, max: 0.2 },
  { min: 0.2, max: 0.4 },
  { min: 0.4, max: 0.7 },
  { min: 0.7, max: 1.0 },
  { min: 1.0, max: 2.0 },
  { min: 2.0, max: 4.0 },
  { randomJump: true },
];

function bandForIndex(i) {
  const idx = Math.max(0, Math.min(THUMB_COUNT - 1, Number(i) || 0));
  return DISTANCE_BANDS[idx] || DISTANCE_BANDS[DISTANCE_BANDS.length - 1];
}

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const mainCanvas = document.getElementById('main-canvas');
const errorDiv = document.getElementById('error');
const gridEl = document.getElementById('choices-grid');
const undoButton = document.getElementById('undo-button');
const redoButton = document.getElementById('redo-button');
const menuButton = document.getElementById('menu-button');
const menuDropdown = document.getElementById('menu-dropdown');

// Apply the top split fraction.
try {
  const pct = Math.max(10, Math.min(90, Math.round(TOP_FRACTION * 100)));
  document.documentElement.style.setProperty('--top-percent', `${pct}%`);
} catch (_) {
  // ignore
}

// ---------------------------------------------------------------------------
// Utilities (URL + finger parsing)
// ---------------------------------------------------------------------------

const FINGER_LABEL_REGEX = /^(?:[FD][1-9]\d*|W[12])$/;
const W_FINGER_ORDER = ['W1', 'W2'];

function isFingerLabel(label) {
  return typeof label === 'string' && FINGER_LABEL_REGEX.test(label);
}

function fingerFamily(label) {
  if (!label) return null;
  if (label.startsWith('F')) return 'fixed';
  if (label.startsWith('D')) return 'dynamic';
  if (label.startsWith('W')) return 'w';
  return null;
}

function fingerIndex(label) {
  if (!label) return -1;
  if (label === 'W1') return 0;
  if (label === 'W2') return 1;
  const match = /^([FD])([1-9]\d*)$/.exec(label);
  if (!match) return -1;
  return Number(match[2]) - 1;
}

function compareFingerLabels(a, b) {
  const fa = fingerFamily(a);
  const fb = fingerFamily(b);
  if (fa !== fb) {
    if (fa === 'w') return 1;
    if (fb === 'w') return -1;
  }
  return fingerIndex(a) - fingerIndex(b);
}

function sortedLabels(labels) {
  return (labels || []).filter(isFingerLabel).slice().sort(compareFingerLabels);
}

function parseComplexString(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\s+/g, '').toLowerCase();

  if (normalized.endsWith('i')) {
    const core = normalized.slice(0, -1);
    if (!core.length) return null;
    let splitIdx = -1;
    for (let i = core.length - 1; i > 0; i--) {
      const ch = core[i];
      if (ch === '+' || ch === '-') {
        splitIdx = i;
        break;
      }
    }
    if (splitIdx !== -1) {
      const realPart = core.slice(0, splitIdx) || '0';
      const imagPart = core.slice(splitIdx) || '0';
      const re = Number(realPart);
      const im = Number(imagPart);
      if (Number.isFinite(re) && Number.isFinite(im)) {
        return { x: re, y: im };
      }
    }
  }

  const tupleParts = normalized.split(',');
  if (tupleParts.length === 2) {
    const re = Number(tupleParts[0]);
    const im = Number(tupleParts[1]);
    if (Number.isFinite(re) && Number.isFinite(im)) {
      return { x: re, y: im };
    }
  }

  const realValue = Number(normalized);
  if (Number.isFinite(realValue)) {
    return { x: realValue, y: 0 };
  }
  return null;
}

const FINGER_DECIMAL_FACTOR = 10 ** FINGER_DECIMAL_PLACES;

function roundToFingerPrecision(value) {
  if (!Number.isFinite(value)) {
    return NaN;
  }
  const rounded = Math.round(value * FINGER_DECIMAL_FACTOR) / FINGER_DECIMAL_FACTOR;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatNumberForQuery(value) {
  const rounded = roundToFingerPrecision(value);
  if (!Number.isFinite(rounded)) {
    return null;
  }
  return rounded.toFixed(FINGER_DECIMAL_PLACES).replace(/\.?0+$/, '');
}

function formatComplexForQuery(re, im) {
  const realPart = formatNumberForQuery(re);
  const imagPart = formatNumberForQuery(Math.abs(im));
  if (!realPart || !imagPart) return null;
  const sign = im >= 0 ? '+' : '-';
  return `${realPart}${sign}${imagPart}i`;
}

function showError(message) {
  if (!errorDiv) return;
  if (message) {
    errorDiv.textContent = String(message);
    errorDiv.style.display = 'block';
  } else {
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';
  }
}

function rmsFingerDistance(baseFingers, otherFingers) {
  let sumSq = 0;
  let count = 0;
  for (const label of activeLabels) {
    const a = baseFingers?.[label];
    const b = otherFingers?.[label];
    if (!a || !b) continue;
    const dx = (b.x ?? 0) - (a.x ?? 0);
    const dy = (b.y ?? 0) - (a.y ?? 0);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
    sumSq += dx * dx + dy * dy;
    count += 1;
  }
  if (!count) return 0;
  return Math.sqrt(sumSq / count);
}

function shade01ForDistance(distance) {
  // 0 -> black, 1 -> mid-gray, infinity -> white
  const d = Number(distance);
  if (!Number.isFinite(d)) return 1;
  if (d <= 0) return 0;
  return d / (1 + d);
}

function insetPxForDistance(distance) {
  const d = Number(distance);
  const px = Number.isFinite(d) ? d * 10 : 2;
  return Math.max(0, Math.min(20, Math.round(px)));
}

// ---------------------------------------------------------------------------
// Finger usage analysis (kept consistent with index.html behavior)
// ---------------------------------------------------------------------------

function resolveAxisContext(parent, node) {
  if (
    parent &&
    parent.kind === 'Compose' &&
    parent.g === node &&
    parent.f &&
    (parent.f.kind === 'VarX' || parent.f.kind === 'VarY')
  ) {
    return parent.f.kind === 'VarX' ? 'x' : 'y';
  }
  return 'other';
}

function analyzeFingerUsage(ast) {
  const usage = {
    fixed: new Set(),
    dynamic: new Set(),
    w: new Set(),
  };
  const axisBuckets = new Map();
  if (!ast) {
    return { usage, axisConstraints: new Map() };
  }
  visitAst(ast, (node, meta) => {
    if (node?.kind !== 'FingerOffset') {
      return;
    }
    const slot = node.slot;
    const family = slot.startsWith('F') ? 'fixed' : slot.startsWith('D') ? 'dynamic' : 'w';
    usage[family].add(slot);
    const axisKind = resolveAxisContext(meta.parent, node);
    const bucket = axisBuckets.get(slot) || new Set();
    bucket.add(axisKind);
    axisBuckets.set(slot, bucket);
  });
  const axisConstraints = new Map();
  axisBuckets.forEach((bucket, slot) => {
    if (bucket.size === 1 && bucket.has('x')) {
      axisConstraints.set(slot, 'x');
    } else if (bucket.size === 1 && bucket.has('y')) {
      axisConstraints.set(slot, 'y');
    }
  });
  return { usage, axisConstraints };
}

function deriveFingerState(analysis) {
  const fixedSlots = sortedLabels(Array.from(analysis.usage.fixed));
  const dynamicSlots = sortedLabels(Array.from(analysis.usage.dynamic));
  const wSlots = W_FINGER_ORDER.filter((label) => analysis.usage.w.has(label));
  if (fixedSlots.length && dynamicSlots.length) {
    return {
      mode: 'invalid',
      fixedSlots: [],
      dynamicSlots: [],
      wSlots: [],
      axisConstraints: new Map(),
      error: 'Formulas cannot mix F* fingers with D* fingers.',
    };
  }
  const mode = fixedSlots.length ? 'fixed' : dynamicSlots.length ? 'dynamic' : 'none';
  const axisConstraints = new Map();
  [...fixedSlots, ...dynamicSlots, ...wSlots].forEach((label) => {
    if (analysis.axisConstraints.has(label)) {
      axisConstraints.set(label, analysis.axisConstraints.get(label));
    }
  });
  return { mode, fixedSlots, dynamicSlots, wSlots, axisConstraints };
}

// ---------------------------------------------------------------------------
// Explore state (maze history)
// ---------------------------------------------------------------------------

const HISTORY_LIMIT = 200;
const historyPast = [];
const historyFuture = [];

function snapshotKey({ formulaSource, fingers }) {
  const labels = Object.keys(fingers || {}).sort(compareFingerLabels);
  const parts = [`f=${String(formulaSource || '')}`];
  for (const label of labels) {
    const v = fingers[label];
    parts.push(`${label}=${formatComplexForQuery(v?.x, v?.y) || 'NaN'}`);
  }
  return parts.join('&');
}

function collectVisitedTopKeys() {
  const keys = new Set();
  for (const snap of historyPast) keys.add(snap.baseKey);
  for (const snap of historyFuture) keys.add(snap.baseKey);
  return keys;
}

function updateUndoRedoButtons() {
  if (undoButton) undoButton.disabled = historyPast.length < 2;
  if (redoButton) redoButton.disabled = historyFuture.length === 0;
}

function currentSnapshot() {
  return historyPast.length ? historyPast[historyPast.length - 1] : null;
}

function clampToView(core, x, y) {
  if (!core) return { x, y };
  const cx = Math.min(core.viewXMax, Math.max(core.viewXMin, x));
  const cy = Math.min(core.viewYMax, Math.max(core.viewYMin, y));
  return { x: cx, y: cy };
}

function randomInRange(min, max) {
  const a = Number(min);
  const b = Number(max);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return a + Math.random() * (b - a);
}

function proposeCandidate({ coreForClamp, baseFingers, labels, axisConstraints, band, avoidKeys }) {
  const candidate = {};
  for (const label of labels) {
    const base = baseFingers[label] || { x: 0, y: 0 };
    // W* finger constants must never be modified by exploration mode.
    // Keep them exactly as-is (no randomization, no clamping adjustments).
    if (String(label).startsWith('W')) {
      candidate[label] = { x: base.x, y: base.y };
      continue;
    }
    const axis = axisConstraints?.get?.(label) || null;
    if (band?.randomJump) {
      // Pure random jump (no distance limit): sample uniformly in view bounds.
      let x = randomInRange(coreForClamp.viewXMin, coreForClamp.viewXMax);
      let y = randomInRange(coreForClamp.viewYMin, coreForClamp.viewYMax);
      if (axis === 'x') y = base.y;
      if (axis === 'y') x = base.x;
      candidate[label] = clampToView(coreForClamp, x, y);
    } else {
      const r = randomInRange(band.min, band.max);
      const theta = Math.random() * Math.PI * 2;
      let dx = r * Math.cos(theta);
      let dy = r * Math.sin(theta);
      if (axis === 'x') dy = 0;
      if (axis === 'y') dx = 0;
      const unclamped = { x: base.x + dx, y: base.y + dy };
      candidate[label] = clampToView(coreForClamp, unclamped.x, unclamped.y);
    }
  }
  const key = snapshotKey({ formulaSource: activeFormulaSource, fingers: candidate });
  if (avoidKeys?.has?.(key)) {
    return null;
  }
  return { fingers: candidate, key };
}

function generateCandidates({ coreForClamp, baseFingers, labels, axisConstraints, visitedTopKeys, keepCandidates }) {
  const avoidKeys = new Set(visitedTopKeys || []);
  avoidKeys.add(snapshotKey({ formulaSource: activeFormulaSource, fingers: baseFingers }));
  const out = new Array(THUMB_COUNT).fill(null);

  for (let i = 0; i < THUMB_COUNT; i++) {
    const existing = keepCandidates?.[i] || null;
    if (existing && existing.key && existing.fingers) {
      out[i] = existing;
      avoidKeys.add(existing.key);
      continue;
    }
    const band = bandForIndex(i);
    let picked = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      const maybe = proposeCandidate({
        coreForClamp,
        baseFingers,
        labels,
        axisConstraints,
        band,
        avoidKeys,
      });
      if (maybe) {
        picked = { ...maybe, band };
        avoidKeys.add(maybe.key);
        break;
      }
    }
    // Worst-case fallback: no uniqueness, accept first proposal without avoidance.
    if (!picked) {
      const maybe = proposeCandidate({
        coreForClamp,
        baseFingers,
        labels,
        axisConstraints,
        band,
        avoidKeys: new Set(),
      });
      picked = { ...(maybe || { fingers: baseFingers, key: String(Math.random()) }), band };
    }
    out[i] = picked;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

let topCore = null;
let thumbCore = null;
let thumbWebglCanvas = null;
let activeFormulaSource = 'z';
let activeAst = createDefaultFormulaAST();
let activeLabels = [];
let activeAxisConstraints = new Map();
let activeFingerConfig = { fixedSlots: [], dynamicSlots: [], wSlots: [], axisConstraints: new Map() };

let isTransitioning = false;
let pendingTransitionToken = 0;

let uiFreezeDepth = 0;

function setChoiceVisibilityMode(mode, { selectedIndex = null } = {}) {
  if (!gridEl) return;
  const showAll = mode === 'all';
  for (const el of Array.from(gridEl.querySelectorAll('.thumb-button'))) {
    const idxRaw = el?.dataset?.thumbIndex;
    const isThumb = idxRaw != null;
    const isSelected = isThumb && Number(idxRaw) === Number(selectedIndex);
    const shouldHide = !showAll && !isSelected;
    el.classList.toggle('thumb-button--hidden', shouldHide);
    try {
      el.setAttribute('aria-hidden', shouldHide ? 'true' : 'false');
    } catch (_) {
      // ignore
    }
  }
  // Always hide refresh button in selected-only mode.
  const refresh = gridEl.querySelector('#refresh-button');
  if (refresh) {
    const shouldHide = !showAll;
    refresh.classList.toggle('thumb-button--hidden', shouldHide);
    try {
      refresh.setAttribute('aria-hidden', shouldHide ? 'true' : 'false');
    } catch (_) {
      // ignore
    }
  }
}

function pushUiFreeze() {
  uiFreezeDepth += 1;
  if (uiFreezeDepth === 1) {
    try {
      document.body?.classList?.add?.('ui-frozen');
    } catch (_) {
      // ignore
    }
    setUiDisabled(true);
  }
}

function popUiFreeze() {
  uiFreezeDepth = Math.max(0, uiFreezeDepth - 1);
  if (uiFreezeDepth === 0) {
    setUiDisabled(false);
    try {
      document.body?.classList?.remove?.('ui-frozen');
    } catch (_) {
      // ignore
    }
  }
}

async function withUiFrozen(fn) {
  pushUiFreeze();
  try {
    return await fn();
  } finally {
    popUiFreeze();
  }
}

function readFingersFromCore(core, labels) {
  const fingers = {};
  for (const label of labels) {
    const v = core.getFingerValue(label);
    fingers[label] = { x: v.x, y: v.y };
  }
  return fingers;
}

function applyFingersToCore(core, fingers) {
  for (const label of activeLabels) {
    const v = fingers[label];
    if (!v) continue;
    core.setFingerValue(label, v.x, v.y, { triggerRender: false });
  }
}

function setUiDisabled(disabled) {
  try {
    if (undoButton) undoButton.disabled = disabled || historyPast.length < 2;
    if (redoButton) redoButton.disabled = disabled || historyFuture.length === 0;
    if (gridEl) {
      gridEl.style.pointerEvents = disabled ? 'none' : '';
      for (const btn of Array.from(gridEl.querySelectorAll('button'))) {
        btn.disabled = !!disabled;
      }
    }
    if (mainCanvas) mainCanvas.style.pointerEvents = disabled ? 'none' : '';
    if (menuButton) menuButton.disabled = !!disabled;
    if (menuDropdown) {
      // If the dropdown is already open, also freeze its items.
      menuDropdown.style.pointerEvents = disabled ? 'none' : '';
      for (const item of Array.from(menuDropdown.querySelectorAll('button, [role="menuitem"]'))) {
        if (typeof item.disabled === 'boolean') item.disabled = !!disabled;
      }
    }
  } catch (_) {
    // ignore
  }
}

function isCanvasLikelyUniform(ctx, width, height, { samples = 40, threshold = 3 } = {}) {
  if (!ctx || !width || !height) return false;
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const n = Math.max(1, Math.floor(Number(samples) || 40));
  const thr = Math.max(0, Math.floor(Number(threshold) || 0));
  let data = null;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch (_) {
    return false;
  }
  if (!data || data.length < 4) return false;
  const pick = () => {
    const x = (Math.random() * w) | 0;
    const y = (Math.random() * h) | 0;
    const idx = (y * w + x) * 4;
    return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
  };
  const first = pick();
  for (let i = 1; i < n; i += 1) {
    const p = pick();
    if (
      Math.abs(p[0] - first[0]) > thr ||
      Math.abs(p[1] - first[1]) > thr ||
      Math.abs(p[2] - first[2]) > thr ||
      Math.abs(p[3] - first[3]) > thr
    ) return false;
  }
  return true;
}

function expandedBand(band, attempt, coreForClamp) {
  if (!band || band.randomJump) return band;
  const k = Math.max(1, Number(attempt) || 1);
  const baseMin = Number(band.min);
  const baseMax = Number(band.max);
  const viewDiag = coreForClamp ? Math.hypot(coreForClamp.viewXSpan, coreForClamp.viewYSpan) : Infinity;
  const cap = Number.isFinite(viewDiag) && viewDiag > 0 ? viewDiag * 1.5 : Infinity;
  const factor = 1.7 ** k;
  const nextMax = Math.min(baseMax * factor, cap);
  return {
    min: Number.isFinite(baseMin) ? baseMin : 0,
    max: Number.isFinite(nextMax) ? nextMax : (Number.isFinite(baseMax) ? baseMax : 1),
  };
}

async function animateTopToFingers(targetFingers, { durationMs } = {}) {
  if (!topCore || !targetFingers) return;

  // Cancel any in-flight animation.
  const token = ++pendingTransitionToken;
  isTransitioning = true;
  pushUiFreeze();

  try {
    const from = readFingersFromCore(topCore, activeLabels);
    const to = targetFingers;
    let resolvedDurationMs = durationMs;
    if (!Number.isFinite(resolvedDurationMs)) {
      const distance = rmsFingerDistance(from, to);
      if (Number.isFinite(distance) && distance > 0) {
        resolvedDurationMs = distance * TRANSITION_SECONDS_PER_DISTANCE * 1000;
        resolvedDurationMs = Math.max(MIN_TRANSITION_MS, resolvedDurationMs);
      } else {
        resolvedDurationMs = 0;
      }
    } else if (resolvedDurationMs > 0) {
      resolvedDurationMs = Math.max(MIN_TRANSITION_MS, resolvedDurationMs);
    }
    const start = performance.now();

    while (true) {
      if (token !== pendingTransitionToken) return; // cancelled
      const now = performance.now();
      const t = resolvedDurationMs <= 0 ? 1 : Math.min(1, (now - start) / resolvedDurationMs);
      const e = easeInOutCubic(t);

      for (const label of activeLabels) {
        const a = from[label] || { x: 0, y: 0 };
        const b = to[label] || a;
        const x = lerp(a.x, b.x, e);
        const y = lerp(a.y, b.y, e);
        topCore.setFingerValue(label, x, y, { triggerRender: false });
      }
      topCore.render();
      if (t >= 1) break;
      await waitForNextFrame();
    }

    // Snap to exact target at the end (avoid drift).
    applyFingersToCore(topCore, to);
    topCore.render();
    await waitForNextFrame();

    if (token !== pendingTransitionToken) return;
  } finally {
    isTransitioning = false;
    popUiFreeze();
  }
}

function updateUrlForBaseFingers(baseFingers) {
  const url = new URL(window.location.href);
  url.hash = '';
  const params = new URLSearchParams(url.search);
  params.delete('edit');
  // Canonicalize formula into the share params.
  return (async () => {
    await writeFormulaToSearchParams(params, activeFormulaSource);
    for (const label of activeLabels) {
      const v = baseFingers[label];
      const serialized = formatComplexForQuery(v?.x, v?.y);
      if (serialized) params.set(label, serialized);
      else params.delete(label);
    }
    replaceUrlSearch(params);
  })();
}

async function renderTop(snapshot) {
  if (!topCore || !snapshot) return;
  applyFingersToCore(topCore, snapshot.baseFingers);
  topCore.render();
  await waitForNextFrame();
}

async function renderThumbs(snapshot) {
  if (!gridEl || !thumbCore || !snapshot) return;

  const cells = Array.from(gridEl.querySelectorAll('[data-thumb-index]'));
  const sizeProbe = cells[0]?.querySelector?.('canvas') || null;
  const targetW = Math.max(64, Math.floor(sizeProbe?.clientWidth || 160));
  const targetH = Math.max(64, Math.floor(sizeProbe?.clientHeight || 110));

  for (let i = 0; i < THUMB_COUNT; i++) {
    const cell = gridEl.querySelector(`[data-thumb-index="${i}"]`);
    const canvas = cell?.querySelector?.('canvas');
    if (!canvas) continue;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    if (canvas.width !== targetW) canvas.width = targetW;
    if (canvas.height !== targetH) canvas.height = targetH;

    // Render via the shared WebGL thumb renderer, then blit into 2D canvas.
    let candidate = snapshot.candidates[i];
    if (candidate?.fingers) {
      // If a thumb renders as a solid color (40 random pixels identical),
      // reroll the candidate up to 5 times, widening the distance band each time.
      const visitedTopKeys = collectVisitedTopKeys();
      const avoidKeys = new Set(visitedTopKeys || []);
      avoidKeys.add(snapshot.baseKey);
      for (const c of snapshot.candidates || []) {
        if (c?.key) avoidKeys.add(c.key);
      }

      for (let reroll = 0; reroll < 5; reroll += 1) {
        const isRandomJump = !!candidate?.band?.randomJump;
        const dist = isRandomJump ? Infinity : rmsFingerDistance(snapshot.baseFingers, candidate.fingers);
        try {
          if (cell) {
            const insetPx = isRandomJump ? 20 : insetPxForDistance(dist);
            cell.style.setProperty('--thumb-inset', `${insetPx}px`);
          }
        } catch (_) {
          // ignore
        }

        applyFingersToCore(thumbCore, candidate.fingers);
        thumbCore.renderToPixelSize(targetW, targetH);
        try {
          thumbCore.gl?.finish?.();
        } catch (_) {
          // ignore
        }
        ctx.clearRect(0, 0, targetW, targetH);
        ctx.drawImage(thumbWebglCanvas, 0, 0, targetW, targetH);

        const uniform = isCanvasLikelyUniform(ctx, targetW, targetH, { samples: 40, threshold: 3 });
        if (!uniform) break;

        // Reroll candidate: expand the distance band each time so it converges.
        const baseBand = candidate?.band || bandForIndex(i);
        const nextBand = expandedBand(baseBand, reroll + 1, topCore);
        let next = proposeCandidate({
          coreForClamp: topCore,
          baseFingers: snapshot.baseFingers,
          labels: activeLabels,
          axisConstraints: activeAxisConstraints,
          band: nextBand,
          avoidKeys,
        });
        if (!next) {
          next = proposeCandidate({
            coreForClamp: topCore,
            baseFingers: snapshot.baseFingers,
            labels: activeLabels,
            axisConstraints: activeAxisConstraints,
            band: nextBand,
            avoidKeys: new Set(),
          });
        }
        if (!next) break;
        candidate = { ...next, band: { ...nextBand, randomJump: !!baseBand?.randomJump } };
        snapshot.candidates[i] = candidate;
        if (candidate.key) avoidKeys.add(candidate.key);
      }
    } else {
      try {
        if (cell) {
          cell.style.setProperty('--thumb-inset', '0px');
        }
      } catch (_) {
        // ignore
      }
    }
  }

  // Highlight selection.
  for (let i = 0; i < THUMB_COUNT; i++) {
    const cell = gridEl.querySelector(`[data-thumb-index="${i}"]`);
    cell?.classList?.toggle?.('selected', snapshot.selectedIndex === i);
  }
}

async function renderAll() {
  const snap = currentSnapshot();
  if (!snap) return;
  await renderTop(snap);
  await renderThumbs(snap);
  updateUndoRedoButtons();
}

// ---------------------------------------------------------------------------
// UI construction + interactions
// ---------------------------------------------------------------------------

function ensureGridBuilt() {
  if (!gridEl) return;
  if (gridEl.childElementCount) return;

  for (let i = 0; i < THUMB_COUNT; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'thumb-button';
    btn.dataset.thumbIndex = String(i);

    const canvas = document.createElement('canvas');
    canvas.className = 'thumb-canvas';

    btn.appendChild(canvas);
    gridEl.appendChild(btn);
  }

  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'thumb-button refresh-button';
  refresh.id = 'refresh-button';
  refresh.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
      <path d="M21 3v6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
    Refresh
  `;
  gridEl.appendChild(refresh);
}

function commitSnapshot(snapshot, { force = false } = {}) {
  const last = historyPast.length ? historyPast[historyPast.length - 1] : null;
  if (!force && last && last.baseKey === snapshot.baseKey) {
    // Same node; just replace in-place (e.g. first init).
    historyPast[historyPast.length - 1] = snapshot;
    return;
  }
  historyPast.push(snapshot);
  if (historyPast.length > HISTORY_LIMIT) {
    historyPast.splice(0, historyPast.length - HISTORY_LIMIT);
  }
}

function undo() {
  if (historyPast.length < 2) return;
  const from = historyPast[historyPast.length - 1];
  const current = historyPast.pop();
  historyFuture.push(current);
  const target = historyPast[historyPast.length - 1];

  (async () => {
    if (!from || !target) return;
    await animateTopToFingers(target.baseFingers);
    await updateUrlForBaseFingers(target.baseFingers);
    await renderThumbs(target);
    updateUndoRedoButtons();
  })().catch(() => {});
}

function redo() {
  if (!historyFuture.length) return;
  const from = historyPast[historyPast.length - 1];
  const next = historyFuture.pop();
  historyPast.push(next);

  (async () => {
    if (!from || !next) return;
    await animateTopToFingers(next.baseFingers);
    await updateUrlForBaseFingers(next.baseFingers);
    await renderThumbs(next);
    updateUndoRedoButtons();
  })().catch(() => {});
}

async function handleRefresh() {
  const snap = currentSnapshot();
  if (!snap) return;
  if (isTransitioning || uiFreezeDepth > 0) return;

  await withUiFrozen(async () => {
    const visitedTopKeys = collectVisitedTopKeys();
    const kept = new Array(THUMB_COUNT).fill(null);
    for (let i = 0; i < THUMB_COUNT; i++) {
      const candidate = snap.candidates[i];
      const isVisited = candidate?.key && visitedTopKeys.has(candidate.key);
      const isSelected = snap.selectedIndex === i;
      if (isVisited || isSelected) {
        kept[i] = candidate;
      }
    }

    snap.candidates = generateCandidates({
      coreForClamp: topCore,
      baseFingers: snap.baseFingers,
      labels: activeLabels,
      axisConstraints: activeAxisConstraints,
      visitedTopKeys,
      keepCandidates: kept,
    });
    await renderThumbs(snap);
  });
}

async function handleThumbClick(index) {
  const snap = currentSnapshot();
  if (!snap) return;
  const i = Number(index);
  if (!(i >= 0 && i < THUMB_COUNT)) return;
  if (isTransitioning || uiFreezeDepth > 0) return;

  // Maze backtrack: if we're at a node reached via undo and the user clicks the
  // highlighted choice, treat it as redo (restoring the previously visited child).
  if (snap.selectedIndex === i && historyFuture.length) {
    redo();
    return;
  }

  // Branch: selecting any choice creates a new node and clears redo history.
  const candidate = snap.candidates[i];
  if (!candidate?.fingers) return;

  await withUiFrozen(async () => {
    snap.selectedIndex = i;
    // Update highlight immediately (no re-render of thumbnails yet).
    for (let j = 0; j < THUMB_COUNT; j++) {
      const cell = gridEl?.querySelector?.(`[data-thumb-index="${j}"]`);
      cell?.classList?.toggle?.('selected', i === j);
    }

    // Immediately hide all other unclicked choices so it's obvious what was selected.
    setChoiceVisibilityMode('selected-only', { selectedIndex: i });

    const nextBaseFingers = candidate.fingers;
    const nextBaseKey = snapshotKey({ formulaSource: activeFormulaSource, fingers: nextBaseFingers });

    // Animate the top pane to the chosen candidate first...
    await animateTopToFingers(nextBaseFingers);

    // ...then (only after) advance the maze node + regenerate thumbnails.
    const visitedTopKeys = collectVisitedTopKeys();
    visitedTopKeys.add(nextBaseKey);
    const nextCandidates = generateCandidates({
      coreForClamp: topCore,
      baseFingers: nextBaseFingers,
      labels: activeLabels,
      axisConstraints: activeAxisConstraints,
      visitedTopKeys,
    });

    const nextSnap = {
      formulaSource: activeFormulaSource,
      baseFingers: nextBaseFingers,
      baseKey: nextBaseKey,
      candidates: nextCandidates,
      selectedIndex: null,
    };

    historyFuture.length = 0;
    commitSnapshot(nextSnap);

    await updateUrlForBaseFingers(nextBaseFingers);
    await renderThumbs(nextSnap);
    updateUndoRedoButtons();
    setChoiceVisibilityMode('all');
  });
}

async function buildExploreUrl({ targetPath, baseFingers, includeEditParam }) {
  const url = new URL(window.location.href);
  url.pathname = url.pathname.replace(/[^/]*$/, targetPath);
  url.hash = '';
  const params = new URLSearchParams();
  await writeFormulaToSearchParams(params, activeFormulaSource);
  if (includeEditParam) {
    params.set('edit', 'true');
  }
  for (const label of activeLabels) {
    const v = baseFingers[label];
    const serialized = formatComplexForQuery(v?.x, v?.y);
    if (serialized) params.set(label, serialized);
  }
  url.search = params.toString();
  return url.toString();
}

async function copyTextToClipboard(text) {
  const clipboard = navigator?.clipboard;
  if (clipboard && typeof clipboard.writeText === 'function') {
    await clipboard.writeText(String(text));
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = String(text);
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  textarea.style.left = '-1000px';
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const ok = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
  document.body.removeChild(textarea);
  if (!ok) {
    throw new Error('Clipboard unavailable');
  }
}

async function handleMenuAction(action) {
  const snap = currentSnapshot();
  if (!snap) return;

  switch (action) {
    case 'copy-explore-link': {
      const href = await buildExploreUrl({
        targetPath: 'explore.html',
        baseFingers: snap.baseFingers,
        includeEditParam: false,
      });
      try {
        await copyTextToClipboard(href);
      } catch (_) {
        window.prompt('Copy this explore link:', href);
      }
      break;
    }
    case 'back-to-edit': {
      const href = await buildExploreUrl({
        targetPath: 'index.html',
        baseFingers: snap.baseFingers,
        includeEditParam: true,
      });
      window.location.href = href;
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function bootstrap() {
  // Service worker (same behavior as other pages).
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    const SW_URL = './service-worker.js?sw=21.0';
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(SW_URL).then((registration) => {
        if (registration?.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        registration?.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      }).catch(() => {});
    });
  }

  ensureGridBuilt();

  if (undoButton) undoButton.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); undo(); });
  if (redoButton) redoButton.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); redo(); });

  setupMenuDropdown({ menuButton, menuDropdown, onAction: (a) => handleMenuAction(a) });

  gridEl?.addEventListener('click', (event) => {
    const refresh = event.target?.closest?.('#refresh-button');
    if (refresh) {
      event.preventDefault();
      handleRefresh().catch(() => {});
      return;
    }
    const thumb = event.target?.closest?.('[data-thumb-index]');
    if (thumb) {
      event.preventDefault();
      handleThumbClick(thumb.dataset.thumbIndex).catch(() => {});
    }
  });

  await verifyCompressionSupport();

  // Read formula from URL.
  const decoded = await readFormulaFromQuery({
    onDecodeError: () => showError('We could not decode the formula embedded in this link.'),
  });
  activeFormulaSource = (decoded && String(decoded).trim()) ? String(decoded) : 'z';

  // Seed finger values from query for parse-time desugaring (e.g. $$ counts).
  const params = new URLSearchParams(window.location.search);
  const seededFingerValues = {};
  params.forEach((value, key) => {
    if (!isFingerLabel(key)) return;
    const parsed = parseComplexString(value);
    if (parsed) {
      seededFingerValues[key] = { x: parsed.x, y: parsed.y };
    }
  });

  const parsed = parseFormulaInput(activeFormulaSource, { fingerValues: seededFingerValues });
  if (!parsed.ok) {
    showError(formatCaretIndicator(activeFormulaSource, parsed));
    activeAst = createDefaultFormulaAST();
  } else {
    showError(null);
    activeAst = parsed.value;
  }

  const analysis = analyzeFingerUsage(activeAst);
  const fingerState = deriveFingerState(analysis);
  if (fingerState.mode === 'invalid') {
    showError(fingerState.error);
    return;
  }

  activeFingerConfig = {
    fixedSlots: fingerState.fixedSlots,
    dynamicSlots: fingerState.dynamicSlots,
    wSlots: fingerState.wSlots,
    axisConstraints: fingerState.axisConstraints,
  };
  activeAxisConstraints = fingerState.axisConstraints;
  activeLabels = sortedLabels([
    ...(fingerState.fixedSlots || []),
    ...(fingerState.dynamicSlots || []),
    ...(fingerState.wSlots || []),
  ]);

  // Initialize top renderer.
  topCore = new ReflexCore(mainCanvas, activeAst, { autoRender: false, installEventListeners: true });
  topCore.setActiveFingerConfig(activeFingerConfig);

  // Apply query finger values to the renderer.
  for (const label of activeLabels) {
    const raw = params.get(label);
    const parsedValue = parseComplexString(raw);
    if (parsedValue) {
      topCore.setFingerValue(label, parsedValue.x, parsedValue.y, { triggerRender: false });
    }
  }

  // Ensure layout is ready so view extents are correct.
  await waitForNextFrame();
  topCore.render();
  await waitForNextFrame();

  // Clamp into visible interval (view bounds), then render again.
  const clampedBase = {};
  for (const label of activeLabels) {
    const v = topCore.getFingerValue(label);
    clampedBase[label] = clampToView(topCore, v.x, v.y);
  }
  applyFingersToCore(topCore, clampedBase);
  topCore.render();

  // Shared thumbnail WebGL renderer (single context).
  thumbWebglCanvas = document.createElement('canvas');
  thumbWebglCanvas.style.position = 'fixed';
  thumbWebglCanvas.style.left = '-10000px';
  thumbWebglCanvas.style.top = '-10000px';
  thumbWebglCanvas.style.width = '1px';
  thumbWebglCanvas.style.height = '1px';
  thumbWebglCanvas.style.pointerEvents = 'none';
  document.body.appendChild(thumbWebglCanvas);
  thumbCore = new ReflexCore(thumbWebglCanvas, activeAst, { autoRender: false, installEventListeners: false });
  thumbCore.setActiveFingerConfig(activeFingerConfig);

  const baseKey = snapshotKey({ formulaSource: activeFormulaSource, fingers: clampedBase });
  const visitedTopKeys = new Set([baseKey]);
  const candidates = generateCandidates({
    coreForClamp: topCore,
    baseFingers: clampedBase,
    labels: activeLabels,
    axisConstraints: activeAxisConstraints,
    visitedTopKeys,
  });

  commitSnapshot({
    formulaSource: activeFormulaSource,
    baseFingers: clampedBase,
    baseKey,
    candidates,
    selectedIndex: null,
  }, { force: true });

  await updateUrlForBaseFingers(clampedBase);
  await renderAll();
}

bootstrap().catch((err) => {
  console.error('Explore mode failed to bootstrap', err);
  showError(`Explore mode failed to start.\n\n${err?.stack || err?.message || String(err)}`);
});

