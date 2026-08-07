import { parseFormulaInput } from './arithmetic-parser.mjs';
import { formatCaretIndicator, getCaretSelection } from './parse-error-format.mjs';
import { compileFormulaForGpu } from './core-engine.mjs';

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

self.onmessage = (event) => {
  const payload = event?.data || {};
  const id = payload.id;
  const source = String(payload.source || '');
  const fingerValues = payload.fingerValues && typeof payload.fingerValues === 'object' ? payload.fingerValues : {};

  let parseMs = null;
  let compileMs = null;
  try {
    const parseStart = nowMs();
    const result = parseFormulaInput(source, { fingerValues });
    parseMs = nowMs() - parseStart;
    if (!result.ok) {
      const caretSelection = getCaretSelection(source, result);
      self.postMessage({
        id,
        ok: false,
        caretMessage: formatCaretIndicator(source, result),
        caretSelection,
        timings: { workerParseMs: parseMs },
      });
      return;
    }

    const ast = result.value;
    const compileStart = nowMs();
    const compiled = compileFormulaForGpu(ast);
    compileMs = nowMs() - compileStart;
    self.postMessage({
      id,
      ok: true,
      fragmentSource: compiled.fragmentSource,
      uniformCounts: compiled.uniformCounts,
      timings: {
        workerParseMs: parseMs,
        workerCompileMs: compileMs,
      },
      stats: {
        fragmentChars: compiled.fragmentSource?.length ?? 0,
      },
    });
  } catch (error) {
    const message =
      error && typeof error.message === 'string'
        ? error.message
        : String(error || 'Unknown error');
    self.postMessage({
      id,
      ok: false,
      caretMessage: `Compilation error:\n${message}`,
      timings: {
        workerParseMs: parseMs,
        workerCompileMs: compileMs,
      },
    });
  }
};

