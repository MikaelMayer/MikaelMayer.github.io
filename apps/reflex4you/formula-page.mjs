import { parseFormulaInput } from './arithmetic-parser.mjs';
import { formatCaretIndicator } from './parse-error-format.mjs';
import { renderFormulaToContainer } from './formula-renderer.mjs';
import { verifyCompressionSupport, readFormulaFromQuery } from './formula-url.mjs';

// Ensure the PWA service worker is installed even when users land directly
// on the formula page (e.g. from a shared link).
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((error) => {
      console.warn('Reflex4You service worker registration failed.', error);
    });
  });
}

const DEFAULT_FORMULA_TEXT = 'z';

function $(id) {
  return document.getElementById(id);
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

async function bootstrap() {
  await verifyCompressionSupport();

  const decoded = await readFormulaFromQuery({
    onDecodeError: () => {
      showError('We could not decode the formula embedded in this link.');
    },
  });

  const source = (decoded && decoded.trim()) ? decoded : DEFAULT_FORMULA_TEXT;

  const sourceEl = $('formula-source');
  if (sourceEl) {
    sourceEl.textContent = source;
  }

  const parsed = parseFormulaInput(source);
  if (!parsed.ok) {
    showError(formatCaretIndicator(source, parsed));
    return;
  }

  showError(null);
  const renderEl = $('formula-render');
  await renderFormulaToContainer(parsed.value, renderEl);
}

bootstrap().catch((err) => {
  console.error('Failed to bootstrap formula page', err);
  showError('Unable to load formula.');
});

