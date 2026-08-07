import { parseFormulaInput } from './arithmetic-parser.mjs';
import { formatCaretIndicator } from './parse-error-format.mjs';
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
  const SW_URL = './service-worker.js?sw=39.0';
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

function $(id) {
  return document.getElementById(id);
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

function readCanvasBackgroundHex() {
  const el = $('bghex');
  const parsed = normalizeHex8(el?.value);
  return parsed || DEFAULT_CANVAS_BG_HEX;
}

function setDownloadEnabled(enabled) {
  const btn = $('download-png');
  if (!btn) return;
  btn.disabled = !enabled;
}

function showError(message) {
  const errorEl = $('formula-error');
  if (!errorEl) return;
  if (message) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  } else {
    errorEl.textContent = '';
    errorEl.style.display = 'none';
  }
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
    showError(formatCaretIndicator(normalized, parsed));
    clearRender();
    return { ok: false };
  }

  showError(null);
  const renderEl = $('formula-render');
  await renderFormulaToCanvas(parsed.value, renderEl, {
    backgroundHex: readCanvasBackgroundHex(),
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

  const inputEl = $('formula-input');
  if (inputEl) {
    inputEl.value = source;
  }

  // Background controls.
  const bgEl = $('bghex');
  if (bgEl && !normalizeHex8(bgEl.value)) {
    bgEl.value = DEFAULT_CANVAS_BG_HEX;
  }
  if (bgEl) {
    bgEl.addEventListener('input', () => {
      // Re-render without touching the URL; just affects the raster background.
      const current = inputEl ? inputEl.value : source;
      renderFromSource(current, { updateUrl: false }).catch(() => {});
    });
  }
  document.querySelectorAll?.('button[data-bghex]')?.forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = normalizeHex8(btn.getAttribute('data-bghex')) || DEFAULT_CANVAS_BG_HEX;
      if (bgEl) bgEl.value = next;
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

