import {
  ReflexCore,
  createDefaultFormulaAST,
} from './core-engine.mjs';
import { visitAst } from './ast-utils.mjs';
import { parseFormulaInput } from './arithmetic-parser.mjs';
import { formatCaretIndicator } from './parse-error-format.mjs';
import {
  FORMULA_PARAM,
  FORMULA_B64_PARAM,
  verifyCompressionSupport,
  readFormulaFromQuery,
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
const rootElement = typeof document !== 'undefined' ? document.documentElement : null;

let fatalErrorActive = false;

const EDIT_PARAM = 'edit';
const ANIMATION_TIME_PARAM = 't';

const DEFAULT_ANIMATION_SECONDS = 5;

const FIXED_FINGER_ORDER = ['F1', 'F2', 'F3'];
const DYNAMIC_FINGER_ORDER = ['D1', 'D2', 'D3'];
const W_FINGER_ORDER = ['W1', 'W2'];
const ALL_FINGER_LABELS = [...FIXED_FINGER_ORDER, ...DYNAMIC_FINGER_ORDER, ...W_FINGER_ORDER];
const DEFAULT_FINGER_OFFSETS = Object.freeze(
  ALL_FINGER_LABELS.reduce((acc, label) => {
    const value = label === 'W1' ? { x: 1, y: 0 } : { x: 0, y: 0 };
    acc[label] = Object.freeze(value);
    return acc;
  }, {}),
);

function cloneFingerOffsets(source) {
  const clone = {};
  ALL_FINGER_LABELS.forEach((label) => {
    const baseline = source[label] || { x: 0, y: 0 };
    clone[label] = { x: baseline.x, y: baseline.y };
  });
  return clone;
}

const FINGER_METADATA = ALL_FINGER_LABELS.reduce((acc, label) => {
  acc[label] = {
    label,
    type: label.startsWith('F') ? 'fixed' : label.startsWith('D') ? 'dynamic' : 'w',
  };
  return acc;
}, {});

const fingerIndicators = new Map();
const fingerDots = new Map();
const fingerLastSerialized = {};
const latestOffsets = cloneFingerOffsets(DEFAULT_FINGER_OFFSETS);

ALL_FINGER_LABELS.forEach((label) => {
  fingerLastSerialized[label] = null;
});

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

const defaultParseResult = parseFormulaInput(DEFAULT_FORMULA_TEXT, getParserOptionsFromFingers());
const fallbackDefaultAST = defaultParseResult.ok ? defaultParseResult.value : createDefaultFormulaAST();
let reflexCore = null;
let scheduledFingerDrivenReparse = false;

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

function roundToThreeDecimals(value) {
  if (!Number.isFinite(value)) {
    return NaN;
  }
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatNumberForDisplay(value) {
  const rounded = roundToThreeDecimals(value);
  if (!Number.isFinite(rounded)) {
    return '?';
  }
  return rounded.toFixed(3).replace(/\.?0+$/, '');
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
  const meta = FINGER_METADATA[label];
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
  const meta = FINGER_METADATA[label];
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
}

function readFingerFromQuery(label) {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(label);
  return parseComplexString(raw);
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
}

function clearFingerQueryParam(label) {
  fingerLastSerialized[label] = null;
  updateFingerQueryParam(label, Number.NaN, Number.NaN);
}

function handleFingerValueChange(label, offset) {
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
  const fixedSlots = FIXED_FINGER_ORDER.filter((label) => analysis.usage.fixed.has(label));
  const dynamicSlots = DYNAMIC_FINGER_ORDER.filter((label) => analysis.usage.dynamic.has(label));
  const wSlots = W_FINGER_ORDER.filter((label) => analysis.usage.w.has(label));
  if (fixedSlots.length && dynamicSlots.length) {
    return {
      mode: 'invalid',
      fixedSlots: [],
      dynamicSlots: [],
      wSlots: [],
      axisConstraints: new Map(),
      error: 'Formulas cannot mix F fingers (F1..F3) with D fingers (D1..D3).',
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
  syncFingerUI();
  activeFingerState.allSlots.forEach((label) => {
    refreshFingerIndicator(label);
    updateFingerDotPosition(label);
  });
  ALL_FINGER_LABELS.forEach((label) => {
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
    ALL_FINGER_LABELS.forEach((label) => {
      reflexCore.onFingerChange(label, (offset) => handleFingerValueChange(label, offset));
    });

    ALL_FINGER_LABELS.forEach((label) => {
      const parsed = readFingerFromQuery(label);
      if (parsed) {
        reflexCore.setFingerValue(label, parsed.x, parsed.y);
      }
    });
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
}

const bootstrapPromise = bootstrapReflexApplication();
if (typeof window !== 'undefined') {
  window.__reflexReady = bootstrapPromise;
}
bootstrapPromise.catch((error) => {
  console.error('Failed to bootstrap Reflex4You.', error);
  showFatalError('Unable to initialize Reflex4You.');
});

formulaTextarea.addEventListener('focus', () => {
  formulaTextarea.classList.add('expanded');
});
formulaTextarea.addEventListener('blur', () => {
  formulaTextarea.classList.remove('expanded');
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
    case 'reset':
      confirmAndReset();
      break;
    case 'set-animation-start':
      setAnimationStartFromCurrent();
      break;
    case 'set-animation-end':
      setAnimationEndFromCurrent();
      break;
    case 'set-animation-time':
      promptAndSetAnimationTime();
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

function buildAnimationTracksFromQuery() {
  const tracks = new Map();
  for (const label of ALL_FINGER_LABELS) {
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
      'Reset the current formula and finger positions? This cannot be undone.',
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
  resetFingerValuesToDefaults();
  clearError();
}

function resetFingerValuesToDefaults() {
  if (!reflexCore) {
    return;
  }
  ALL_FINGER_LABELS.forEach((label) => {
    const defaults = DEFAULT_FINGER_OFFSETS[label];
    reflexCore.setFingerValue(label, defaults.x, defaults.y);
  });
}

async function saveCanvasImage() {
  if (!canvas) {
    return;
  }
  await ensureCanvasSnapshotReady();
  const filename = `reflex4you-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  if (canvas.toBlob) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob && blob.size > 0) {
      const objectUrl = URL.createObjectURL(blob);
      triggerImageDownload(objectUrl, filename, true);
      return;
    }
  }
  saveCanvasImageFallback(filename);
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
