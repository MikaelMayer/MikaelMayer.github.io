import {
  ReflexCore,
  createDefaultFormulaAST,
} from './core-engine.mjs';
import { parseFormulaInput } from './arithmetic-parser.mjs';

const canvas = document.getElementById('glcanvas');
const formulaTextarea = document.getElementById('formula');
const errorDiv = document.getElementById('error');
const f1Indicator = document.getElementById('f1-indicator');
const f2Indicator = document.getElementById('f2-indicator');
const fingerOverlay = document.getElementById('finger-overlay');
const rootElement = typeof document !== 'undefined' ? document.documentElement : null;
const FINGER_IDS = ['F1', 'F2'];
const fingerDots = FINGER_IDS.reduce((acc, id) => {
  acc[id] = document.querySelector(`[data-finger-dot="${id}"]`);
  return acc;
}, {});
const fingerIndicators = {
  F1: f1Indicator,
  F2: f2Indicator,
};
const fingerLastSerialized = {
  F1: null,
  F2: null,
};

const latestOffsets = {
  F1: { x: 0, y: 0 },
  F2: { x: 0, y: 0 },
};

let activeFingerUsage = { F1: false, F2: false };

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

function refreshFingerIndicator(finger) {
  const indicator = fingerIndicators[finger];
  if (!indicator) {
    return;
  }
  const latest = latestOffsets[finger];
  indicator.textContent = formatComplexForDisplay(finger, latest.x, latest.y);
  indicator.style.display = '';
  if (activeFingerUsage[finger]) {
    indicator.removeAttribute('data-inactive');
  } else {
    indicator.setAttribute('data-inactive', 'true');
  }
}

const DEFAULT_FORMULA_TEXT = '(z - F1) * (z + F1)';

const defaultParseResult = parseFormulaInput(DEFAULT_FORMULA_TEXT);
const fallbackDefaultAST = defaultParseResult.ok ? defaultParseResult.value : createDefaultFormulaAST();

function readFormulaFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('formula');
  if (!raw) {
    return null;
  }
  try {
    return decodeURIComponent(raw);
  } catch (_) {
    return raw;
  }
}

function updateFormulaQueryParam(source) {
  const params = new URLSearchParams(window.location.search);
  if (source) {
    params.set('formula', source);
  } else {
    params.delete('formula');
  }
  const newQuery = params.toString();
  const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}`;
  window.history.replaceState({}, '', newUrl);
}

function roundToTwoDecimals(value) {
  if (!Number.isFinite(value)) {
    return NaN;
  }
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatNumberForDisplay(value) {
  const rounded = roundToTwoDecimals(value);
  if (!Number.isFinite(rounded)) {
    return '?';
  }
  return rounded.toFixed(2).replace(/\.?0+$/, '');
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

  return null;
}

function attachFingerIndicatorPrompt(finger, getOffset, setOffset) {
  const indicator = fingerIndicators[finger];
  if (!indicator) {
    return;
  }
  indicator.addEventListener('click', () => {
    const currentOffset = getOffset();
    const currentValue = formatComplexForQuery(currentOffset.x, currentOffset.y) || '0+0i';
    const next = window.prompt(`Set ${finger} (formats: "a+bi" or "a,b")`, currentValue);
    if (next === null) {
      return;
    }
    const parsed = parseComplexString(next);
    if (!parsed) {
      alert(`Could not parse ${finger}. Use "a+bi" or "real,imag".`);
      return;
    }
    setOffset(parsed.x, parsed.y);
  });
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

function showError(msg) {
  errorDiv.textContent = msg;
  errorDiv.style.display = 'block';
}

function clearError() {
  errorDiv.style.display = 'none';
  errorDiv.textContent = '';
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

function detectFingerUsage(ast) {
  if (!ast) {
    return { F1: false, F2: false };
  }
  const usage = { F1: false, F2: false };
  const visit = (node) => {
    if (!node || (usage.F1 && usage.F2)) {
      return;
    }
    switch (node.kind) {
      case 'Offset':
        usage.F1 = true;
        break;
      case 'Offset2':
        usage.F2 = true;
        break;
      case 'Pow':
        visit(node.base);
        break;
      case 'Exp':
      case 'Sin':
      case 'Cos':
      case 'Ln':
        visit(node.value);
        break;
      case 'Sub':
      case 'Mul':
      case 'Op':
      case 'Add':
      case 'Div':
        visit(node.left);
        visit(node.right);
        break;
      case 'Compose':
        visit(node.f);
        visit(node.g);
        break;
      default:
        break;
    }
  };
  visit(ast);
  return usage;
}

function applyFingerVisibility() {
  const hasAnyFinger = activeFingerUsage.F1 || activeFingerUsage.F2;
  if (fingerOverlay) {
    fingerOverlay.style.display = hasAnyFinger ? 'block' : 'none';
  }
  FINGER_IDS.forEach((finger) => {
    refreshFingerIndicator(finger);
    const dot = fingerDots[finger];
    if (dot && !activeFingerUsage[finger]) {
      dot.classList.remove('visible');
    }
  });
}

function updateFingerUsageFromAST(ast) {
  activeFingerUsage = detectFingerUsage(ast);
  applyFingerVisibility();
  updateFingerDotPosition('F1');
  updateFingerDotPosition('F2');
}

function updateFingerDotPosition(finger) {
  const dot = fingerDots[finger];
  if (!dot) {
    return;
  }
  if (!reflexCore || !activeFingerUsage[finger]) {
    dot.classList.remove('visible');
    return;
  }
  const latest = latestOffsets[finger];
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

let initialFormulaSource = readFormulaFromQuery();
if (!initialFormulaSource || !initialFormulaSource.trim()) {
  initialFormulaSource = DEFAULT_FORMULA_TEXT;
}

const initialF1FromQuery = readFingerFromQuery('F1');
const initialF2FromQuery = readFingerFromQuery('F2');

const initialParse = parseFormulaInput(initialFormulaSource);
let initialAST;

if (initialParse.ok) {
  initialAST = initialParse.value;
  clearError();
} else {
  console.warn('Failed to parse initial formula, rendering fallback AST.', initialParse);
  initialAST = fallbackDefaultAST;
  showParseError(initialFormulaSource, initialParse);
}

activeFingerUsage = detectFingerUsage(initialAST);
applyFingerVisibility();

formulaTextarea.value = initialFormulaSource;

let reflexCore;
try {
  reflexCore = new ReflexCore(canvas, initialAST);
} catch (err) {
  alert(err.message);
  throw err;
}

function handleFingerOffsetChange(finger, offset) {
  latestOffsets[finger] = { x: offset.x, y: offset.y };
  refreshFingerIndicator(finger);
  const serialized = formatComplexForQuery(offset.x, offset.y);
  if (serialized !== fingerLastSerialized[finger]) {
    fingerLastSerialized[finger] = serialized;
    updateFingerQueryParam(finger, offset.x, offset.y);
  }
  updateFingerDotPosition(finger);
}

const handleOffsetChange = (offset) => handleFingerOffsetChange('F1', offset);
const handleOffset2Change = (offset) => handleFingerOffsetChange('F2', offset);

if (initialF1FromQuery) {
  reflexCore.setOffset(initialF1FromQuery.x, initialF1FromQuery.y);
}
if (initialF2FromQuery) {
  reflexCore.setOffset2(initialF2FromQuery.x, initialF2FromQuery.y);
}

reflexCore.onOffsetChange(handleOffsetChange);
reflexCore.onOffset2Change(handleOffset2Change);
updateFingerUsageFromAST(initialAST);

attachFingerIndicatorPrompt('F1', () => reflexCore.getOffset(), (x, y) => reflexCore.setOffset(x, y));
attachFingerIndicatorPrompt('F2', () => reflexCore.getOffset2(), (x, y) => reflexCore.setOffset2(x, y));

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
  const result = parseFormulaInput(source);
  if (!result.ok) {
    showParseError(source, result);
    return;
  }
  clearError();
  reflexCore.setFormulaAST(result.value);
  updateFingerUsageFromAST(result.value);
  if (updateQuery) {
    updateFormulaQueryParam(source);
  }
}

formulaTextarea.addEventListener('input', () => applyFormulaFromTextarea());

canvas.addEventListener('pointerdown', (e) => reflexCore.handlePointerDown(e));
canvas.addEventListener('pointermove', (e) => reflexCore.handlePointerMove(e));
['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
  canvas.addEventListener(type, (e) => reflexCore.handlePointerEnd(e));
});

window.addEventListener('resize', () => {
  updateFingerDotPosition('F1');
  updateFingerDotPosition('F2');
});
