import { parseFormulaInput } from './arithmetic-parser.mjs';
import { visitAst } from './ast-utils.mjs';
import { formatCaretIndicator, getCaretSelection } from './parse-error-format.mjs';
import { renderFormulaToCanvas } from './formula-renderer.mjs';
import { canvasToPngBlob, downloadBlob } from './image-export.mjs';
import {
  FORMULA_PARAM,
  FORMULA_B64_PARAM,
  LAST_STATE_SEARCH_KEY,
  verifyCompressionSupport,
  readFormulaFromQuery,
  writeFormulaToSearchParams,
} from './formula-url.mjs';
import { setupMenuDropdown } from './menu-ui.mjs';

// Ensure the PWA service worker is installed even when users land directly
// on the formula page (e.g. from a shared link).
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  // Version the SW script URL so updates can't get stuck behind a cached SW script.
  const SW_URL = './service-worker.js?sw=46.0';
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
const EXPORT_CROP_PADDING_PX = 8;
const EXPORT_CROP_COLOR_TOLERANCE = 10;
const EXPORT_CROP_ALPHA_TOLERANCE = 10;
let currentCanvasFgHex = DEFAULT_CANVAS_FG_HEX;
let lastRenderState = null;

function $(id) {
  return document.getElementById(id);
}

const formulaInput = $('formula-input');
const formulaError = $('formula-error');
const menuButton = $('menu-button');
const menuDropdown = $('menu-dropdown');
const inlineFingersToggle = $('inline-fingers');
let parseErrorSelection = null;
let initialFormulaFromUrl = null;

const FINGER_LABEL_REGEX = /^(?:[FD]\d+|W[012])$/;
let downloadInProgress = false;
let canDownload = false;

function clearPersistedFormulaSearch() {
  try {
    window.localStorage?.removeItem(LAST_STATE_SEARCH_KEY);
  } catch (_) {
    // ignore storage failures
  }
}

async function buildViewerUrl({ includeFormula, source }) {
  if (typeof window === 'undefined') {
    return './index.html';
  }
  const url = new URL(window.location.href);
  url.pathname = url.pathname.replace(/[^/]*$/, 'index.html');
  url.hash = '';
  const params = new URLSearchParams(url.search);
  if (includeFormula) {
    await writeFormulaToSearchParams(params, source);
  } else {
    params.delete(FORMULA_PARAM);
    params.delete(FORMULA_B64_PARAM);
  }
  url.search = params.toString();
  return url.toString();
}

async function handleMenuAction(action) {
  switch (action) {
    case 'visualize-formula': {
      const source = String(formulaInput?.value ?? '');
      const href = await buildViewerUrl({ includeFormula: true, source });
      window.location.href = href;
      break;
    }
    case 'back-to-viewer': {
      if (initialFormulaFromUrl != null) {
        const href = await buildViewerUrl({ includeFormula: true, source: initialFormulaFromUrl });
        window.location.href = href;
        break;
      }
      clearPersistedFormulaSearch();
      const href = await buildViewerUrl({ includeFormula: false });
      window.location.href = href;
      break;
    }
    default:
      break;
  }
}

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

function parseHex8Color(value) {
  const normalized = normalizeHex8(value);
  if (!normalized) return null;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const a = Number.parseInt(normalized.slice(6, 8), 16);
  if (![r, g, b, a].every((n) => Number.isFinite(n))) return null;
  return { r, g, b, a };
}

function getCanvasPixelRatio(canvas) {
  const cssWidth = canvas?.clientWidth || 0;
  const backingWidth = canvas?.width || 0;
  if (cssWidth > 0 && backingWidth > 0) {
    const ratio = backingWidth / cssWidth;
    return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  }
  return 1;
}

function findCanvasContentBounds(
  canvas,
  {
    backgroundHex,
    colorTolerance = EXPORT_CROP_COLOR_TOLERANCE,
    alphaTolerance = EXPORT_CROP_ALPHA_TOLERANCE,
  } = {},
) {
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return null;
  const width = canvas.width || 0;
  const height = canvas.height || 0;
  if (!width || !height) return null;

  let bg = parseHex8Color(backgroundHex) || { r: 0, g: 0, b: 0, a: 0 };
  if (bg.a === 0) {
    bg = { r: 0, g: 0, b: 0, a: 0 };
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  const data = ctx.getImageData(0, 0, width, height).data;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      const alphaDiff = Math.abs(a - bg.a);
      const colorDiff = Math.abs(r - bg.r) + Math.abs(g - bg.g) + Math.abs(b - bg.b);
      if (alphaDiff > alphaTolerance || colorDiff > colorTolerance) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

function cropCanvasToBounds(canvas, bounds, padding = 0) {
  if (!canvas || !bounds) return null;
  const width = canvas.width || 0;
  const height = canvas.height || 0;
  if (!width || !height) return null;
  const pad = Math.max(0, Math.floor(padding));
  const minX = Math.max(0, bounds.minX - pad);
  const minY = Math.max(0, bounds.minY - pad);
  const maxX = Math.min(width - 1, bounds.maxX + pad);
  const maxY = Math.min(height - 1, bounds.maxY + pad);
  const cropW = Math.max(1, maxX - minX + 1);
  const cropH = Math.max(1, maxY - minY + 1);

  const output = document.createElement('canvas');
  output.width = cropW;
  output.height = cropH;
  const outCtx = output.getContext('2d');
  if (!outCtx) return null;
  outCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
  return output;
}

function parseComplexString(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\s+/g, '').toLowerCase();

  if (normalized.endsWith('i')) {
    const core = normalized.slice(0, -1);
    if (!core.length || core === '+') {
      return { x: 0, y: 1 };
    }
    if (core === '-') {
      return { x: 0, y: -1 };
    }
    let splitIdx = -1;
    for (let i = core.length - 1; i > 0; i -= 1) {
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
    } else {
      const im = Number(core);
      if (Number.isFinite(im)) {
        return { x: 0, y: im };
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

function readFingerValuesFromQuery() {
  if (typeof window === 'undefined') {
    return new Map();
  }
  const params = new URLSearchParams(window.location.search);
  const values = new Map();
  params.forEach((value, key) => {
    if (!FINGER_LABEL_REGEX.test(key)) {
      return;
    }
    const parsed = parseComplexString(value);
    if (parsed) {
      values.set(key, parsed);
    }
  });
  return values;
}

function defaultFingerValue(label) {
  return label === 'W1' ? { x: 1, y: 0 } : { x: 0, y: 0 };
}

function collectFingerSlots(ast) {
  const slots = new Set();
  if (!ast || typeof ast !== 'object') {
    return slots;
  }
  visitAst(ast, (node) => {
    if (node && typeof node === 'object' && node.kind === 'FingerOffset' && node.slot) {
      slots.add(node.slot);
    }
  });
  return slots;
}

function buildInlineFingerValues(ast) {
  const queryValues = readFingerValuesFromQuery();
  const slots = collectFingerSlots(ast);
  const inlineValues = new Map();
  slots.forEach((slot) => {
    if (queryValues.has(slot)) {
      inlineValues.set(slot, queryValues.get(slot));
    } else {
      inlineValues.set(slot, defaultFingerValue(slot));
    }
  });
  return inlineValues;
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
  canDownload = Boolean(enabled);
  if (!btn) return;
  btn.disabled = !canDownload;
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
  lastRenderState = null;
  setDownloadEnabled(false);
}

async function renderFromSource(source) {
  const normalized = String(source || '');
  const parsed = parseFormulaInput(normalized);
  if (!parsed.ok) {
    showParseError(normalized, parsed);
    clearRender();
    return { ok: false };
  }

  showError(null);
  const renderEl = $('formula-render');
  const inlineFingerConstants = Boolean(inlineFingersToggle?.checked);
  const fingerValues = inlineFingerConstants ? buildInlineFingerValues(parsed.value) : null;
  const backgroundHex = readCanvasBackgroundHex();
  const foregroundHex = readCanvasForegroundHex();
  await renderFormulaToCanvas(parsed.value, renderEl, {
    backgroundHex,
    foregroundHex,
    inlineFingerConstants,
    fingerValues,
  });
  lastRenderState = {
    ast: parsed.value,
    inlineFingerConstants,
    fingerValues,
    backgroundHex,
    foregroundHex,
  };
  setDownloadEnabled(true);
  return { ok: true };
}

async function bootstrap() {
  await verifyCompressionSupport();

  setupMenuDropdown({
    menuButton,
    menuDropdown,
    onAction: (action) => {
      handleMenuAction(action).catch((error) => {
        console.warn('Failed to handle menu action.', error);
      });
    },
  });

  const decoded = await readFormulaFromQuery({
    onDecodeError: () => {
      showError('We could not decode the formula embedded in this link.');
    },
  });
  initialFormulaFromUrl = decoded;

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
      renderFromSource(current).catch(() => {});
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
      renderFromSource(current).catch(() => {});
    });
  });

  if (inlineFingersToggle) {
    inlineFingersToggle.addEventListener('change', () => {
      const current = inputEl ? inputEl.value : source;
      renderFromSource(current).catch(() => {});
    });
  }

  // Download.
  const downloadBtn = $('download-png');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      if (downloadInProgress || !canDownload) {
        return;
      }
      const canvas = $('formula-render');
      if (!canvas || typeof canvas.getContext !== 'function') return;
      downloadInProgress = true;
      downloadBtn.disabled = true;
      try {
        const renderState = lastRenderState;
        let sourceCanvas = canvas;
        let backgroundHex = readCanvasBackgroundHex();
        if (renderState?.ast) {
          backgroundHex = renderState.backgroundHex || backgroundHex;
          const offscreen = document.createElement('canvas');
          offscreen.width = canvas.width || 1;
          offscreen.height = canvas.height || 1;
          await renderFormulaToCanvas(renderState.ast, offscreen, {
            backgroundHex,
            foregroundHex: renderState.foregroundHex || readCanvasForegroundHex(),
            inlineFingerConstants: renderState.inlineFingerConstants,
            fingerValues: renderState.fingerValues,
            drawInsetBackground: false,
            dpr: 1,
          });
          sourceCanvas = offscreen;
        }
        const padding = Math.round(EXPORT_CROP_PADDING_PX * getCanvasPixelRatio(canvas));
        const bounds = findCanvasContentBounds(sourceCanvas, { backgroundHex });
        const cropped = bounds ? cropCanvasToBounds(sourceCanvas, bounds, padding) : null;
        const outputCanvas = cropped || sourceCanvas;
        const blob = await canvasToPngBlob(outputCanvas);
        downloadBlob(blob, 'formula.png');
      } catch (e) {
        console.warn('Failed to download canvas PNG.', e);
      } finally {
        downloadInProgress = false;
        downloadBtn.disabled = !canDownload;
      }
    });
  }

  await renderFromSource(source);

  // Live edit + render loop.
  if (inputEl) {
    inputEl.addEventListener('input', () => {
      const current = inputEl.value;
      renderFromSource(current).catch((err) => {
        console.error('Failed to render formula.', err);
        showError('Unable to render formula.');
      });
    });
  }
}

bootstrap().catch((err) => {
  console.error('Failed to bootstrap formula page', err);
  showError('Unable to load formula.');
});

