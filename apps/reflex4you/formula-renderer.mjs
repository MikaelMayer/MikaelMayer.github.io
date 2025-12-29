// MathJax-based formula renderer (SVG output).
// Produces a LaTeX string from the Reflex4You AST and renders it via MathJax.tex2svg.

import { FINGER_DECIMAL_PLACES } from './core-engine.mjs';

// Bump this when changing renderer logic so users can verify cached assets.
export const FORMULA_RENDERER_BUILD_ID = 'reflex4you/formula-renderer build 2025-12-21.1';

const DEFAULT_MATHJAX_LOAD_TIMEOUT_MS = 9000;

function precedence(node) {
  if (!node || typeof node !== 'object') return 100;
  switch (node.kind) {
    case 'SetBinding':
    case 'If':
    case 'IfNaN':
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

function formatNumber(value, { decimalPlaces = FINGER_DECIMAL_PLACES, decimalSeparator = '.' } = {}) {
  if (!Number.isFinite(value)) return '?';
  const normalized = Object.is(value, -0) ? 0 : value;
  if (Number.isInteger(normalized)) return String(normalized);
  const places = Math.max(0, Math.min(12, Number(decimalPlaces) || 0));
  const factor = 10 ** places;
  const rounded = Math.round(normalized * factor) / factor;
  const fixed = rounded.toFixed(places).replace(/\.?0+$/, '');
  return decimalSeparator === '.'
    ? fixed
    : fixed.replace('.', decimalSeparator);
}

function escapeLatexIdentifier(name) {
  return String(name || '?').replace(/_/g, '\\_');
}

function identifierHighlights(node) {
  const highlights = node && typeof node === 'object' ? node.__identifierMeta?.highlights : null;
  return Array.isArray(highlights) ? highlights : [];
}

function escapeLatexTextChar(ch) {
  if (ch === '_') return '\\_';
  if (ch === '\\') return '\\textbackslash{}';
  if (ch === '{') return '\\{';
  if (ch === '}') return '\\}';
  return ch;
}

function renderTextWithHighlights(text, highlights) {
  const raw = String(text || '?');
  const list = Array.isArray(highlights) ? highlights : [];
  const byIndex = new Map();
  list.forEach((h) => {
    if (!h || typeof h.index !== 'number') return;
    byIndex.set(h.index, h.letter);
  });

  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const letter = byIndex.get(i);
    if (typeof letter === 'string' && letter.length) {
      out += `{\\Huge ${escapeLatexTextChar(letter[0].toUpperCase())}}`;
      continue;
    }
    out += escapeLatexTextChar(raw[i]);
  }
  return out;
}

function latexIdentifierWithMetadata(name, metaHighlights) {
  const highlights = Array.isArray(metaHighlights) ? metaHighlights : [];
  if (!highlights.length) {
    return escapeLatexIdentifier(name);
  }
  return renderTextWithHighlights(name, highlights);
}

function operatorNameWithMetadata(name, metaHighlights) {
  const inner = latexIdentifierWithMetadata(name, metaHighlights);
  return `\\operatorname{${inner}}`;
}

function isLatexAlreadyWrappedInParens(latex) {
  const t = String(latex || '').trim();
  // Common case produced by this renderer.
  if (t.startsWith('\\left(') && t.endsWith('\\right)')) {
    return true;
  }
  // Avoid double-wrapping if a plain parenthesis wrapper already exists.
  if (t.startsWith('(') && t.endsWith(')')) {
    return true;
  }
  return false;
}

function wrapParensLatex(latex) {
  if (isLatexAlreadyWrappedInParens(latex)) {
    return String(latex || '');
  }
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

function constToLatex(node, options = {}) {
  const re = node.re;
  const im = node.im;
  if (!Number.isFinite(re) || !Number.isFinite(im)) return '?';

  const compactComplex = options?.compactComplexNumbers !== false;

  if (im === 0) return formatNumber(re, options);
  const imagAbs = Math.abs(im);
  const imagCoeff = imagAbs === 1 ? '' : formatNumber(imagAbs, options);
  const imag = `${imagCoeff}${imagCoeff ? '\\,' : ''}i`;
  if (re === 0) {
    return im < 0 ? `-${imag}` : imag;
  }

  const sign = im >= 0 ? '+' : '-';
  const realLatex = formatNumber(re, options);
  if (!compactComplex) {
    return `${realLatex} ${sign} ${imag}`;
  }

  // Compact complex numbers to save horizontal space:
  // Render as "wrapped text" (not a 2-column matrix): top line ends with ±,
  // bottom line shows the imaginary term with i.
  // Example: ( 0.1234+ )
  //          ( 2.0000 i )
  return `\\left(\\substack{${realLatex}\\,${sign}\\\\${imag}}\\right)`;
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

function resolveFingerValue(slot, options = {}) {
  const map = options && typeof options === 'object' ? options.fingerValues : null;
  if (!map) return null;
  const key = String(slot || '');
  const v = map instanceof Map ? map.get(key) : map[key];
  if (!v) return null;
  const re = typeof v.re === 'number' ? v.re : (typeof v.x === 'number' ? v.x : null);
  const im = typeof v.im === 'number' ? v.im : (typeof v.y === 'number' ? v.y : null);
  if (!Number.isFinite(re) || !Number.isFinite(im)) return null;
  return { re, im };
}

function functionCallLatex(name, args, options, metaHighlights = null) {
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
  const opName =
    Array.isArray(metaHighlights) && metaHighlights.length
      ? operatorNameWithMetadata(fn, metaHighlights)
      : `\\operatorname{${escapeLatexIdentifier(fn)}}`;
  return `${opName}\\left(${renderedArgs.join(', ')}\\right)`;
}

function nodeToLatex(node, parentPrec = 0, options = {}) {
  if (!node || typeof node !== 'object') return '?';

  if (node.__syntheticCall && typeof node.__syntheticCall.name === 'string') {
    return functionCallLatex(
      node.__syntheticCall.name,
      node.__syntheticCall.args,
      options,
      identifierHighlights(node),
    );
  }

  switch (node.kind) {
    case 'Const':
      if (identifierHighlights(node).length && node.re === 0 && (node.im === 1 || node.im === -1)) {
        const letter = String(identifierHighlights(node)[0]?.letter || 'i')[0] || 'i';
        const rendered = `{\\Huge ${escapeLatexTextChar(letter.toUpperCase())}}`;
        return node.im < 0 ? `-${rendered}` : rendered;
      }
      return constToLatex(node, options);
    case 'Var':
      return latexIdentifierWithMetadata(node.name || 'z', identifierHighlights(node));
    case 'VarX':
      return latexIdentifierWithMetadata('x', identifierHighlights(node));
    case 'VarY':
      return latexIdentifierWithMetadata('y', identifierHighlights(node));
    case 'Identifier':
    case 'SetRef':
      return latexIdentifierWithMetadata(node.name || '?', identifierHighlights(node));
    case 'FingerOffset':
      if (options && options.inlineFingerConstants) {
        const resolved = resolveFingerValue(node.slot, options);
        if (resolved) {
          return constToLatex(resolved, options);
        }
      }
      return fingerSlotToLatex(node.slot);
    case 'DeviceOrientation':
      return latexIdentifierWithMetadata(node.axis || '?', identifierHighlights(node));

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
      return `${identifierHighlights(node).length ? operatorNameWithMetadata('exp', identifierHighlights(node)) : '\\exp'}\\left(${nodeToLatex(node.value, 0, options)}\\right)`;
    case 'Sin':
      return `${identifierHighlights(node).length ? operatorNameWithMetadata('sin', identifierHighlights(node)) : '\\sin'}\\left(${nodeToLatex(node.value, 0, options)}\\right)`;
    case 'Cos':
      return `${identifierHighlights(node).length ? operatorNameWithMetadata('cos', identifierHighlights(node)) : '\\cos'}\\left(${nodeToLatex(node.value, 0, options)}\\right)`;
    case 'Tan':
      return `${identifierHighlights(node).length ? operatorNameWithMetadata('tan', identifierHighlights(node)) : '\\tan'}\\left(${nodeToLatex(node.value, 0, options)}\\right)`;
    case 'Atan':
      return `${identifierHighlights(node).length ? operatorNameWithMetadata('atan', identifierHighlights(node)) : '\\arctan'}\\left(${nodeToLatex(node.value, 0, options)}\\right)`;
    case 'Asin':
      return `${identifierHighlights(node).length ? operatorNameWithMetadata('asin', identifierHighlights(node)) : '\\arcsin'}\\left(${nodeToLatex(node.value, 0, options)}\\right)`;
    case 'Acos':
      return `${identifierHighlights(node).length ? operatorNameWithMetadata('acos', identifierHighlights(node)) : '\\arccos'}\\left(${nodeToLatex(node.value, 0, options)}\\right)`;
    case 'Ln': {
      const value = nodeToLatex(node.value, 0, options);
      const op = identifierHighlights(node).length ? operatorNameWithMetadata('ln', identifierHighlights(node)) : '\\ln';
      if (node.branch) {
        const branch = nodeToLatex(node.branch, 0, options);
        return `${op}_{${branch}}\\left(${value}\\right)`;
      }
      return `${op}\\left(${value}\\right)`;
    }
    case 'Abs':
      return `\\left|${nodeToLatex(node.value, 0, options)}\\right|`;
    case 'Abs2':
      return `\\left|${nodeToLatex(node.value, 0, options)}\\right|^{2}`;
    case 'Floor':
      return `\\left\\lfloor${nodeToLatex(node.value, 0, options)}\\right\\rfloor`;
    case 'Conjugate':
      return `\\overline{${nodeToLatex(node.value, 0, options)}}`;
    case 'IsNaN':
      return functionCallLatex('isnan', [node.value], options, identifierHighlights(node));

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
          return `${leftWrapped} + ${rightWrapped}`;
        }
        case 'Sub': {
          return `${leftWrapped} - ${rightWrapped}`;
        }
        case 'Mul': {
          // Use a thin space instead of `\\cdot` for readability.
          return `${leftWrapped}\\,${rightWrapped}`;
        }
        case 'Div': {
          // Prefer fractions for readability; they behave as an "atomic" group in TeX.
          return `\\frac{${left}}{${right}}`;
        }
        case 'LessThan': {
          return `${leftWrapped} < ${rightWrapped}`;
        }
        case 'GreaterThan': {
          return `${leftWrapped} > ${rightWrapped}`;
        }
        case 'LessThanOrEqual': {
          return `${leftWrapped} \\le ${rightWrapped}`;
        }
        case 'GreaterThanOrEqual': {
          return `${leftWrapped} \\ge ${rightWrapped}`;
        }
        case 'Equal': {
          return `${leftWrapped} = ${rightWrapped}`;
        }
        case 'LogicalAnd': {
          return `${leftWrapped} \\land ${rightWrapped}`;
        }
        case 'LogicalOr': {
          return `${leftWrapped} \\lor ${rightWrapped}`;
        }
        case 'Compose': {
          const meta = identifierHighlights(node);
          const injected =
            meta.length
              ? `{\\Huge ${escapeLatexTextChar(String(meta[0]?.letter || 'o')[0].toUpperCase())}}\\,`
              : '';
          return `${injected}${leftWrapped} \\circ ${rightWrapped}`;
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

    case 'LetBinding': {
      // `let` should normally be top-level (rendered in program style),
      // but keep a readable fallback if it appears nested.
      const name = escapeLatexIdentifier(node.name || '?');
      const value = nodeToLatex(node.value, 0, options);
      const body = nodeToLatex(node.body, 0, options);
      return `\\left(\\begin{aligned}\\mathrm{let}\\;${name} &= ${value}\\\\&${body}\\end{aligned}\\right)`;
    }

    case 'SetBinding': {
      // Top-level formatting is handled in `formulaAstToLatex` (program-style layout).
      // Keep a readable inline fallback for nested occurrences.
      const name = escapeLatexIdentifier(node.name || '?');
      const value = nodeToLatex(node.value, 0, options);
      const body = nodeToLatex(node.body, 0, options);
      return `\\left(\\begin{aligned}\\mathrm{set}\\;${name} &= ${value}\\\\&${body}\\end{aligned}\\right)`;
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

function programStyleLatex(ast, options = {}) {
  const bindings = [];
  let cursor = ast;
  while (cursor && typeof cursor === 'object' && (cursor.kind === 'LetBinding' || cursor.kind === 'SetBinding')) {
    bindings.push(cursor);
    cursor = cursor.body;
  }
  if (!bindings.length) {
    return nodeToLatex(ast, 0, options);
  }
  const lines = [];
  lines.push('\\begin{aligned}');
  for (const binding of bindings) {
    const kw = binding.kind === 'LetBinding' ? '\\mathrm{let}' : '\\mathrm{set}';
    const name = escapeLatexIdentifier(binding.name || '?');
    const value = nodeToLatex(binding.value, 0, options);
    lines.push(`${kw}\\;${name} &= ${value}\\\\`);
  }
  lines.push(`&${nodeToLatex(cursor, 0, options)}`);
  lines.push('\\end{aligned}');
  return lines.join('');
}

export function formulaAstToLatex(ast, options = {}) {
  return programStyleLatex(ast, options);
}

function parseHex8Color(value) {
  const raw = String(value || '').trim().replace(/^#/, '');
  if (raw.length !== 8 && raw.length !== 6) {
    return null;
  }
  const hex = raw.length === 6 ? `${raw}ff` : raw;
  if (!/^[0-9a-fA-F]{8}$/.test(hex)) {
    return null;
  }
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const a = Number.parseInt(hex.slice(6, 8), 16) / 255;
  return { r, g, b, a };
}

function resolveCanvasBackground(options = {}) {
  const candidate = options.backgroundHex ?? options.background ?? options.canvasBackground ?? null;
  return parseHex8Color(candidate) ?? parseHex8Color('ffffff80');
}

function resizeCanvasToDisplaySize(canvas, options = {}) {
  const forced = options && typeof options === 'object' ? options.dpr : null;
  const dpr = (Number.isFinite(forced) && forced > 0 ? forced : ((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1));
  const cssWidth = canvas?.clientWidth || canvas?.width || 0;
  const cssHeight = canvas?.clientHeight || canvas?.height || 0;
  const w = Math.max(1, Math.floor(cssWidth * dpr));
  const h = Math.max(1, Math.floor(cssHeight * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  return { width: w, height: h, dpr };
}

function getSvgViewBoxSize(svgEl) {
  const viewBox = svgEl?.getAttribute?.('viewBox') || '';
  const parts = viewBox.split(/[ ,]+/).map((x) => Number(x)).filter((x) => Number.isFinite(x));
  if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
    return { width: parts[2], height: parts[3] };
  }
  const wAttr = svgEl?.getAttribute?.('width') || '';
  const hAttr = svgEl?.getAttribute?.('height') || '';
  const w = Number(String(wAttr).replace(/[^0-9.]/g, ''));
  const h = Number(String(hAttr).replace(/[^0-9.]/g, ''));
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return { width: w, height: h };
  }
  return null;
}

export async function renderLatexToCanvas(latex, canvas, options = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return;

  const bg = resolveCanvasBackground(options);
  const drawInsetBackground = options?.drawInsetBackground !== false;
  const win = typeof window !== 'undefined' ? window : null;
  const ready = await waitForMathJaxStartup(win);
  if (!ready || typeof win.MathJax?.tex2svg !== 'function') {
    const { width, height } = resizeCanvasToDisplaySize(canvas, options);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = `rgba(${bg.r},${bg.g},${bg.b},${bg.a})`;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '16px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    ctx.fillText(String(latex || ''), 16, 28);
    return;
  }

  const mjxNode = win.MathJax.tex2svg(String(latex || ''), { display: true });
  const svg = mjxNode?.querySelector?.('svg');
  if (!svg) {
    return;
  }
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // Ensure a deterministic color when rasterizing the SVG.
  svg.setAttribute('style', `${svg.getAttribute('style') || ''};color:#000;`);

  const serializer = new XMLSerializer();
  const svgText = serializer.serializeToString(svg);
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const img = new Image();
    img.decoding = 'async';
    const loaded = new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(e);
    });
    img.src = url;
    await loaded;

    const { width, height } = resizeCanvasToDisplaySize(canvas, options);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = `rgba(${bg.r},${bg.g},${bg.b},${bg.a})`;
    ctx.fillRect(0, 0, width, height);

    const size = getSvgViewBoxSize(svg) || { width: img.width || 1, height: img.height || 1 };
    const pad = 24;
    const maxW = Math.max(1, width - pad * 2);
    const maxH = Math.max(1, height - pad * 2);
    const scale = Math.min(maxW / size.width, maxH / size.height);
    const drawW = size.width * scale;
    const drawH = size.height * scale;
    const dx = (width - drawW) / 2;
    const dy = (height - drawH) / 2;

    if (drawInsetBackground) {
      // Slight translucent white behind the formula (useful for preview pages).
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(Math.max(0, dx - 10), Math.max(0, dy - 10), Math.min(width, drawW + 20), Math.min(height, drawH + 20));
    }

    // Ensure the SVG is drawn solid on top.
    ctx.globalAlpha = 1;
    ctx.drawImage(img, dx, dy, drawW, drawH);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function renderFormulaToContainer(ast, container, options = {}) {
  if (!container) {
    return;
  }

  const latex = formulaAstToLatex(ast, options);
  container.dataset.latex = latex;
  container.dataset.renderer = 'unknown';
  container.dataset.rendererBuildId = FORMULA_RENDERER_BUILD_ID;
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

export async function renderFormulaToCanvas(ast, canvas, options = {}) {
  if (!canvas) return;
  const latex = formulaAstToLatex(ast, options);
  canvas.dataset.latex = latex;
  canvas.dataset.renderer = 'canvas';
  canvas.dataset.rendererBuildId = FORMULA_RENDERER_BUILD_ID;
  await renderLatexToCanvas(latex, canvas, options);
}

