import {
  ReflexCore,
  defaultFormulaSource,
  evaluateFormulaSource,
  createDefaultFormulaAST,
} from './core-engine.mjs';

const canvas = document.getElementById('glcanvas');
const formulaTextarea = document.getElementById('formula');
const applyBtn = document.getElementById('apply-btn');
const errorDiv = document.getElementById('error');

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
  const newQuery = params.toString(); // encodes via encodeURIComponent under the hood
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

let initialFormulaSource = readFormulaFromQuery() || defaultFormulaSource;
let initialAST;
try {
  initialAST = evaluateFormulaSource(initialFormulaSource);
} catch (err) {
  console.error('Failed to evaluate formula from query, falling back to default.', err);
  initialFormulaSource = defaultFormulaSource;
  initialAST = createDefaultFormulaAST();
  showError('Invalid formula in URL. Reverting to default.');
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
  clearError();
  const src = formulaTextarea.value.trim();
  if (!src) {
    showError('Formula cannot be empty.');
    return;
  }
  try {
    const ast = evaluateFormulaSource(src);
    reflexCore.setFormulaAST(ast);
    if (updateQuery) {
      updateFormulaQueryParam(src);
    }
  } catch (e) {
    console.error(e);
    showError(e.message);
  }
}

applyBtn.addEventListener('click', () => applyFormulaFromTextarea());

formulaTextarea.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    applyFormulaFromTextarea();
  }
});

canvas.addEventListener('pointerdown', (e) => reflexCore.handlePointerDown(e));
canvas.addEventListener('pointermove', (e) => reflexCore.handlePointerMove(e));
['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
  canvas.addEventListener(type, (e) => reflexCore.handlePointerEnd(e));
});
