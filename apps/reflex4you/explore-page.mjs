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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Top portion of the screen (0..1). Bottom takes the remainder.
const TOP_FRACTION = 2 / 3;

// Number of miniature choices (excluding refresh).
const THUMB_COUNT = 7;

// Thumbnail distance bands:
// 0: 0.01–0.1, 1: 0.1–0.2, ..., 6: 0.6–0.7
function bandForIndex(i) {
  const idx = Math.max(0, Math.min(THUMB_COUNT - 1, Number(i) || 0));
  const min = idx === 0 ? 0.01 : idx * 0.1;
  const max = (idx + 1) * 0.1;
  return { min, max };
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

function waitForNextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
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
    const r = randomInRange(band.min, band.max);
    const theta = Math.random() * Math.PI * 2;
    let dx = r * Math.cos(theta);
    let dy = r * Math.sin(theta);
    const axis = axisConstraints?.get?.(label) || null;
    if (axis === 'x') dy = 0;
    if (axis === 'y') dx = 0;
    const unclamped = { x: base.x + dx, y: base.y + dy };
    candidate[label] = clampToView(coreForClamp, unclamped.x, unclamped.y);
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
    const candidate = snapshot.candidates[i];
    if (candidate?.fingers) {
      applyFingersToCore(thumbCore, candidate.fingers);
      thumbCore.renderToPixelSize(targetW, targetH);
      try {
        thumbCore.gl?.finish?.();
      } catch (_) {
        // ignore
      }
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.drawImage(thumbWebglCanvas, 0, 0, targetW, targetH);
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

    const badge = document.createElement('div');
    badge.className = 'thumb-badge';
    const band = bandForIndex(i);
    badge.textContent = `${band.min.toFixed(2)}–${band.max.toFixed(1)}`;

    btn.appendChild(canvas);
    btn.appendChild(badge);
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
  const current = historyPast.pop();
  historyFuture.push(current);
  renderAll().catch(() => {});
}

function redo() {
  if (!historyFuture.length) return;
  const next = historyFuture.pop();
  historyPast.push(next);
  renderAll().catch(() => {});
}

async function handleRefresh() {
  const snap = currentSnapshot();
  if (!snap) return;

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
}

async function handleThumbClick(index) {
  const snap = currentSnapshot();
  if (!snap) return;
  const i = Number(index);
  if (!(i >= 0 && i < THUMB_COUNT)) return;

  // Maze backtrack: if we're at a node reached via undo and the user clicks the
  // highlighted choice, treat it as redo (restoring the previously visited child).
  if (snap.selectedIndex === i && historyFuture.length) {
    redo();
    return;
  }

  // Branch: selecting any choice creates a new node and clears redo history.
  const candidate = snap.candidates[i];
  if (!candidate?.fingers) return;

  snap.selectedIndex = i;

  const nextBaseFingers = candidate.fingers;
  const nextBaseKey = snapshotKey({ formulaSource: activeFormulaSource, fingers: nextBaseFingers });
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
  await renderAll();
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
    const SW_URL = './service-worker.js?sw=15.1';
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

