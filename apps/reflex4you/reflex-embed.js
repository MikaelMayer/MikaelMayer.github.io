import { ReflexCore, createDefaultFormulaAST } from './core-engine.mjs';
import { parseFormulaInput } from './arithmetic-parser.mjs';

const instanceMap = new WeakMap();
let autoBootstrapScheduled = false;

function formatCaretIndicator(source, failure) {
  const displaySource = source && source.length ? source : '(empty)';
  const origin = failure?.span?.input?.start ?? 0;
  const pointer = failure?.span ? failure.span.start - origin : 0;
  const clamped = Number.isFinite(pointer) ? Math.max(0, Math.min(pointer, displaySource.length)) : 0;
  const caretLine = `${' '.repeat(clamped)}^`;
  const message = failure?.message || 'Parse error';
  return `${displaySource}\n${caretLine}\n${message}`;
}

function createCanvasElement({ className } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = className || 'reflex-embed-canvas';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.touchAction = 'none';
  return canvas;
}

function ensureContainerSizing(element) {
  const style = window.getComputedStyle(element);
  if (style.position === 'static' && !element.style.position) {
    element.style.position = 'relative';
  }
  if (!style.backgroundColor || style.backgroundColor === 'rgba(0, 0, 0, 0)') {
    element.style.backgroundColor = element.style.backgroundColor || '#000';
  }
}

function attachErrorOverlay(element, message) {
  const overlay = document.createElement('pre');
  overlay.className = 'reflex-embed-error';
  overlay.textContent = message;
  overlay.style.position = 'absolute';
  overlay.style.inset = '8px';
  overlay.style.margin = '0';
  overlay.style.padding = '8px';
  overlay.style.borderRadius = '4px';
  overlay.style.background = 'rgba(0, 0, 0, 0.8)';
  overlay.style.color = '#f88';
  overlay.style.fontFamily = 'monospace';
  overlay.style.fontSize = '12px';
  overlay.style.overflow = 'auto';
  overlay.style.pointerEvents = 'none';
  overlay.style.whiteSpace = 'pre-wrap';
  element.appendChild(overlay);
  return overlay;
}

function parseFormulaOrFallback(source) {
  const parsed = parseFormulaInput(source);
  if (parsed.ok) {
    return { ast: parsed.value, error: null };
  }
  return {
    ast: createDefaultFormulaAST(),
    error: parsed,
  };
}

export function attachReflexToElement(element, options = {}) {
  if (!(element instanceof HTMLElement)) {
    throw new Error('attachReflexToElement expects an HTMLElement');
  }
  if (instanceMap.has(element)) {
    return instanceMap.get(element);
  }

  const {
    formula: explicitFormula,
    canvasClass,
    observeResize = true,
  } = options;

  const formulaSource = (explicitFormula ?? element.getAttribute('reflex-formula') ?? '').trim();
  const { ast, error } = parseFormulaOrFallback(formulaSource);

  ensureContainerSizing(element);
  const canvas = createCanvasElement({ className: canvasClass });
  element.appendChild(canvas);

  const reflexCore = new ReflexCore(canvas, ast);
  reflexCore.setActiveFingerMode({ mode: 'none', slots: [] });

  let resizeObserver = null;
  if (observeResize && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => reflexCore.render());
    resizeObserver.observe(element);
  }

  let errorOverlay = null;
  if (error) {
    const message = formatCaretIndicator(formulaSource, error);
    console.warn('Reflex embed falling back to default formula due to parse error:', error);
    errorOverlay = attachErrorOverlay(element, message);
  }

  let attributeObserver = null;
  let currentFormulaSource = formulaSource;
  let currentError = error;

  const applyFormulaSource = (nextSource) => {
    const normalized = (nextSource ?? '').trim();
    const { ast: nextAST, error: nextError } = parseFormulaOrFallback(normalized);
    currentFormulaSource = normalized;
    currentError = nextError;
    if (nextError) {
      const message = formatCaretIndicator(normalized, nextError);
      console.warn('Reflex embed falling back to default formula due to parse error:', nextError);
      if (!errorOverlay) {
        errorOverlay = attachErrorOverlay(element, message);
      } else {
        errorOverlay.textContent = message;
      }
    } else if (errorOverlay) {
      if (errorOverlay.isConnected) {
        errorOverlay.remove();
      }
      errorOverlay = null;
    }
    reflexCore.setFormulaAST(nextAST);
  };

  const refreshFromAttribute = () => {
    applyFormulaSource(element.getAttribute('reflex-formula') ?? '');
  };

  if (options.observeAttributes !== false && typeof MutationObserver !== 'undefined') {
    attributeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'reflex-formula') {
          refreshFromAttribute();
          break;
        }
      }
    });
    attributeObserver.observe(element, {
      attributes: true,
      attributeFilter: ['reflex-formula'],
    });
  }

  const instance = {
    element,
    canvas,
    core: reflexCore,
    resizeObserver,
    get formulaSource() {
      return currentFormulaSource;
    },
    get error() {
      return currentError;
    },
    refreshFromAttribute,
    updateFormulaSource: applyFormulaSource,
    destroy() {
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (attributeObserver) {
        attributeObserver.disconnect();
        attributeObserver = null;
      }
      reflexCore.releaseAllPointerAssignments();
      if (canvas.isConnected) {
        canvas.remove();
      }
      if (errorOverlay?.isConnected) {
        errorOverlay.remove();
      }
      instanceMap.delete(element);
    },
  };

  instanceMap.set(element, instance);
  return instance;
}

export function detachReflexFromElement(element) {
  const instance = instanceMap.get(element);
  if (!instance) {
    return false;
  }
  instance.destroy();
  return true;
}

export function bootstrapReflexEmbeds(options = {}) {
  if (typeof document === 'undefined') {
    return [];
  }
  const {
    selector = '[reflex-formula]',
  } = options;
  const targets = Array.from(document.querySelectorAll(selector));
  return targets.map((target) => {
    if (instanceMap.has(target)) {
      return instanceMap.get(target);
    }
    return attachReflexToElement(target, options);
  });
}

function scheduleAutoBootstrap() {
  if (autoBootstrapScheduled || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  autoBootstrapScheduled = true;
  const run = () => {
    try {
      if (window.ReflexEmbed?.bootstrap) {
        window.ReflexEmbed.bootstrap();
      }
    } catch (err) {
      console.error('ReflexEmbed auto-bootstrap failed', err);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else if (typeof queueMicrotask === 'function') {
    queueMicrotask(run);
  } else {
    Promise.resolve().then(run).catch(() => {});
  }
}

if (typeof window !== 'undefined') {
  window.ReflexEmbed = window.ReflexEmbed || {};
  window.ReflexEmbed.attach = attachReflexToElement;
  window.ReflexEmbed.detach = detachReflexFromElement;
  window.ReflexEmbed.bootstrap = bootstrapReflexEmbeds;
  window.dispatchEvent(new Event('reflex-embed-ready'));
  scheduleAutoBootstrap();
}
