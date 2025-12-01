import {
  ReflexCore,
  createDefaultFormulaAST,
} from './core-engine.mjs';
import { parseFormulaInput } from './arithmetic-parser.mjs';

const canvas = document.getElementById('glcanvas');
const formulaTextarea = document.getElementById('formula');
const errorDiv = document.getElementById('error');

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

let initialFormulaSource = readFormulaFromQuery();
if (!initialFormulaSource || !initialFormulaSource.trim()) {
  initialFormulaSource = DEFAULT_FORMULA_TEXT;
}

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

formulaTextarea.value = initialFormulaSource;

let reflexCore;
try {
  reflexCore = new ReflexCore(canvas, initialAST);
} catch (err) {
  alert(err.message);
  throw err;
}

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
