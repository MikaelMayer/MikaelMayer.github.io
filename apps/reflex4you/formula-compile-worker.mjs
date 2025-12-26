import { parseFormulaInput } from './arithmetic-parser.mjs';
import { formatCaretIndicator } from './parse-error-format.mjs';
import { compileFormulaForGpu } from './core-engine.mjs';

self.onmessage = (event) => {
  const payload = event?.data || {};
  const id = payload.id;
  const source = String(payload.source || '');
  const fingerValues = payload.fingerValues && typeof payload.fingerValues === 'object' ? payload.fingerValues : {};

  try {
    const result = parseFormulaInput(source, { fingerValues });
    if (!result.ok) {
      self.postMessage({
        id,
        ok: false,
        caretMessage: formatCaretIndicator(source, result),
      });
      return;
    }

    const ast = result.value;
    const compiled = compileFormulaForGpu(ast);
    self.postMessage({
      id,
      ok: true,
      ast,
      gpuAst: compiled.gpuAst,
      fragmentSource: compiled.fragmentSource,
      uniformCounts: compiled.uniformCounts,
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
    });
  }
};

