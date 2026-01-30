import { parseFormulaInput } from './arithmetic-parser.mjs';
import { formatCaretIndicator, getCaretSelection } from './parse-error-format.mjs';
import { renderFormulaToCanvas, FORMULA_RENDERER_BUILD_ID } from './formula-renderer.mjs';
import {
  verifyCompressionSupport,
  readFormulaFromQuery,
  updateFormulaQueryParam,
  updateFormulaQueryParamImmediately,
} from './formula-url.mjs';

// Ensure the PWA service worker is installed even when users land directly
// on the formula page (e.g. from a shared link).
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  // Version the SW script URL so updates can't get stuck behind a cached SW script.
  const SW_URL = './service-worker.js?sw=41.0';
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SW_URL).then((registration) => {
      // Match the viewer page behavior: activate updated workers ASAP so
      // users don't get stuck on stale cached assets when only using /formula.html.
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
    }).catch((error) => {
      console.warn('Reflex4You service worker registration failed.', error);
    });
  });
}

const DEFAULT_FORMULA_TEXT = 'z';
const DEFAULT_CANVAS_BG_HEX = 'ffffff80';
const DEFAULT_CANVAS_FG_HEX = '000000ff';
let currentCanvasFgHex = DEFAULT_CANVAS_FG_HEX;

function $(id) {
  return document.getElementById(id);
}

const formulaInput = $('formula-input');
const formulaError = $('formula-error');
let parseErrorSelection = null;

function normalizeHex8(value) {
  const raw = String(value || '').trim().replace(/^#/, '');
  if (raw.length === 6 && /^[0-9a-fA-F]{6}$/.test(raw)) {
    return `${raw}ff`.toLowerCase();
  }
  if (raw.length === 8 && /^[0-9a-fA-F]{8}$/.test(raw)) {
    return raw.toLowerCase();
  }
  return null;
}

function readCanvasBackgroundHex() {
  const el = $('bghex');
  const parsed = normalizeHex8(el?.value);
  return parsed || DEFAULT_CANVAS_BG_HEX;
}

function readCanvasForegroundHex() {
  return currentCanvasFgHex || DEFAULT_CANVAS_FG_HEX;
}

function setCanvasForegroundHex(value) {
  const normalized = normalizeHex8(value);
  currentCanvasFgHex = normalized || DEFAULT_CANVAS_FG_HEX;
}

function updateForegroundForBackgroundHex(bgHex, presetMap) {
  if (!presetMap) return;
  const normalized = normalizeHex8(bgHex);
  if (!normalized) return;
  const presetFg = presetMap.get(normalized);
  if (presetFg) {
    currentCanvasFgHex = presetFg;
  }
}

function setDownloadEnabled(enabled) {
  const btn = $('download-png');
  if (!btn) return;
  btn.disabled = !enabled;
}

function setParseErrorSelection(selection) {
  if (!selection || !Number.isFinite(selection.start) || !formulaInput || !formulaError) {
    parseErrorSelection = null;
    if (formulaError) {
      formulaError.removeAttribute('data-error-kind');
      formulaError.removeAttribute('title');
    }
    return;
  }
  const start = Math.max(0, selection.start);
  const end = Number.isFinite(selection.end) ? Math.max(start, selection.end) : start;
  parseErrorSelection = { start, end };
  formulaError.setAttribute('data-error-kind', 'parse');
  formulaError.title = 'Click to jump to error';
}

function scrollTextareaToSelection(textarea, selectionStart) {
  if (!textarea || typeof window === 'undefined') {
    return;
  }
  const value = textarea.value || '';
  const lineIndex = value.slice(0, selectionStart).split('\n').length - 1;
  let lineHeight = null;
  try {
    const style = window.getComputedStyle(textarea);
    lineHeight = parseFloat(style.lineHeight);
    if (!Number.isFinite(lineHeight)) {
      const fontSize = parseFloat(style.fontSize);
      lineHeight = Number.isFinite(fontSize) ? fontSize * 1.35 : null;
    }
  } catch (_) {
    lineHeight = null;
  }
  const targetTop = Number.isFinite(lineHeight)
    ? Math.max(0, lineIndex * lineHeight - textarea.clientHeight * 0.3)
    : null;
  if (Number.isFinite(targetTop)) {
    textarea.scrollTop = targetTop;
  }
}

function focusFormulaSelection(selection) {
  if (!formulaInput || !selection) {
    return;
  }
  const valueLength = formulaInput.value.length;
  const start = Math.max(0, Math.min(selection.start, valueLength));
  const end = Math.max(start, Math.min(selection.end, valueLength));
  formulaInput.focus();
  try {
    formulaInput.setSelectionRange(start, end);
  } catch (_) {
    // ignore
  }
  scrollTextareaToSelection(formulaInput, start);
}

function handleParseErrorClick(event) {
  if (!parseErrorSelection || !formulaInput) {
    return;
  }
  if (event?.target?.closest) {
    const ignore = event.target.closest('button, a, input, textarea, select');
    if (ignore) {
      return;
    }
  }
  event?.preventDefault?.();
  event?.stopPropagation?.();
  focusFormulaSelection(parseErrorSelection);
}

function showError(message, { parseSelection } = {}) {
  if (!formulaError) return;
  setParseErrorSelection(parseSelection);
  if (message) {
    formulaError.textContent = message;
    formulaError.style.display = 'block';
  } else {
    formulaError.textContent = '';
    formulaError.style.display = 'none';
  }
}

function showParseError(source, failure) {
  const parseSelection = getCaretSelection(source, failure);
  showError(formatCaretIndicator(source, failure), { parseSelection });
}

if (formulaError) {
  formulaError.addEventListener('click', handleParseErrorClick);
}

function showStaleWarning(message) {
  const el = $('stale-warning');
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.style.display = 'block';
  } else {
    el.textContent = '';
    el.style.display = 'none';
  }
}

function clearRender() {
  const renderEl = $('formula-render');
  if (renderEl) {
    const ctx = renderEl.getContext?.('2d');
    if (ctx) {
      ctx.clearRect(0, 0, renderEl.width || 0, renderEl.height || 0);
    }
    renderEl.removeAttribute('data-latex');
    renderEl.removeAttribute('data-renderer');
  }
  setDownloadEnabled(false);
  showStaleWarning(null);
}

function buildStaleDiagnostic({ latex, renderEl }) {
  const reasons = [];
  if (typeof latex === 'string') {
    if (latex.includes('\\cdot')) reasons.push('latex contains \\\\cdot (old renderer)');
    if (latex.includes('\\left(\\left(') || latex.includes('\\right)\\right)')) reasons.push('latex contains double parentheses');
  }
  const datasetBuild = renderEl?.dataset?.rendererBuildId || '';
  if (datasetBuild && datasetBuild !== FORMULA_RENDERER_BUILD_ID) {
    reasons.push(`renderer build id mismatch: "${datasetBuild}" != "${FORMULA_RENDERER_BUILD_ID}"`);
  }
  if (!datasetBuild) {
    reasons.push('renderer build id missing (likely stale cached module)');
  }

  if (!reasons.length) {
    return null;
  }

  const controllerUrl = navigator?.serviceWorker?.controller?.scriptURL || 'none';
  const scope = navigator?.serviceWorker?.controller ? '(controlled)' : '(not controlled)';
  return [
    'WARNING: stale/mismatched cached assets detected.',
    `Reasons: ${reasons.join('; ')}`,
    `Expected renderer: ${FORMULA_RENDERER_BUILD_ID}`,
    `Controller: ${controllerUrl} ${scope}`,
    'Fix: hard reload, or Application → Service Workers → Unregister; then reload.',
  ].join('\n');
}

async function renderFromSource(source, { updateUrl = false } = {}) {
  const normalized = String(source || '');
  if (updateUrl) {
    // Keep URL shareable while editing; do an immediate legacy update, then
    // attempt compressed upgrade asynchronously (debounced by caller).
    updateFormulaQueryParamImmediately(normalized);
  }

  const parsed = parseFormulaInput(normalized);
  if (!parsed.ok) {
    showParseError(normalized, parsed);
    clearRender();
    return { ok: false };
  }

  showError(null);
  const renderEl = $('formula-render');
  await renderFormulaToCanvas(parsed.value, renderEl, {
    backgroundHex: readCanvasBackgroundHex(),
    foregroundHex: readCanvasForegroundHex(),
  });
  const latex = renderEl?.dataset?.latex || '';
  showStaleWarning(buildStaleDiagnostic({ latex, renderEl }));
  setDownloadEnabled(true);
  return { ok: true };
}

async function bootstrap() {
  await verifyCompressionSupport();

  const decoded = await readFormulaFromQuery({
    onDecodeError: () => {
      showError('We could not decode the formula embedded in this link.');
    },
  });

  const source = (decoded && decoded.trim()) ? decoded : DEFAULT_FORMULA_TEXT;

  const inputEl = formulaInput;
  if (inputEl) {
    inputEl.value = source;
  }

  // Background controls.
  const bgEl = $('bghex');
  const presetButtons = Array.from(document.querySelectorAll?.('button[data-bghex]') || []);
  const presetForegroundByBgHex = new Map();
  presetButtons.forEach((btn) => {
    const bgHex = normalizeHex8(btn.getAttribute('data-bghex'));
    const fgHex = normalizeHex8(btn.getAttribute('data-fghex'));
    if (bgHex && fgHex) {
      presetForegroundByBgHex.set(bgHex, fgHex);
    }
  });
  if (bgEl && !normalizeHex8(bgEl.value)) {
    bgEl.value = DEFAULT_CANVAS_BG_HEX;
  }
  if (bgEl) {
    updateForegroundForBackgroundHex(bgEl.value, presetForegroundByBgHex);
    bgEl.addEventListener('input', () => {
      updateForegroundForBackgroundHex(bgEl.value, presetForegroundByBgHex);
      // Re-render without touching the URL; just affects the raster background.
      const current = inputEl ? inputEl.value : source;
      renderFromSource(current, { updateUrl: false }).catch(() => {});
    });
  }
  presetButtons.forEach((btn) => {
    const bgHex = normalizeHex8(btn.getAttribute('data-bghex')) || DEFAULT_CANVAS_BG_HEX;
    const fgHex = normalizeHex8(btn.getAttribute('data-fghex'));
    btn.addEventListener('click', () => {
      if (bgEl) bgEl.value = bgHex;
      if (fgHex) {
        setCanvasForegroundHex(fgHex);
      } else {
        updateForegroundForBackgroundHex(bgHex, presetForegroundByBgHex);
      }
      const current = inputEl ? inputEl.value : source;
      renderFromSource(current, { updateUrl: false }).catch(() => {});
    });
  });

  // Download.
  const downloadBtn = $('download-png');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const canvas = $('formula-render');
      if (!canvas || typeof canvas.toDataURL !== 'function') return;
      try {
        const href = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = href;
        a.download = 'formula.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (e) {
        console.warn('Failed to download canvas PNG.', e);
      }
    });
  }

  await renderFromSource(source, { updateUrl: false });

  // Live edit + render loop.
  let upgradeTimer = null;
  if (inputEl) {
    inputEl.addEventListener('input', () => {
      const current = inputEl.value;
      renderFromSource(current, { updateUrl: true }).catch((err) => {
        console.error('Failed to render formula.', err);
        showError('Unable to render formula.');
      });

      if (upgradeTimer != null) {
        window.clearTimeout(upgradeTimer);
      }
      upgradeTimer = window.setTimeout(() => {
        updateFormulaQueryParam(current).catch((error) => {
          console.warn('Failed to upgrade formula parameter.', error);
        });
      }, 450);
    });
  }
}

bootstrap().catch((err) => {
  console.error('Failed to bootstrap formula page', err);
  showError('Unable to load formula.');
});

