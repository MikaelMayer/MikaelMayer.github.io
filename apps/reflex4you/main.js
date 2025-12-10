import {
  ReflexCore,
  createDefaultFormulaAST,
} from './core-engine.mjs';
import { visitAst } from './ast-utils.mjs';
import { parseFormulaInput } from './arithmetic-parser.mjs';

const canvas = document.getElementById('glcanvas');
const formulaTextarea = document.getElementById('formula');
const errorDiv = document.getElementById('error');
const fingerIndicatorStack = document.getElementById('finger-indicator-stack');
const fingerOverlay = document.getElementById('finger-overlay');
const menuButton = document.getElementById('menu-button');
const menuDropdown = document.getElementById('menu-dropdown');
const rootElement = typeof document !== 'undefined' ? document.documentElement : null;

let fatalErrorActive = false;

const FORMULA_PARAM = 'formula';
const FORMULA_B64_PARAM = 'formulab64';
const sharedTextEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const sharedTextDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
const hasSecureContext = typeof window !== 'undefined' && Boolean(window.isSecureContext);
const compressionStreamsAvailable =
  typeof CompressionStream === 'function' && typeof DecompressionStream === 'function' && hasSecureContext;
let supportsCompressionStream = compressionStreamsAvailable;
let supportsDecompressionStream = compressionStreamsAvailable;

function disableCompressionStreams() {
  if (supportsCompressionStream || supportsDecompressionStream) {
    supportsCompressionStream = false;
    supportsDecompressionStream = false;
    if (typeof window !== 'undefined') {
      window.__reflexCompressionEnabled = false;
    }
  }
}

if (typeof window !== 'undefined') {
  window.__reflexCompressionEnabled = supportsCompressionStream && supportsDecompressionStream;
}

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

async function transformWithStream(bytes, StreamConstructor) {
  if (typeof Blob === 'undefined' || typeof ReadableStream === 'undefined') {
    throw new Error('Streaming compression not supported');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new StreamConstructor('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function compressBytes(bytes) {
  if (!supportsCompressionStream) {
    throw new Error('CompressionStream API not supported');
  }
  return transformWithStream(bytes, CompressionStream);
}

async function decompressBytes(bytes) {
  if (!supportsDecompressionStream) {
    throw new Error('DecompressionStream API not supported');
  }
  return transformWithStream(bytes, DecompressionStream);
}

async function verifyCompressionSupport() {
  if (!supportsCompressionStream) {
    return;
  }
  try {
    await compressBytes(encodeUtf8('probe'));
  } catch (error) {
    console.warn('CompressionStream is unavailable in this context; falling back to legacy query parameters.', error);
    disableCompressionStreams();
  }
}

function encodeUtf8(value) {
  if (sharedTextEncoder) {
    return sharedTextEncoder.encode(value);
  }
  const percentEncoded = encodeURIComponent(value);
  const bytes = [];
  for (let i = 0; i < percentEncoded.length; ) {
    const char = percentEncoded[i];
    if (char === '%') {
      const hex = percentEncoded.slice(i + 1, i + 3);
      bytes.push(parseInt(hex, 16));
      i += 3;
    } else {
      bytes.push(char.charCodeAt(0));
      i += 1;
    }
  }
  return Uint8Array.from(bytes);
}

function decodeUtf8(bytes) {
  if (sharedTextDecoder) {
    return sharedTextDecoder.decode(bytes);
  }
  let percentEncoded = '';
  for (let i = 0; i < bytes.length; i++) {
    percentEncoded += `%${bytes[i].toString(16).padStart(2, '0')}`;
  }
  try {
    return decodeURIComponent(percentEncoded);
  } catch (_) {
    return percentEncoded;
  }
}

function base64UrlEncodeBytes(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecodeToBytes(encoded) {
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const paddingNeeded = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(paddingNeeded);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function encodeFormulaToCompressedParam(source) {
  const utf8 = encodeUtf8(source);
  if (!supportsCompressionStream) {
    return null;
  }
  try {
    const compressed = await compressBytes(utf8);
    return base64UrlEncodeBytes(compressed);
  } catch (error) {
    console.warn('CompressionStream failed; falling back to legacy formula parameter.', error);
    disableCompressionStreams();
    return null;
  }
}

async function decodeFormulaFromCompressedParam(encoded) {
  if (!supportsDecompressionStream) {
    return { ok: false, error: new Error('CompressionStream API unavailable') };
  }
  try {
    const compressed = base64UrlDecodeToBytes(encoded);
    const decompressed = await decompressBytes(compressed);
    const decoded = decodeUtf8(decompressed);
    return { ok: true, value: decoded };
  } catch (error) {
    disableCompressionStreams();
    return { ok: false, error };
  }
}

async function writeFormulaToSearchParams(params, source) {
  params.delete(FORMULA_PARAM);
  params.delete(FORMULA_B64_PARAM);
  if (!source || !source.trim()) {
    return;
  }
  try {
    const encoded = await encodeFormulaToCompressedParam(source);
    if (encoded) {
      params.set(FORMULA_B64_PARAM, encoded);
    } else {
      params.set(FORMULA_PARAM, source);
    }
  } catch (error) {
    console.warn('Failed to encode formula into formulab64 parameter. Falling back to raw text.', error);
    params.set(FORMULA_PARAM, source);
  }
}

function replaceUrlSearch(params) {
  const newQuery = params.toString();
  const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}`;
  window.history.replaceState({}, '', newUrl);
}

async function upgradeLegacyFormulaParam(source) {
  const params = new URLSearchParams(window.location.search);
  await writeFormulaToSearchParams(params, source);
  replaceUrlSearch(params);
}

async function readFormulaFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get(FORMULA_B64_PARAM);
  if (encoded) {
    const decoded = await decodeFormulaFromCompressedParam(encoded);
    if (decoded.ok) {
      return decoded.value;
    }
    console.warn('Failed to decode formulab64 parameter, falling back to default formula.', decoded.error);
    showError('We could not decode the formula embedded in this link. Resetting to the default formula.');
    params.delete(FORMULA_B64_PARAM);
    replaceUrlSearch(params);
  }
  const raw = params.get(FORMULA_PARAM);
  if (!raw) {
    return null;
  }
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch (_) {
    // Already decoded, ignore.
  }
  await upgradeLegacyFormulaParam(decoded);
  return decoded;
}

async function updateFormulaQueryParam(source) {
  const params = new URLSearchParams(window.location.search);
  await writeFormulaToSearchParams(params, source);
  replaceUrlSearch(params);
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
  if (activeFingerState.activeLabelSet.has(label)) {
    const serialized = formatComplexForQuery(offset.x, offset.y);
    if (serialized !== fingerLastSerialized[label]) {
      fingerLastSerialized[label] = serialized;
      updateFingerQueryParam(label, offset.x, offset.y);
    }
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

function formatCaretIndicator(source, failure) {
  const displaySource = source.length ? source : '(empty)';
  const origin = failure?.span?.input?.start ?? 0;
  const pointer = failure?.span ? failure.span.start - origin : 0;
  const clamped = Number.isFinite(pointer)
    ? Math.max(0, Math.min(pointer, source.length))
    : 0;
  const caretLine = `${' '.repeat(clamped)}^`;
  const message = failure?.message || 'Parse error';
  return `${displaySource}\n${caretLine}\n${message}`;
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
  let initialFormulaSource = await readFormulaFromQuery();
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

function applyFormulaFromTextarea({ updateQuery = true } = {}) {
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
  applyFingerState(nextState);
  if (updateQuery) {
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
    case 'save-image':
      saveCanvasImage();
      break;
    default:
      break;
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

function saveCanvasImage() {
  if (!canvas) {
    return;
  }
  const filename = `reflex4you-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  const handleBlob = (blob) => {
    if (!blob) {
      saveCanvasImageFallback(filename);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    triggerImageDownload(objectUrl, filename, true);
  };
  if (canvas.toBlob) {
    canvas.toBlob(handleBlob, 'image/png');
  } else {
    saveCanvasImageFallback(filename);
  }
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
