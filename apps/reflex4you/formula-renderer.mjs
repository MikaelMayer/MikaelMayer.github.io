// MathJax-based formula renderer (SVG output).
// Produces a LaTeX string from the Reflex4You AST and renders it via MathJax.tex2svg.

const DEFAULT_MATHJAX_LOAD_TIMEOUT_MS = 9000;

function precedence(node) {
  if (!node || typeof node !== 'object') return 100;
  switch (node.kind) {
    case 'SetBinding':
    case 'If':
      return 1;
    case 'LogicalOr':
      return 2;
    case 'LogicalAnd':
      return 3;
    case 'LessThan':
    case 'GreaterThan':
    case 'LessThanOrEqual':
    case 'GreaterThanOrEqual':
    case 'Equal':
      return 4;
    case 'Add':
    case 'Sub':
      return 5;
    case 'Mul':
    case 'Div':
      return 6;
    case 'Compose':
      return 7;
    case 'Pow':
    case 'ComposeMultiple':
      return 8;
    default:
      return 9;
  }
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return '?';
  const normalized = Object.is(value, -0) ? 0 : value;
  if (Number.isInteger(normalized)) return String(normalized);
  const rounded = Math.round(normalized * 1000) / 1000;
  return String(rounded).replace(/\.?0+$/, '');
}

function escapeLatexIdentifier(name) {
  return String(name || '?').replace(/_/g, '\\_');
}

function wrapParensLatex(latex) {
  return `\\left(${latex}\\right)`;
}

function maybeWrapLatex(node, latex, parentPrec, side, opKind) {
  const childPrec = precedence(node);
  if (childPrec < parentPrec) {
    return wrapParensLatex(latex);
  }
  if (side === 'right' && (opKind === 'Sub' || opKind === 'Div') && childPrec === parentPrec) {
    return wrapParensLatex(latex);
  }
  return latex;
}

function constToLatex(node) {
  const re = node.re;
  const im = node.im;
  if (!Number.isFinite(re) || !Number.isFinite(im)) return '?';
  if (im === 0) return formatNumber(re);
  const imagAbs = Math.abs(im);
  const imagCoeff = imagAbs === 1 ? '' : formatNumber(imagAbs);
  const imag = `${imagCoeff}${imagCoeff ? '\\,' : ''}i`;
  if (re === 0) {
    return im < 0 ? `-${imag}` : imag;
  }
  const sign = im >= 0 ? '+' : '-';
  return `${formatNumber(re)} ${sign} ${imag}`;
}

function fingerSlotToLatex(slot) {
  const label = String(slot || '?');
  const family = label[0] || '?';
  const idx = label.slice(1);
  if (!idx) {
    return `\\mathrm{${escapeLatexIdentifier(family)}}`;
  }
  return `\\mathrm{${escapeLatexIdentifier(family)}}_{${escapeLatexIdentifier(idx)}}`;
}

function functionCallLatex(name, args, options) {
  const renderedArgs = (args || []).map((arg) => nodeToLatex(arg, 0, options));
  const fn = String(name || '?');

  // Prefer native TeX operators for common functions.
  const operatorMap = {
    exp: '\\exp',
    sin: '\\sin',
    cos: '\\cos',
    tan: '\\tan',
    atan: '\\arctan',
    asin: '\\arcsin',
    acos: '\\arccos',
    ln: '\\ln',
  };

  if (fn === 'sqrt') {
    const value = renderedArgs[0] ?? '?';
    const branch = renderedArgs[1] ?? null;
    return branch ? `\\sqrt[${branch}]{${value}}` : `\\sqrt{${value}}`;
  }

  if (fn in operatorMap) {
    const op = operatorMap[fn];
    if (fn === 'ln' && args?.[1]) {
      // ln(z, k) is rendered as ln_k(z)
      const value = renderedArgs[0] ?? '?';
      const branch = renderedArgs[1] ?? '?';
      return `${op}_{${branch}}\\left(${value}\\right)`;
    }
    const value = renderedArgs[0] ?? '?';
    return `${op}\\left(${value}\\right)`;
  }

  // Generic function call.
  return `\\operatorname{${escapeLatexIdentifier(fn)}}\\left(${renderedArgs.join(', ')}\\right)`;
}

function nodeToLatex(node, parentPrec = 0, options = {}) {
  if (!node || typeof node !== 'object') return '?';

  if (node.__syntheticCall && typeof node.__syntheticCall.name === 'string') {
    return functionCallLatex(node.__syntheticCall.name, node.__syntheticCall.args, options);
  }

  switch (node.kind) {
    case 'Const':
      return constToLatex(node);
    case 'Var':
      return escapeLatexIdentifier(node.name || 'z');
    case 'VarX':
      return 'x';
    case 'VarY':
      return 'y';
    case 'Identifier':
    case 'SetRef':
      return escapeLatexIdentifier(node.name || '?');
    case 'FingerOffset':
      return fingerSlotToLatex(node.slot);

    case 'Pow': {
      const baseLatex = nodeToLatex(node.base, precedence(node), options);
      const baseWrapped = precedence(node.base) < precedence(node) ? wrapParensLatex(baseLatex) : baseLatex;
      return `${baseWrapped}^{${formatNumber(node.exponent)}}`;
    }

    case 'ComposeMultiple': {
      const baseLatex = nodeToLatex(node.base, precedence(node), options);
      const baseWrapped = precedence(node.base) < precedence(node) ? wrapParensLatex(baseLatex) : baseLatex;
      const count =
        typeof node.resolvedCount === 'number'
          ? formatNumber(node.resolvedCount)
          : node.countExpression
            ? nodeToLatex(node.countExpression, 0, options)
            : '?';
      return `${baseWrapped}^{\\circ ${count}}`;
    }

    case 'Exp':
      return `\\exp\\left(${nodeToLatex(node.value, 0, options)}\\right)`;
    case 'Sin':
      return `\\sin\\left(${nodeToLatex(node.value, 0, options)}\\right)`;
    case 'Cos':
      return `\\cos\\left(${nodeToLatex(node.value, 0, options)}\\right)`;
    case 'Tan':
      return `\\tan\\left(${nodeToLatex(node.value, 0, options)}\\right)`;
    case 'Atan':
      return `\\arctan\\left(${nodeToLatex(node.value, 0, options)}\\right)`;
    case 'Asin':
      return `\\arcsin\\left(${nodeToLatex(node.value, 0, options)}\\right)`;
    case 'Acos':
      return `\\arccos\\left(${nodeToLatex(node.value, 0, options)}\\right)`;
    case 'Ln': {
      const value = nodeToLatex(node.value, 0, options);
      if (node.branch) {
        const branch = nodeToLatex(node.branch, 0, options);
        return `\\ln_{${branch}}\\left(${value}\\right)`;
      }
      return `\\ln\\left(${value}\\right)`;
    }
    case 'Abs':
      return `\\left|${nodeToLatex(node.value, 0, options)}\\right|`;
    case 'Abs2':
      return `\\left|${nodeToLatex(node.value, 0, options)}\\right|^{2}`;
    case 'Floor':
      return `\\left\\lfloor${nodeToLatex(node.value, 0, options)}\\right\\rfloor`;
    case 'Conjugate':
      return `\\overline{${nodeToLatex(node.value, 0, options)}}`;

    case 'Add':
    case 'Sub':
    case 'Mul':
    case 'Div':
    case 'LessThan':
    case 'GreaterThan':
    case 'LessThanOrEqual':
    case 'GreaterThanOrEqual':
    case 'Equal':
    case 'LogicalAnd':
    case 'LogicalOr':
    case 'Compose': {
      const prec = precedence(node);
      const leftNode = node.left ?? node.f;
      const rightNode = node.right ?? node.g;
      const left = nodeToLatex(leftNode, prec, options);
      const right = nodeToLatex(rightNode, prec, options);

      const leftWrapped = maybeWrapLatex(leftNode, left, prec, 'left', node.kind);
      const rightWrapped = maybeWrapLatex(rightNode, right, prec, 'right', node.kind);

      switch (node.kind) {
        case 'Add': {
          const rendered = `${leftWrapped} + ${rightWrapped}`;
          return prec < parentPrec ? wrapParensLatex(rendered) : rendered;
        }
        case 'Sub': {
          const rendered = `${leftWrapped} - ${rightWrapped}`;
          return prec < parentPrec ? wrapParensLatex(rendered) : rendered;
        }
        case 'Mul': {
          const rendered = `${leftWrapped} \\cdot ${rightWrapped}`;
          return prec < parentPrec ? wrapParensLatex(rendered) : rendered;
        }
        case 'Div': {
          // Prefer fractions for readability; they behave as an "atomic" group in TeX.
          const rendered = `\\frac{${left}}{${right}}`;
          return prec < parentPrec ? wrapParensLatex(rendered) : rendered;
        }
        case 'LessThan': {
          const rendered = `${leftWrapped} < ${rightWrapped}`;
          return prec < parentPrec ? wrapParensLatex(rendered) : rendered;
        }
        case 'GreaterThan': {
          const rendered = `${leftWrapped} > ${rightWrapped}`;
          return prec < parentPrec ? wrapParensLatex(rendered) : rendered;
        }
        case 'LessThanOrEqual': {
          const rendered = `${leftWrapped} \\le ${rightWrapped}`;
          return prec < parentPrec ? wrapParensLatex(rendered) : rendered;
        }
        case 'GreaterThanOrEqual': {
          const rendered = `${leftWrapped} \\ge ${rightWrapped}`;
          return prec < parentPrec ? wrapParensLatex(rendered) : rendered;
        }
        case 'Equal': {
          const rendered = `${leftWrapped} = ${rightWrapped}`;
          return prec < parentPrec ? wrapParensLatex(rendered) : rendered;
        }
        case 'LogicalAnd': {
          const rendered = `${leftWrapped} \\land ${rightWrapped}`;
          return prec < parentPrec ? wrapParensLatex(rendered) : rendered;
        }
        case 'LogicalOr': {
          const rendered = `${leftWrapped} \\lor ${rightWrapped}`;
          return prec < parentPrec ? wrapParensLatex(rendered) : rendered;
        }
        case 'Compose': {
          const rendered = `${leftWrapped} \\circ ${rightWrapped}`;
          return prec < parentPrec ? wrapParensLatex(rendered) : rendered;
        }
        default:
          return '?';
      }
    }

    case 'If': {
      const cond = nodeToLatex(node.condition, 0, options);
      const thenBranch = nodeToLatex(node.thenBranch, 0, options);
      const elseBranch = nodeToLatex(node.elseBranch, 0, options);
      return `\\operatorname{if}\\left(${cond}, ${thenBranch}, ${elseBranch}\\right)`;
    }

    case 'SetBinding': {
      const name = escapeLatexIdentifier(node.name || '?');
      const value = nodeToLatex(node.value, 0, options);
      const body = nodeToLatex(node.body, 0, options);
      return `\\mathrm{set}\\;${name} = ${value}\\;\\mathrm{in}\\;${body}`;
    }

    default:
      return escapeLatexIdentifier(node.kind || '?');
  }
}

async function waitForMathJaxStartup(win, { timeoutMs = DEFAULT_MATHJAX_LOAD_TIMEOUT_MS } = {}) {
  const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
  while (Date.now() < deadline) {
    if (win?.MathJax?.startup?.promise) {
      await win.MathJax.startup.promise;
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  return Boolean(win?.MathJax?.tex2svg);
}

export async function renderFormulaToContainer(ast, container, options = {}) {
  if (!container) {
    return;
  }

  const latex = nodeToLatex(ast, 0, options);
  container.dataset.latex = latex;
  container.dataset.renderer = 'unknown';
  container.textContent = '';

  const win = typeof window !== 'undefined' ? window : null;
  const hasMathJax = Boolean(win?.MathJax);
  if (!hasMathJax) {
    container.dataset.renderer = 'fallback';
    container.textContent = latex;
    return;
  }

  const ready = await waitForMathJaxStartup(win);
  if (!ready || typeof win.MathJax?.tex2svg !== 'function') {
    container.dataset.renderer = 'fallback';
    container.textContent = latex;
    return;
  }

  // Render to SVG and attach.
  const mjxNode = win.MathJax.tex2svg(latex, { display: true });
  const svg = mjxNode?.querySelector?.('svg');
  if (svg) {
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  container.appendChild(mjxNode);
  container.dataset.renderer = 'mathjax';
}

