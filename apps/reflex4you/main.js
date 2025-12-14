import {
  ReflexCore,
  createDefaultFormulaAST,
  FINGER_DECIMAL_PLACES,
} from './core-engine.mjs';
import {
  defaultImageExportPresets,
  downloadBlob,
  promptImageExportSize,
  renderOffscreenCanvasToPngBlob,
} from '../shared/image-export.mjs';
import { visitAst } from './ast-utils.mjs';
import { parseFormulaInput } from './arithmetic-parser.mjs';
import { formatCaretIndicator } from './parse-error-format.mjs';
import {
  FORMULA_PARAM,
  FORMULA_B64_PARAM,
  LAST_STATE_SEARCH_KEY,
  verifyCompressionSupport,
  readFormulaFromQuery,
  writeFormulaToSearchParams,
  updateFormulaQueryParam,
  updateFormulaQueryParamImmediately,
  replaceUrlSearch,
} from './formula-url.mjs';

const canvas = document.getElementById('glcanvas');
const formulaTextarea = document.getElementById('formula');
const errorDiv = document.getElementById('error');
const fingerIndicatorStack = document.getElementById('finger-indicator-stack');
const fingerOverlay = document.getElementById('finger-overlay');
const menuButton = document.getElementById('menu-button');
const menuDropdown = document.getElementById('menu-dropdown');
const undoButton = document.getElementById('undo-button');
const redoButton = document.getElementById('redo-button');
const versionPill = document.getElementById('app-version-pill');
const rootElement = typeof document !== 'undefined' ? document.documentElement : null;

let fatalErrorActive = false;

const APP_VERSION = 8;
const CONTEXT_LOSS_RELOAD_KEY = `reflex4you:contextLossReloaded:v${APP_VERSION}`;

if (versionPill) {
  versionPill.textContent = `v${APP_VERSION}`;
  versionPill.setAttribute('data-version', String(APP_VERSION));
}

const EDIT_PARAM = 'edit';
const ANIMATION_TIME_PARAM = 't';

const DEFAULT_ANIMATION_SECONDS = 5;

const W_FINGER_ORDER = ['W1', 'W2'];
const FINGER_LABEL_REGEX = /^(?:[FD][1-9]\d*|W[12])$/;

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

function defaultFingerOffset(label) {
  if (label === 'W1') {
    return { x: 1, y: 0 };
  }
  return { x: 0, y: 0 };
}

function getFingerMeta(label) {
  return {
    label,
    type: fingerFamily(label) || 'fixed',
  };
}

function sortFingerLabels(labels) {
  return labels
    .slice()
    .filter((label) => isFingerLabel(label))
    .sort((a, b) => {
      const fa = fingerFamily(a);
      const fb = fingerFamily(b);
      if (fa !== fb) {
        // Keep fixed/dynamic ahead of workspace.
        if (fa === 'w') return 1;
        if (fb === 'w') return -1;
      }
      return fingerIndex(a) - fingerIndex(b);
    });
}

const fingerIndicators = new Map();
const fingerDots = new Map();
const fingerLastSerialized = {};
const latestOffsets = {};
const knownFingerLabels = new Set();
const fingerUnsubscribers = new Map();

function ensureFingerState(label) {
  if (!isFingerLabel(label)) {
    return;
  }
  knownFingerLabels.add(label);
  if (!latestOffsets[label]) {
    latestOffsets[label] = defaultFingerOffset(label);
  }
  if (!(label in fingerLastSerialized)) {
    fingerLastSerialized[label] = null;
  }
}

// Always keep workspace fingers in a known state.
W_FINGER_ORDER.forEach((label) => ensureFingerState(label));

function ensureFingerSubscriptions(labels) {
  if (!reflexCore) {
    return;
  }
  (labels || []).forEach((label) => {
    if (!isFingerLabel(label)) {
      return;
    }
    ensureFingerState(label);
    if (fingerUnsubscribers.has(label)) {
      return;
    }
    const unsubscribe = reflexCore.onFingerChange(label, (offset) => handleFingerValueChange(label, offset));
    fingerUnsubscribers.set(label, unsubscribe);
  });
}

function applyFingerValuesFromQuery(labels) {
  if (!reflexCore) {
    return;
  }
  suppressFingerQueryUpdates = true;
  const params = new URLSearchParams(window.location.search);
  let normalizedQuery = false;
  try {
    (labels || []).forEach((label) => {
      if (!isFingerLabel(label)) {
        return;
      }
      const raw = params.get(label);
      const parsed = parseComplexString(raw);
      if (parsed) {
        reflexCore.setFingerValue(label, parsed.x, parsed.y, { triggerRender: false });
        // Normalize URL values to the same quantized representation used internally,
        // so reloads remain deterministic and GPU uniforms match the URL display.
        const stored = reflexCore.getFingerValue(label);
        const normalized = formatComplexForQuery(stored.x, stored.y);
        if (normalized && normalized !== raw) {
          params.set(label, normalized);
          fingerLastSerialized[label] = normalized;
          normalizedQuery = true;
        }
      }
    });
  } finally {
    suppressFingerQueryUpdates = false;
  }
  if (normalizedQuery) {
    replaceUrlSearch(params);
  }
  reflexCore.render();
}

function getParserOptionsFromFingers() {
  return { fingerValues: latestOffsets };
}

let activeFingerState = createEmptyFingerState();

let suppressFingerQueryUpdates = false;

const ANIMATION_SUFFIX = 'A';

let viewerModeActive = false;
let viewerModeRevealed = false;

let animationSeconds = DEFAULT_ANIMATION_SECONDS;
let animationController = null;
let animationDraftStart = null;
let sessionEditMode = false;

function createEmptyFingerState() {
  return {
    mode: 'none',
    fixedSlots: [],
    dynamicSlots: [],
    wSlots: [],
    axisConstraints: new Map(),
    allSlots: [],
    activeLabelSet: new Set(),
  };
}

function updateViewportInsets() {
  if (typeof window === 'undefined' || !rootElement) {
    return;
  }
  const viewport = window.visualViewport;
  if (!viewport) {
    rootElement.style.setProperty('--viewport-top-offset', '0px');
    rootElement.style.setProperty('--viewport-bottom-offset', '0px');
    return;
  }
  const topOffset = Math.max(viewport.offsetTop || 0, 0);
  const bottomOffset = Math.max(
    (window.innerHeight || viewport.height || 0) - viewport.height - (viewport.offsetTop || 0),
    0,
  );
  rootElement.style.setProperty('--viewport-top-offset', `${topOffset}px`);
  rootElement.style.setProperty('--viewport-bottom-offset', `${bottomOffset}px`);
}

function setupViewportInsetListeners() {
  if (typeof window === 'undefined') {
    return;
  }
  updateViewportInsets();
  window.addEventListener('resize', updateViewportInsets);
  window.addEventListener('orientationchange', updateViewportInsets);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateViewportInsets);
    window.visualViewport.addEventListener('scroll', updateViewportInsets);
  }
}

setupViewportInsetListeners();

function refreshFingerIndicator(label) {
  ensureFingerState(label);
  const indicator = fingerIndicators.get(label);
  if (!indicator) {
    return;
  }
  const latest = latestOffsets[label];
  indicator.textContent = formatComplexForDisplay(label, latest.x, latest.y);
  const isActive = activeFingerState.activeLabelSet.has(label);
  indicator.style.display = isActive ? '' : 'none';
}

const DEFAULT_FORMULA_TEXT = 'z';
let lastAppliedFormulaSource = DEFAULT_FORMULA_TEXT;

const defaultParseResult = parseFormulaInput(DEFAULT_FORMULA_TEXT, getParserOptionsFromFingers());
const fallbackDefaultAST = defaultParseResult.ok ? defaultParseResult.value : createDefaultFormulaAST();
let reflexCore = null;
let scheduledFingerDrivenReparse = false;

// --- Undo/Redo history -------------------------------------------------------
// We snapshot *only* when all pointers are released (no fingers pressed).
// Pointer moves do not create new states; the state is recorded on release.
const HISTORY_LIMIT = 200;
const activePointerIds = new Set();
const historyPast = [];
const historyFuture = [];
let historyApplying = false;
let historyCommitRaf = null;

function compareFingerLabels(a, b) {
  const fa = fingerFamily(a);
  const fb = fingerFamily(b);
  if (fa !== fb) {
    // Keep fixed/dynamic ahead of workspace.
    if (fa === 'w') return 1;
    if (fb === 'w') return -1;
  }
  return fingerIndex(a) - fingerIndex(b);
}

function sortedFingerLabelsForHistory() {
  return Array.from(knownFingerLabels).filter((label) => isFingerLabel(label)).sort(compareFingerLabels);
}

function captureHistorySnapshot() {
  const labels = sortedFingerLabelsForHistory();
  const fingers = {};
  for (const label of labels) {
    ensureFingerState(label);
    const latest = latestOffsets[label] ?? reflexCore?.getFingerValue(label) ?? defaultFingerOffset(label);
    fingers[label] = { x: latest.x, y: latest.y };
  }
  return {
    // Only store formulas that successfully parsed/applied; while the user is
    // typing an invalid formula, history should keep the last valid state.
    formulaSource: String(lastAppliedFormulaSource || DEFAULT_FORMULA_TEXT),
    fingers,
  };
}

function historySnapshotKey(snapshot) {
  if (!snapshot) return '';
  const labels = Object.keys(snapshot.fingers || {}).sort(compareFingerLabels);
  const canonical = {
    formulaSource: snapshot.formulaSource || '',
    fingers: Object.fromEntries(
      labels.map((label) => {
        const v = snapshot.fingers[label] || { x: 0, y: 0 };
        return [label, { x: v.x, y: v.y }];
      }),
    ),
  };
  return JSON.stringify(canonical);
}

function updateUndoRedoButtons() {
  if (undoButton) {
    undoButton.disabled = historyPast.length < 2;
  }
  if (redoButton) {
    redoButton.disabled = historyFuture.length === 0;
  }
}

function commitHistorySnapshot({ force = false } = {}) {
  if (historyApplying) {
    return;
  }
  const snapshot = captureHistorySnapshot();
  const key = historySnapshotKey(snapshot);
  const last = historyPast.length ? historyPast[historyPast.length - 1] : null;
  const lastKey = last ? historySnapshotKey(last) : null;
  if (!force && lastKey === key) {
    updateUndoRedoButtons();
    return;
  }
  historyPast.push(snapshot);
  if (historyPast.length > HISTORY_LIMIT) {
    historyPast.splice(0, historyPast.length - HISTORY_LIMIT);
  }
  historyFuture.length = 0;
  updateUndoRedoButtons();
}

function scheduleCommitHistorySnapshot() {
  if (historyApplying) {
    return;
  }
  if (historyCommitRaf != null || typeof window === 'undefined') {
    return;
  }
  historyCommitRaf = window.requestAnimationFrame(() => {
    historyCommitRaf = null;
    commitHistorySnapshot();
  });
}

function applyHistorySnapshot(snapshot) {
  if (!snapshot || !reflexCore) {
    return;
  }
  historyApplying = true;
  try {
    // Stop URL-driven animations to avoid them immediately mutating restored state.
    if (animationController?.isPlaying()) {
      animationController.stop();
    }

    const fingers = snapshot.fingers || {};
    const labels = Object.keys(fingers).filter((label) => isFingerLabel(label)).sort(compareFingerLabels);

    suppressFingerQueryUpdates = true;
    try {
      for (const label of labels) {
        ensureFingerState(label);
        const v = fingers[label];
        if (!v) continue;
        latestOffsets[label] = { x: v.x, y: v.y };
        reflexCore.setFingerValue(label, v.x, v.y, { triggerRender: false });
      }
    } finally {
      suppressFingerQueryUpdates = false;
    }

    if (formulaTextarea) {
      formulaTextarea.value = snapshot.formulaSource || DEFAULT_FORMULA_TEXT;
    }
    // Apply formula + derived finger activation; allow finger-state changes (no pointer is down).
    applyFormulaFromTextarea({ updateQuery: false, preserveFingerState: false });

    // Persist formula in URL (finger params are handled by applyFingerState).
    const source = formulaTextarea?.value || '';
    updateFormulaQueryParamImmediately(source);
    updateFormulaQueryParam(source).catch((error) =>
      console.warn('Failed to persist formula parameter.', error),
    );

    reflexCore.render();
  } finally {
    historyApplying = false;
    updateUndoRedoButtons();
  }
}

function undoHistory() {
  if (historyPast.length < 2) {
    return;
  }
  const current = historyPast.pop();
  historyFuture.push(current);
  const previous = historyPast[historyPast.length - 1];
  applyHistorySnapshot(previous);
}

function redoHistory() {
  if (!historyFuture.length) {
    return;
  }
  const next = historyFuture.pop();
  historyPast.push(next);
  applyHistorySnapshot(next);
}

if (undoButton) {
  undoButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    undoHistory();
  });
}

if (redoButton) {
  redoButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    redoHistory();
  });
}

function formulaNeedsFingerDrivenReparse(source) {
  if (!source || typeof source !== 'string') {
    return false;
  }
  // These operators trigger parse-time desugaring / constant-folding that may
  // depend on finger values (e.g. repeat counts and small integer exponents).
  return source.includes('$$') || source.includes('^');
}

function scheduleFingerDrivenReparse() {
  if (scheduledFingerDrivenReparse) {
    return;
  }
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    // Fall back to immediate reparse if rAF is unavailable.
    applyFormulaFromTextarea({ updateQuery: false, preserveFingerState: true });
    return;
  }
  scheduledFingerDrivenReparse = true;
  window.requestAnimationFrame(() => {
    scheduledFingerDrivenReparse = false;
    applyFormulaFromTextarea({ updateQuery: false, preserveFingerState: true });
  });
}

const FINGER_DECIMAL_FACTOR = 10 ** FINGER_DECIMAL_PLACES;

function roundToFingerPrecision(value) {
  if (!Number.isFinite(value)) {
    return NaN;
  }
  const rounded = Math.round(value * FINGER_DECIMAL_FACTOR) / FINGER_DECIMAL_FACTOR;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatNumberForDisplay(value) {
  const rounded = roundToFingerPrecision(value);
  if (!Number.isFinite(rounded)) {
    return '?';
  }
  return rounded.toFixed(FINGER_DECIMAL_PLACES).replace(/\.?0+$/, '');
}

function formatComplexForDisplay(label, re, im) {
  if (!Number.isFinite(re) || !Number.isFinite(im)) {
    return `${label} = ?`;
  }
  const sign = im >= 0 ? '+' : '-';
  const realPart = formatNumberForDisplay(re);
  const imagPart = formatNumberForDisplay(Math.abs(im));
  return `${label} = ${realPart} ${sign} ${imagPart} i`;
}

function formatComplexForQuery(re, im) {
  if (!Number.isFinite(re) || !Number.isFinite(im)) {
    return null;
  }
  const sign = im >= 0 ? '+' : '-';
  const realPart = formatNumberForDisplay(re);
  const imagPart = formatNumberForDisplay(Math.abs(im));
  return `${realPart}${sign}${imagPart}i`;
}

function parseComplexString(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\s+/g, '').toLowerCase();

  if (normalized.endsWith('i')) {
    const core = normalized.slice(0, -1);
    if (!core.length) {
      return null;
    }
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

function parseSecondsFromQuery(raw) {
  if (raw == null) {
    return null;
  }
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  const numeric = trimmed.endsWith('s') ? trimmed.slice(0, -1) : trimmed;
  const seconds = Number(numeric);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return seconds;
}

function formatSecondsForQuery(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const normalized = Math.round(seconds * 1000) / 1000;
  return `${normalized}s`;
}

function parseComplexInterval(raw) {
  if (!raw) {
    return null;
  }
  const normalized = String(raw).trim().replace(/\s+/g, '');
  if (!normalized || normalized.includes(';') || normalized.includes('|')) {
    return null;
  }
  const parts = normalized.split('..');
  if (parts.length !== 2) {
    return null;
  }
  const start = parseComplexString(parts[0]);
  const end = parseComplexString(parts[1]);
  if (!start || !end) {
    return null;
  }
  return { start, end };
}

function readAnimationIntervalFromQuery(label) {
  const params = new URLSearchParams(window.location.search);
  const key = `${label}${ANIMATION_SUFFIX}`;
  const raw = params.get(key);
  return parseComplexInterval(raw);
}

function serializeAnimationInterval(interval) {
  if (!interval) {
    return null;
  }
  const start = interval?.start;
  const end = interval?.end;
  const startText = start ? formatComplexForQuery(start.x, start.y) : null;
  const endText = end ? formatComplexForQuery(end.x, end.y) : null;
  if (!startText || !endText) {
    return null;
  }
  return `${startText}..${endText}`;
}

function updateSearchParam(key, valueOrNull) {
  const params = new URLSearchParams(window.location.search);
  if (valueOrNull == null || valueOrNull === '') {
    params.delete(key);
  } else {
    params.set(key, String(valueOrNull));
  }
  replaceUrlSearch(params);
}

function hasFormulaQueryParam() {
  const params = new URLSearchParams(window.location.search);
  return params.has(FORMULA_PARAM) || params.has(FORMULA_B64_PARAM);
}

function isEditModeEnabled() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(EDIT_PARAM);
  if (!raw) {
    return false;
  }
  const normalized = String(raw).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function isEditModeActive() {
  return sessionEditMode || isEditModeEnabled();
}

function enterEditModeForSession() {
  sessionEditMode = true;
  revealViewerModeUIOnce();
  if (animationController) {
    animationController.stop();
  }
}

function setViewerModeActive(active) {
  viewerModeActive = Boolean(active);
  if (!rootElement) {
    return;
  }
  rootElement.classList.toggle('viewer-mode', viewerModeActive && !viewerModeRevealed);
}

function revealViewerModeUIOnce() {
  if (!viewerModeActive || viewerModeRevealed) {
    return;
  }
  viewerModeRevealed = true;
  if (rootElement) {
    rootElement.classList.remove('viewer-mode');
  }
}

function ensureFingerIndicator(label) {
  if (fingerIndicators.has(label)) {
    return fingerIndicators.get(label);
  }
  ensureFingerState(label);
  const meta = getFingerMeta(label);
  const indicator = document.createElement('button');
  indicator.type = 'button';
  indicator.className = `finger-indicator finger-indicator--${meta.type}`;
  indicator.dataset.finger = label;
  indicator.title = `Click to edit ${label}`;
  indicator.addEventListener('click', () => promptFingerValue(label));
  fingerIndicators.set(label, indicator);
  return indicator;
}

function ensureFingerDot(label) {
  if (!fingerOverlay) {
    return null;
  }
  if (fingerDots.has(label)) {
    return fingerDots.get(label);
  }
  ensureFingerState(label);
  const meta = getFingerMeta(label);
  const dot = document.createElement('div');
  dot.className = `finger-dot finger-dot--${meta.type}`;
  dot.dataset.fingerDot = label;
  dot.textContent = label;
  fingerOverlay.appendChild(dot);
  fingerDots.set(label, dot);
  return dot;
}

function promptFingerValue(label) {
  const currentOffset = reflexCore?.getFingerValue(label) ?? { x: 0, y: 0 };
  const currentValue = formatComplexForQuery(currentOffset.x, currentOffset.y) || '0+0i';
  const next = window.prompt(`Set ${label} (formats: "a+bi" or "a,b")`, currentValue);
  if (next === null) {
    return;
  }
  const parsed = parseComplexString(next);
  if (!parsed) {
    alert(`Could not parse ${label}. Use "a+bi" or "real,imag".`);
    return;
  }
  if (!reflexCore) {
    alert('Unable to edit finger values because the renderer is unavailable.');
    return;
  }
  reflexCore.setFingerValue(label, parsed.x, parsed.y);
  if (activePointerIds.size === 0) {
    scheduleCommitHistorySnapshot();
  }
}

function readFingerFromQuery(label) {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(label);
  return parseComplexString(raw);
}

function persistLastSearchToLocalStorage(search) {
  try {
    window.localStorage?.setItem(LAST_STATE_SEARCH_KEY, String(search || ''));
  } catch (_) {
    // ignore storage failures
  }
}

function clearPersistedLastSearch() {
  try {
    window.localStorage?.removeItem(LAST_STATE_SEARCH_KEY);
  } catch (_) {
    // ignore storage failures
  }
}

function restorePersistedSearchIfNeeded() {
  if (typeof window === 'undefined') {
    return;
  }
  const params = new URLSearchParams(window.location.search);
  // If opened via a share link (formula embedded), do not override it.
  if (params.has(FORMULA_PARAM) || params.has(FORMULA_B64_PARAM)) {
    return;
  }
  let saved = null;
  try {
    saved = window.localStorage?.getItem(LAST_STATE_SEARCH_KEY);
  } catch (_) {
    saved = null;
  }
  if (!saved || typeof saved !== 'string' || !saved.startsWith('?')) {
    return;
  }
  const savedParams = new URLSearchParams(saved.slice(1));
  if (!savedParams.has(FORMULA_PARAM) && !savedParams.has(FORMULA_B64_PARAM)) {
    return;
  }
  const current = window.location.search || '';
  if (current === saved) {
    return;
  }
  window.history.replaceState({}, '', `${window.location.pathname}${saved}`);
}

function updateFingerQueryParam(label, re, im) {
  const serialized = formatComplexForQuery(re, im);
  const params = new URLSearchParams(window.location.search);
  if (serialized) {
    params.set(label, serialized);
  } else {
    params.delete(label);
  }
  const newQuery = params.toString();
  const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}`;
  window.history.replaceState({}, '', newUrl);
  persistLastSearchToLocalStorage(newQuery ? `?${newQuery}` : '');
}

function clearFingerQueryParam(label) {
  fingerLastSerialized[label] = null;
  updateFingerQueryParam(label, Number.NaN, Number.NaN);
}

function handleFingerValueChange(label, offset) {
  ensureFingerState(label);
  latestOffsets[label] = { x: offset.x, y: offset.y };
  refreshFingerIndicator(label);
  updateFingerDotPosition(label);
  if (!suppressFingerQueryUpdates && activeFingerState.activeLabelSet.has(label)) {
    const serialized = formatComplexForQuery(offset.x, offset.y);
    if (serialized !== fingerLastSerialized[label]) {
      fingerLastSerialized[label] = serialized;
      updateFingerQueryParam(label, offset.x, offset.y);
    }
  }

  // If the current formula performs finger-dependent desugaring (e.g. `$$` repeat
  // counts), a finger move must re-run the parse/desugar pipeline so the shader
  // reflects the updated constant-folded structure.
  if (
    !suppressFingerQueryUpdates &&
    activeFingerState.activeLabelSet.has(label) &&
    formulaNeedsFingerDrivenReparse(formulaTextarea?.value || '')
  ) {
    scheduleFingerDrivenReparse();
  }
}

function showError(msg) {
  if (fatalErrorActive) {
    return;
  }
  errorDiv.removeAttribute('data-error-severity');
  errorDiv.textContent = msg;
  errorDiv.style.display = 'block';
}

function showFatalError(msg) {
  fatalErrorActive = true;
  errorDiv.setAttribute('data-error-severity', 'fatal');
  errorDiv.textContent = msg;
  errorDiv.style.display = 'block';
}

function clearError() {
  if (fatalErrorActive) {
    return;
  }
  errorDiv.removeAttribute('data-error-severity');
  errorDiv.style.display = 'none';
  errorDiv.textContent = '';
}

function handleRendererInitializationFailure(error) {
  const reason =
    error && typeof error.message === 'string' && error.message.length
      ? error.message
      : 'Unknown error';
  const guidance = [
    'Reflex4You could not initialize the WebGL2 renderer.',
    'Rendering and gesture controls are disabled.',
    `Details: ${reason}`,
    'Try enabling WebGL2 or switch to a browser/device that supports it.',
  ].join('\n');
  if (canvas) {
    canvas.classList.add('glcanvas--unavailable');
    canvas.setAttribute('aria-disabled', 'true');
  }
  showFatalError(guidance);
}

function scheduleReloadOnceForContextLoss() {
  if (typeof window === 'undefined' || typeof window.location?.reload !== 'function') {
    return;
  }
  let already = false;
  try {
    already = Boolean(window.sessionStorage?.getItem(CONTEXT_LOSS_RELOAD_KEY));
  } catch (_) {
    already = false;
  }
  if (already) {
    return;
  }
  try {
    window.sessionStorage?.setItem(CONTEXT_LOSS_RELOAD_KEY, String(Date.now()));
  } catch (_) {
    // ignore
  }
  window.setTimeout(() => {
    try {
      window.location.reload();
    } catch (_) {
      // ignore
    }
  }, 250);
}

function maybeRecoverFromWebglContextLoss() {
  const gl = reflexCore?.gl;
  if (!gl || typeof gl.isContextLost !== 'function') {
    return;
  }
  if (!gl.isContextLost()) {
    return;
  }
  showFatalError(
    [
      'Graphics context was lost (common after being backgrounded on mobile PWAs).',
      'Reloading the app to recover…',
    ].join('\n'),
  );
  scheduleReloadOnceForContextLoss();
}

function showParseError(source, failure) {
  showError(formatCaretIndicator(source, failure));
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
    if (node.kind !== 'FingerOffset') {
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

function deriveFingerState(analysis) {
  const fixedSlots = sortFingerLabels(Array.from(analysis.usage.fixed));
  const dynamicSlots = sortFingerLabels(Array.from(analysis.usage.dynamic));
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
  return {
    mode,
    fixedSlots,
    dynamicSlots,
    wSlots,
    axisConstraints,
  };
}

function syncFingerUI() {
  const activeLabels = activeFingerState.allSlots;
  if (fingerIndicatorStack) {
    fingerIndicatorStack.style.display = activeLabels.length ? 'flex' : 'none';
  }
  if (fingerOverlay) {
    fingerOverlay.style.display = activeLabels.length ? 'block' : 'none';
  }
  for (const [label, indicator] of fingerIndicators.entries()) {
    if (!activeLabels.includes(label)) {
      indicator.remove();
      fingerIndicators.delete(label);
    }
  }
  for (const [label, dot] of fingerDots.entries()) {
    if (!activeLabels.includes(label)) {
      dot.remove();
      fingerDots.delete(label);
    }
  }
  activeLabels.forEach((label) => {
    const indicator = ensureFingerIndicator(label);
    if (fingerIndicatorStack) {
      fingerIndicatorStack.appendChild(indicator);
    }
    ensureFingerDot(label);
  });
}

function applyFingerState(state) {
  const axisConstraints = state.axisConstraints instanceof Map ? state.axisConstraints : new Map();
  const allSlots = [
    ...(state.fixedSlots || []),
    ...(state.dynamicSlots || []),
    ...(state.wSlots || []),
  ];
  allSlots.forEach((label) => ensureFingerState(label));
  activeFingerState = {
    mode: state.mode,
    fixedSlots: state.fixedSlots || [],
    dynamicSlots: state.dynamicSlots || [],
    wSlots: state.wSlots || [],
    axisConstraints,
    allSlots,
    activeLabelSet: new Set(allSlots),
  };
  reflexCore?.setActiveFingerConfig({
    fixedSlots: activeFingerState.fixedSlots,
    dynamicSlots: activeFingerState.dynamicSlots,
    wSlots: activeFingerState.wSlots,
    axisConstraints: activeFingerState.axisConstraints,
  });
  ensureFingerSubscriptions(activeFingerState.allSlots);
  syncFingerUI();
  activeFingerState.allSlots.forEach((label) => {
    refreshFingerIndicator(label);
    updateFingerDotPosition(label);
  });
  Array.from(knownFingerLabels).forEach((label) => {
    if (!activeFingerState.activeLabelSet.has(label)) {
      clearFingerQueryParam(label);
      const dot = fingerDots.get(label);
      if (dot) {
        dot.classList.remove('visible');
      }
    }
  });
  activeFingerState.allSlots.forEach((label) => {
    const latest = latestOffsets[label];
    const serialized = formatComplexForQuery(latest.x, latest.y);
    if (serialized !== fingerLastSerialized[label]) {
      fingerLastSerialized[label] = serialized;
      updateFingerQueryParam(label, latest.x, latest.y);
    }
  });
}

function updateFingerDotPosition(label) {
  ensureFingerState(label);
  const dot = fingerDots.get(label);
  if (!dot || !reflexCore || !activeFingerState.activeLabelSet.has(label)) {
    if (dot) {
      dot.classList.remove('visible');
    }
    return;
  }
  const latest = latestOffsets[label];
  const projection = reflexCore.projectComplexToCanvasNormalized(latest.x, latest.y);
  if (
    !projection ||
    !Number.isFinite(projection.u) ||
    !Number.isFinite(projection.v) ||
    projection.u < 0 ||
    projection.u > 1 ||
    projection.v < 0 ||
    projection.v > 1
  ) {
    dot.classList.remove('visible');
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const left = rect.left + projection.u * rect.width;
  const top = rect.top + (1 - projection.v) * rect.height;
  dot.style.left = `${left}px`;
  dot.style.top = `${top}px`;
  dot.classList.add('visible');
}

async function bootstrapReflexApplication() {
  // Installed PWAs often relaunch at `start_url` without the last query string.
  // Restore the last known reflex state unless the user opened an explicit share link.
  // This also improves the non-installed experience (reloads keep state).
  restorePersistedSearchIfNeeded();

  await verifyCompressionSupport();

  const editEnabled = isEditModeActive();
  const shouldStartInViewerMode = hasFormulaQueryParam() && !editEnabled;
  setViewerModeActive(shouldStartInViewerMode);

  // Any interaction reveals the UI when in viewer mode.
  if (typeof window !== 'undefined') {
    const reveal = () => revealViewerModeUIOnce();
    window.addEventListener('pointerdown', reveal, { once: true, capture: true });
    window.addEventListener('keydown', reveal, { once: true, capture: true });
  }

  const params = new URLSearchParams(window.location.search);
  animationSeconds = parseSecondsFromQuery(params.get(ANIMATION_TIME_PARAM)) ?? DEFAULT_ANIMATION_SECONDS;

  let initialFormulaSource = await readFormulaFromQuery({
    onDecodeError: () => {
      showError('We could not decode the formula embedded in this link. Resetting to the default formula.');
    },
  });
  if (!initialFormulaSource || !initialFormulaSource.trim()) {
    initialFormulaSource = DEFAULT_FORMULA_TEXT;
  }

  const initialParse = parseFormulaInput(initialFormulaSource, getParserOptionsFromFingers());
  let initialAST;

  if (initialParse.ok) {
    initialAST = initialParse.value;
    clearError();
  } else {
    console.warn('Failed to parse initial formula, rendering fallback AST.', initialParse);
    initialAST = fallbackDefaultAST;
    showParseError(initialFormulaSource, initialParse);
  }

  const initialUsage = analyzeFingerUsage(initialAST);
  const initialFingerState = deriveFingerState(initialUsage);
  if (initialFingerState.mode === 'invalid') {
    showError(initialFingerState.error);
  }

  formulaTextarea.value = initialFormulaSource;
  if (initialParse.ok) {
    lastAppliedFormulaSource = initialFormulaSource;
  }

  try {
    reflexCore = new ReflexCore(canvas, initialAST);
  } catch (err) {
    console.error('Failed to initialize Reflex4You renderer', err);
    handleRendererInitializationFailure(err);
  }

  if (reflexCore) {
    if (typeof window !== 'undefined') {
      window.__reflexCore = reflexCore;
    }
    // Subscribe only to the finger labels that are actually used.
    const initialActiveLabels = initialFingerState.mode === 'invalid'
      ? W_FINGER_ORDER
      : [
        ...(initialFingerState.fixedSlots || []),
        ...(initialFingerState.dynamicSlots || []),
        ...(initialFingerState.wSlots || []),
      ];
    ensureFingerSubscriptions(initialActiveLabels);
    applyFingerValuesFromQuery(initialActiveLabels);
  }

  if (initialFingerState.mode !== 'invalid') {
    applyFingerState(initialFingerState);
  } else {
    applyFingerState(createEmptyFingerState());
  }

  if (reflexCore) {
    canvas.addEventListener('pointerdown', (e) => reflexCore.handlePointerDown(e));
    canvas.addEventListener('pointermove', (e) => reflexCore.handlePointerMove(e));
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
      canvas.addEventListener(type, (e) => reflexCore.handlePointerEnd(e));
    });
  } else if (canvas) {
    canvas.style.pointerEvents = 'none';
  }

  // Track active pointers so we can snapshot only when all fingers are released.
  if (canvas && typeof window !== 'undefined') {
    canvas.addEventListener('pointerdown', (event) => {
      activePointerIds.add(event.pointerId);
    });
    const handlePointerEndForHistory = (event) => {
      activePointerIds.delete(event.pointerId);
      if (activePointerIds.size === 0) {
        scheduleCommitHistorySnapshot();
      }
    };
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
      canvas.addEventListener(type, handlePointerEndForHistory);
    });
  }

  // Load any animation intervals from the URL and start animating (unless edit mode).
  if (reflexCore) {
    const tracks = buildAnimationTracksFromQuery();
    if (tracks.size) {
      applyAnimationStartValues(tracks);
      if (!editEnabled) {
        startAnimations(tracks);
      }
    }
    // Tap anywhere while animations are playing switches into edit mode for this session.
    document.addEventListener(
      'pointerdown',
      () => {
        if (animationController?.isPlaying()) {
          enterEditModeForSession();
        }
      },
      { capture: true },
    );
  }

  // Seed the undo stack with the initial ready state.
  commitHistorySnapshot({ force: true });
}

const bootstrapPromise = bootstrapReflexApplication();
if (typeof window !== 'undefined') {
  window.__reflexReady = bootstrapPromise;
}
bootstrapPromise.catch((error) => {
  console.error('Failed to bootstrap Reflex4You.', error);
  showFatalError('Unable to initialize Reflex4You.');
});

if (typeof window !== 'undefined') {
  // Surface unexpected runtime errors in-app on mobile, where devtools are harder.
  window.addEventListener('error', (event) => {
    const message =
      event?.error?.stack ||
      event?.error?.message ||
      event?.message ||
      'Unknown error';
    console.error('Uncaught error', event?.error || event);
    showFatalError(`Uncaught error:\n${message}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const message =
      reason?.stack ||
      reason?.message ||
      (typeof reason === 'string' ? reason : null) ||
      'Unknown rejection';
    console.error('Unhandled promise rejection', reason);
    showFatalError(`Unhandled promise rejection:\n${message}`);
  });
}

if (canvas) {
  // If the WebGL context is lost, the most reliable recovery in mobile PWAs is a reload.
  canvas.addEventListener(
    'webglcontextlost',
    (event) => {
      try {
        event.preventDefault();
      } catch (_) {
        // ignore
      }
      showFatalError(
        [
          'Graphics context was lost (common after being backgrounded on mobile PWAs).',
          'Reloading the app to recover…',
        ].join('\n'),
      );
      scheduleReloadOnceForContextLoss();
    },
    false,
  );
  canvas.addEventListener(
    'webglcontextrestored',
    () => {
      // ReflexCore will attempt to rebuild GPU resources, but also re-check after restore.
      maybeRecoverFromWebglContextLoss();
    },
    false,
  );
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      maybeRecoverFromWebglContextLoss();
    }
  });
}
if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', () => {
    maybeRecoverFromWebglContextLoss();
  });
}

formulaTextarea.addEventListener('focus', () => {
  formulaTextarea.classList.add('expanded');
});
formulaTextarea.addEventListener('blur', () => {
  formulaTextarea.classList.remove('expanded');
});
// Commit formula edits as a single undoable state once editing is "done"
// (change fires on blur for textarea edits).
formulaTextarea.addEventListener('change', () => {
  if (activePointerIds.size === 0) {
    commitHistorySnapshot();
  }
});

function applyFormulaFromTextarea({ updateQuery = true, preserveFingerState = false } = {}) {
  const source = formulaTextarea.value;
  if (!source.trim()) {
    showError('Formula cannot be empty.');
    return;
  }
  const result = parseFormulaInput(source, getParserOptionsFromFingers());
  if (!result.ok) {
    showParseError(source, result);
    return;
  }
  const usage = analyzeFingerUsage(result.value);
  const nextState = deriveFingerState(usage);
  if (nextState.mode === 'invalid') {
    showError(nextState.error);
    return;
  }
  clearError();
  lastAppliedFormulaSource = source;
  reflexCore?.setFormulaAST(result.value);
  // Finger-driven reparses happen while a pointer is down (e.g. `$$` repeat counts
  // derived from D1). Re-applying the finger state would call into ReflexCore's
  // `setActiveFingerConfig`, which intentionally releases pointer capture and
  // clears active pointer assignments — interrupting the drag mid-gesture.
  if (!preserveFingerState) {
    applyFingerState(nextState);
  }
  if (updateQuery) {
    // Update immediately (tests + deterministic sharing), then try to upgrade
    // to the compressed param asynchronously when supported.
    updateFormulaQueryParamImmediately(source);
    updateFormulaQueryParam(source).catch((error) =>
      console.warn('Failed to persist formula parameter.', error),
    );
  }
}

formulaTextarea.addEventListener('input', () => applyFormulaFromTextarea());

window.addEventListener('resize', () => {
  activeFingerState.allSlots.forEach((label) => updateFingerDotPosition(label));
});

setupMenuInteractions();

function setupMenuInteractions() {
  if (!menuButton || !menuDropdown) {
    return;
  }
  setMenuOpen(false);
  menuButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const nextState = !isMenuOpen();
    setMenuOpen(nextState);
    if (nextState) {
      focusFirstMenuItem();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!menuDropdown.contains(event.target) && !menuButton.contains(event.target)) {
      setMenuOpen(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isMenuOpen()) {
      setMenuOpen(false);
      menuButton.focus();
    }
  });
  menuDropdown.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-menu-action]');
    if (!actionButton) {
      return;
    }
    handleMenuAction(actionButton.dataset.menuAction);
    setMenuOpen(false);
  });
}

function focusFirstMenuItem() {
  const firstItem = menuDropdown?.querySelector('[data-menu-action]');
  if (firstItem) {
    firstItem.focus({ preventScroll: true });
  }
}

function setMenuOpen(isOpen) {
  if (!menuButton || !menuDropdown) {
    return;
  }
  menuButton.setAttribute('aria-expanded', String(isOpen));
  menuDropdown.classList.toggle('menu-dropdown--open', isOpen);
  menuDropdown.setAttribute('aria-hidden', String(!isOpen));
}

function isMenuOpen() {
  return Boolean(menuDropdown?.classList.contains('menu-dropdown--open'));
}

function handleMenuAction(action) {
  switch (action) {
    case 'copy-share-link':
      copyShareLinkToClipboard().catch((error) => {
        console.warn('Failed to copy share link.', error);
      });
      break;
    case 'reset':
      confirmAndReset();
      break;
    case 'set-animation-start':
      setAnimationStartFromCurrent();
      break;
    case 'set-animation-end':
      commitHistorySnapshot();
      setAnimationEndFromCurrent();
      scheduleCommitHistorySnapshot();
      break;
    case 'set-animation-time':
      commitHistorySnapshot();
      promptAndSetAnimationTime();
      scheduleCommitHistorySnapshot();
      break;
    case 'save-image':
      saveCanvasImage().catch((error) => {
        console.error('Failed to save canvas image.', error);
        alert('Unable to save image. Check console for details.');
      });
      break;
    case 'open-formula-view':
      window.location.href = `./formula.html${window.location.search || ''}`;
      break;
    default:
      break;
  }
}

async function buildShareUrl() {
  const href = typeof window !== 'undefined' ? window.location.href : '';
  const url = new URL(href);
  url.hash = '';

  const params = new URLSearchParams(url.search);
  // Sharing should default to viewer mode; do not force edit UI for recipients.
  params.delete(EDIT_PARAM);

  // Re-encode the current formula so the share URL is canonical and can use
  // `formulab64` when supported, even if the current URL hasn't upgraded yet.
  await writeFormulaToSearchParams(params, formulaTextarea?.value || '');

  // Finger constants can change while URL updates are suppressed (e.g. during
  // animations). Build the share URL from the latest in-memory finger values
  // rather than relying on `window.location.search`.
  const fingerLabels = activeFingerState?.allSlots?.length
    ? activeFingerState.allSlots
    : Array.from(knownFingerLabels);
  if (activeFingerState?.activeLabelSet?.size) {
    for (const label of knownFingerLabels) {
      if (!activeFingerState.activeLabelSet.has(label)) {
        params.delete(label);
      }
    }
  }
  for (const label of fingerLabels) {
    if (!isFingerLabel(label)) {
      continue;
    }
    ensureFingerState(label);
    const latest = latestOffsets[label] ?? reflexCore?.getFingerValue(label) ?? defaultFingerOffset(label);
    const serialized = formatComplexForQuery(latest.x, latest.y);
    if (serialized) {
      params.set(label, serialized);
    } else {
      params.delete(label);
    }
  }

  url.search = params.toString();
  return url.toString();
}

async function copyTextToClipboard(text) {
  if (!text) {
    throw new Error('Nothing to copy');
  }
  const clipboard = navigator?.clipboard;
  if (clipboard && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(text);
      return;
    } catch (error) {
      // Fall through to the execCommand-based fallback (e.g. insecure contexts).
      console.warn('navigator.clipboard.writeText failed; falling back.', error);
    }
  }

  // Fallback for older browsers / insecure contexts.
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  textarea.style.left = '-1000px';
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  const ok = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
  document.body.removeChild(textarea);
  if (!ok) {
    throw new Error('Clipboard copy fallback failed');
  }
}

function showTransientStatus(message, { timeoutMs = 1400 } = {}) {
  if (!versionPill) {
    return;
  }
  const baseline = `v${APP_VERSION}`;
  versionPill.textContent = message;
  window.setTimeout(() => {
    if (versionPill.textContent === message) {
      versionPill.textContent = baseline;
    }
  }, timeoutMs);
}

async function copyShareLinkToClipboard() {
  const shareUrl = await buildShareUrl();
  try {
    await copyTextToClipboard(shareUrl);
    showTransientStatus('Copied link');
  } catch (error) {
    console.warn('Clipboard write failed; falling back to prompt.', error);
    window.prompt('Copy this Reflex4You link:', shareUrl);
  }
}

function buildAnimationTracksFromQuery() {
  const tracks = new Map();
  const candidates = activeFingerState?.allSlots?.length
    ? activeFingerState.allSlots
    : Array.from(knownFingerLabels);
  for (const label of candidates) {
    const interval = readAnimationIntervalFromQuery(label);
    if (interval) {
      tracks.set(label, interval);
    }
  }
  return tracks;
}

function applyAnimationStartValues(tracks) {
  if (!reflexCore) {
    return;
  }
  suppressFingerQueryUpdates = true;
  try {
    for (const [label, interval] of tracks.entries()) {
      if (interval?.start) {
        reflexCore.setFingerValue(label, interval.start.x, interval.start.y, { triggerRender: false });
      }
    }
  } finally {
    suppressFingerQueryUpdates = false;
  }
  reflexCore.render();
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpComplex(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function startAnimations(tracks) {
  if (!reflexCore) {
    return;
  }
  if (animationController) {
    animationController.stop();
  }
  animationController = createAnimationController(reflexCore, tracks, animationSeconds);
  animationController.start();
}

function createAnimationController(core, tracks, secondsPerSegment) {
  const state = {
    core,
    tracks: new Map(tracks),
    secondsPerSegment: Math.max(0.001, Number(secondsPerSegment) || DEFAULT_ANIMATION_SECONDS),
    rafId: null,
    playing: false,
    paused: false,
    lastNowMs: 0,
    perTrack: new Map(),
  };

  for (const [label, interval] of state.tracks.entries()) {
    state.perTrack.set(label, {
      label,
      interval,
      baseStartMs: 0,
      initialized: false,
    });
  }

  function stepTrack(track, nowMs) {
    const durationMs = state.secondsPerSegment * 1000;
    if (!track.initialized) {
      track.baseStartMs = nowMs;
      track.initialized = true;
    }
    const interval = track.interval;
    if (!interval) {
      return null;
    }
    const start = interval.start;
    const end = interval.end;
    const elapsed = nowMs - track.baseStartMs;
    const t = durationMs > 0 ? elapsed / durationMs : 0;
    const frac = t - Math.floor(t);
    return { value: lerpComplex(start, end, Math.max(0, Math.min(1, frac))), done: false };
  }

  function frame(nowMs) {
    if (!state.playing || state.paused) {
      return;
    }
    state.lastNowMs = nowMs;
    suppressFingerQueryUpdates = true;
    try {
      for (const track of state.perTrack.values()) {
        const step = stepTrack(track, nowMs);
        if (!step?.value) {
          continue;
        }
        state.core.setFingerValue(track.label, step.value.x, step.value.y, { triggerRender: false });
      }
      state.core.render();
    } finally {
      suppressFingerQueryUpdates = false;
    }
    state.rafId = window.requestAnimationFrame(frame);
  }

  return {
    start() {
      if (state.playing) {
        return;
      }
      state.playing = true;
      state.paused = false;
      state.rafId = window.requestAnimationFrame(frame);
    },
    pause() {
      state.paused = true;
      if (state.rafId != null) {
        window.cancelAnimationFrame(state.rafId);
        state.rafId = null;
      }
    },
    stop() {
      state.playing = false;
      state.paused = false;
      if (state.rafId != null) {
        window.cancelAnimationFrame(state.rafId);
        state.rafId = null;
      }
    },
    isPlaying() {
      return state.playing && !state.paused;
    },
  };
}

function setAnimationStartFromCurrent() {
  if (!reflexCore) {
    return;
  }
  const snapshot = {};
  for (const label of activeFingerState.allSlots) {
    snapshot[label] = reflexCore.getFingerValue(label);
  }
  animationDraftStart = snapshot;
  alert('Animation start recorded for active handles.');
}

function setAnimationEndFromCurrent() {
  if (!reflexCore) {
    return;
  }
  if (!animationDraftStart) {
    alert('Set animation start first.');
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const affected = [];
  for (const label of activeFingerState.allSlots) {
    const start = animationDraftStart[label];
    if (!start) {
      continue;
    }
    const end = reflexCore.getFingerValue(label);
    const key = `${label}${ANIMATION_SUFFIX}`;
    const serialized = serializeAnimationInterval({
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
    });
    if (serialized) {
      params.set(key, serialized);
      affected.push(label);
    } else {
      params.delete(key);
    }
  }
  replaceUrlSearch(params);
  animationDraftStart = null;

  const tracks = buildAnimationTracksFromQuery();
  if (tracks.size) {
    applyAnimationStartValues(tracks);
    if (!isEditModeActive()) {
      startAnimations(tracks);
    }
  }
  alert(affected.length ? `Animation interval set for: ${affected.join(', ')}` : 'No active handles to animate.');
}

function promptAndSetAnimationTime() {
  const current = formatSecondsForQuery(animationSeconds) || `${DEFAULT_ANIMATION_SECONDS}s`;
  const raw = window.prompt('Set animation time (seconds, suffix "s" optional):', current);
  if (raw === null) {
    return;
  }
  const parsed = parseSecondsFromQuery(raw);
  if (!parsed) {
    alert('Could not parse animation time. Example: "5s" or "10".');
    return;
  }
  animationSeconds = parsed;
  updateSearchParam(ANIMATION_TIME_PARAM, formatSecondsForQuery(parsed));
  const tracks = buildAnimationTracksFromQuery();
  if (tracks.size && !isEditModeActive()) {
    startAnimations(tracks);
  }
}

function confirmAndReset() {
  if (
    !window.confirm(
      'Reset the current formula and finger positions?',
    )
  ) {
    return;
  }
  resetApplicationState();
}

function resetApplicationState() {
  formulaTextarea.value = DEFAULT_FORMULA_TEXT;
  applyFormulaFromTextarea({ updateQuery: false });
  updateFormulaQueryParam(null).catch((error) =>
    console.warn('Failed to clear formula parameter.', error),
  );
  clearPersistedLastSearch();
  resetFingerValuesToDefaults();
  clearError();
  // Reset is a fresh start: clear undo/redo stacks and seed with the new state.
  historyPast.length = 0;
  historyFuture.length = 0;
  commitHistorySnapshot({ force: true });
}

function resetFingerValuesToDefaults() {
  if (!reflexCore) {
    return;
  }
  Array.from(knownFingerLabels).forEach((label) => {
    const defaults = defaultFingerOffset(label);
    reflexCore.setFingerValue(label, defaults.x, defaults.y);
  });
}

async function saveCanvasImage() {
  if (!canvas) {
    return;
  }
  if (!reflexCore) {
    alert('Unable to save image because the renderer is unavailable.');
    return;
  }

  const defaultSize = canvas.width && canvas.height ? { width: canvas.width, height: canvas.height } : null;
  const presets = [
    ...(defaultSize
      ? [
        {
          key: 'current',
          label: `Current (${defaultSize.width}×${defaultSize.height} px)`,
          width: defaultSize.width,
          height: defaultSize.height,
        },
      ]
      : []),
    ...defaultImageExportPresets(),
  ];

  const requested = await promptImageExportSize({
    title: 'Export image (PNG)',
    presets,
    defaultSize: defaultSize || undefined,
  });
  if (!requested) {
    return;
  }

  showTransientStatus('Rendering…', { timeoutMs: 4000 });

  const activeLabels = new Set([
    ...Array.from(knownFingerLabels),
    ...(activeFingerState?.allSlots || []),
    'W1',
    'W2',
  ]);

  const blob = await renderOffscreenCanvasToPngBlob({
    width: requested.width,
    height: requested.height,
    render: async (exportCanvas) => {
      // Build a one-shot renderer that ignores DPR/client sizing and renders at exact pixel dimensions.
      const exportCore = new ReflexCore(exportCanvas, reflexCore.getFormulaAST(), {
        autoRender: false,
        installEventListeners: false,
      });

      try {
        // Match the current finger state.
        for (const label of activeLabels) {
          if (!isFingerLabel(label)) continue;
          const v = reflexCore.getFingerValue(label);
          exportCore.setFingerValue(label, v.x, v.y, { triggerRender: false });
        }

        exportCore.renderToPixelSize(requested.width, requested.height);
        if (exportCore.gl && typeof exportCore.gl.finish === 'function') {
          exportCore.gl.finish();
        }
      } finally {
        exportCore.dispose?.();
      }
    },
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `reflex4you-${requested.width}x${requested.height}-${stamp}.png`;
  downloadBlob(blob, filename);
}

async function ensureCanvasSnapshotReady() {
  if (reflexCore) {
    reflexCore.render();
    if (reflexCore.gl && typeof reflexCore.gl.finish === 'function') {
      reflexCore.gl.finish();
    }
  }
  await waitForNextFrame();
}

function waitForNextFrame() {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    return Promise.resolve();
  }
  return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

function saveCanvasImageFallback(filename) {
  if (!canvas) {
    return;
  }
  try {
    const dataUrl = canvas.toDataURL('image/png');
    triggerImageDownload(dataUrl, filename, false);
  } catch (err) {
    alert(`Unable to save image: ${err.message}`);
  }
}

function triggerImageDownload(url, filename, shouldRevoke) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  if (shouldRevoke) {
    URL.revokeObjectURL(url);
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').then((registration) => {
      // Auto-activate updated workers so cache/version bumps take effect quickly.
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      registration?.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            // New content is available; activate it immediately.
            installing.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    }).catch((error) => {
      console.warn('Reflex4You service worker registration failed.', error);
    });
  });
}
