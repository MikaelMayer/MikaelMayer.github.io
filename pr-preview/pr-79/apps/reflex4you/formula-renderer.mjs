function span(className, text) {
  const el = document.createElement('span');
  if (className) {
    el.className = className;
  }
  if (text != null) {
    el.textContent = text;
  }
  return el;
}

function joinInline(parts) {
  const el = document.createElement('span');
  el.className = 'rf-inline';
  parts.forEach((part) => {
    if (part == null) return;
    if (typeof part === 'string') {
      el.appendChild(document.createTextNode(part));
    } else {
      el.appendChild(part);
    }
  });
  return el;
}

function needsParens(node) {
  return (
    node &&
    typeof node === 'object' &&
    (node.kind === 'Add' ||
      node.kind === 'Sub' ||
      node.kind === 'Mul' ||
      node.kind === 'Div' ||
      node.kind === 'Compose' ||
      node.kind === 'Pow' ||
      node.kind === 'LessThan' ||
      node.kind === 'GreaterThan' ||
      node.kind === 'LessThanOrEqual' ||
      node.kind === 'GreaterThanOrEqual' ||
      node.kind === 'Equal' ||
      node.kind === 'LogicalAnd' ||
      node.kind === 'LogicalOr')
  );
}

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

function renderConst(node) {
  const re = node.re;
  const im = node.im;
  if (!Number.isFinite(re) || !Number.isFinite(im)) {
    return span('rf-atom', '?');
  }
  if (im === 0) {
    return span('rf-atom', formatNumber(re));
  }
  const imagAbs = Math.abs(im);
  const imagPart = imagAbs === 1 ? '' : formatNumber(imagAbs);
  if (re === 0) {
    const sign = im < 0 ? '-' : '';
    return joinInline([
      span('rf-atom', `${sign}${imagPart}`),
      span('rf-italic', 'i'),
    ]);
  }
  const sign = im >= 0 ? '+' : '−';
  return joinInline([
    span('rf-atom', formatNumber(re)),
    span('rf-op', ` ${sign} `),
    span('rf-atom', imagPart),
    span('rf-italic', 'i'),
  ]);
}

function wrapParens(content) {
  return joinInline([span('rf-paren', '('), content, span('rf-paren', ')')]);
}

function maybeWrap(node, rendered, parentPrec, side, opKind) {
  const childPrec = precedence(node);
  if (childPrec < parentPrec) {
    return wrapParens(rendered);
  }
  if (side === 'right' && (opKind === 'Sub' || opKind === 'Div') && childPrec === parentPrec) {
    return wrapParens(rendered);
  }
  return rendered;
}

function renderFunctionCall(name, arg, options) {
  const nameEl = span('rf-fn', name);
  const argEl = renderNode(arg, 0, options);
  return joinInline([nameEl, span('rf-paren', '('), argEl, span('rf-paren', ')')]);
}

function renderFunctionCallWithArgs(name, args, options) {
  const nameEl = span('rf-fn', name);
  const renderedArgs = (args || []).map((arg) => renderNode(arg, 0, options));
  const parts = [nameEl, span('rf-paren', '(')];
  renderedArgs.forEach((argEl, idx) => {
    if (idx > 0) {
      parts.push(span('rf-op', ', '));
    }
    parts.push(argEl);
  });
  parts.push(span('rf-paren', ')'));
  return joinInline(parts);
}

function renderSqrtCall(args, options) {
  const valueNode = args?.[0];
  const branchNode = args?.[1] ?? null;
  const valueRendered = valueNode ? renderNode(valueNode, 0, options) : span('rf-atom', '?');
  const radicand = valueNode && needsParens(valueNode) ? wrapParens(valueRendered) : valueRendered;

  const sqrtEl = document.createElement('span');
  sqrtEl.className = 'rf-sqrt';

  const symbol = document.createElement('span');
  symbol.className = 'rf-sqrt-symbol';
  symbol.textContent = '√';

  if (branchNode) {
    const idx = document.createElement('span');
    idx.className = 'rf-sqrt-index';
    idx.appendChild(renderNode(branchNode, 0, options));
    symbol.appendChild(idx);
  }

  const rad = document.createElement('span');
  rad.className = 'rf-sqrt-radicand';
  rad.appendChild(radicand);

  sqrtEl.appendChild(symbol);
  sqrtEl.appendChild(rad);
  return sqrtEl;
}

function fingerLabelToPretty(slot) {
  const family = slot?.[0] ?? '';
  const idx = slot?.slice(1) ?? '';
  const sub = idx.replace(/1/g, '₁').replace(/2/g, '₂').replace(/3/g, '₃');
  return `${family}${sub}`;
}

function renderNode(node, parentPrec = 0, options = {}) {
  if (!node || typeof node !== 'object') {
    return span('rf-atom', '?');
  }

  if (node.__syntheticCall && typeof node.__syntheticCall.name === 'string') {
    const call = node.__syntheticCall;
    if (call.name === 'sqrt') {
      return renderSqrtCall(call.args, options);
    }
    return renderFunctionCallWithArgs(call.name, call.args, options);
  }

  switch (node.kind) {
    case 'Const':
      return renderConst(node);
    case 'Var':
      return span('rf-italic', node.name || 'z');
    case 'VarX':
      return span('rf-italic', 'x');
    case 'VarY':
      return span('rf-italic', 'y');
    case 'Identifier':
    case 'SetRef':
      return span('rf-italic', node.name || '?');
    case 'FingerOffset':
      return span('rf-finger', fingerLabelToPretty(node.slot));

    case 'Pow': {
      const base = renderNode(node.base, precedence(node), options);
      const baseWrapped = needsParens(node.base) ? wrapParens(base) : base;
      const exp = span('rf-sup', formatNumber(node.exponent));
      return joinInline([baseWrapped, exp]);
    }

    case 'ComposeMultiple': {
      const base = renderNode(node.base, precedence(node), options);
      const baseWrapped = needsParens(node.base) ? wrapParens(base) : base;
      const count =
        typeof node.resolvedCount === 'number'
          ? formatNumber(node.resolvedCount)
          : node.countExpression
            ? '?'
            : '?';
      const sup = joinInline([span('rf-sup', `∘${count}`)]);
      return joinInline([baseWrapped, sup]);
    }

    case 'Exp':
      return renderFunctionCall('exp', node.value, options);
    case 'Sin':
      return renderFunctionCall('sin', node.value, options);
    case 'Cos':
      return renderFunctionCall('cos', node.value, options);
    case 'Tan':
      return renderFunctionCall('tan', node.value, options);
    case 'Atan':
      return renderFunctionCall('atan', node.value, options);
    case 'Asin':
      return renderFunctionCall('asin', node.value, options);
    case 'Acos':
      return renderFunctionCall('acos', node.value, options);
    case 'Ln': {
      const ln = span('rf-fn', 'ln');
      if (node.branch) {
        const subEl = span('rf-sub', null);
        subEl.appendChild(renderNode(node.branch, 0, options));
        const wrap = joinInline([ln, subEl]);
        return joinInline([
          wrap,
          span('rf-paren', '('),
          renderNode(node.value, 0, options),
          span('rf-paren', ')'),
        ]);
      }
      return renderFunctionCall('ln', node.value, options);
    }
    case 'Abs': {
      const inner = renderNode(node.value, 0, options);
      return joinInline([span('rf-delim', '|'), inner, span('rf-delim', '|')]);
    }
    case 'Abs2': {
      const abs = joinInline([span('rf-delim', '|'), renderNode(node.value, 0, options), span('rf-delim', '|')]);
      return joinInline([abs, span('rf-sup', '2')]);
    }
    case 'Floor': {
      const inner = renderNode(node.value, 0, options);
      return joinInline([span('rf-delim', '⌊'), inner, span('rf-delim', '⌋')]);
    }
    case 'Conjugate': {
      const inner = renderNode(node.value, 0, options);
      const over = span('rf-overline', null);
      over.appendChild(inner);
      return over;
    }

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
      const left = renderNode(node.left ?? node.f, prec, options);
      const right = renderNode(node.right ?? node.g, prec, options);

      const leftNode = node.left ?? node.f;
      const rightNode = node.right ?? node.g;

      let op = '?';
      switch (node.kind) {
        case 'Add':
          op = '+';
          break;
        case 'Sub':
          op = '−';
          break;
        case 'Mul':
          op = '·';
          break;
        case 'Div':
          op = '/';
          break;
        case 'LessThan':
          op = '<';
          break;
        case 'GreaterThan':
          op = '>';
          break;
        case 'LessThanOrEqual':
          op = '≤';
          break;
        case 'GreaterThanOrEqual':
          op = '≥';
          break;
        case 'Equal':
          op = '=';
          break;
        case 'LogicalAnd':
          op = '∧';
          break;
        case 'LogicalOr':
          op = '∨';
          break;
        case 'Compose':
          op = '∘';
          break;
        default:
          op = '?';
          break;
      }

      const leftWrapped = maybeWrap(leftNode, left, prec, 'left', node.kind);
      const rightWrapped = maybeWrap(rightNode, right, prec, 'right', node.kind);
      const rendered = joinInline([leftWrapped, span('rf-op', ` ${op} `), rightWrapped]);
      return prec < parentPrec ? wrapParens(rendered) : rendered;
    }

    case 'If': {
      const kw = span('rf-keyword', 'if');
      return joinInline([
        kw,
        span('rf-paren', '('),
        renderNode(node.condition, 0, options),
        span('rf-op', ', '),
        renderNode(node.thenBranch, 0, options),
        span('rf-op', ', '),
        renderNode(node.elseBranch, 0, options),
        span('rf-paren', ')'),
      ]);
    }

    case 'SetBinding': {
      const kwSet = span('rf-keyword', 'set');
      const kwIn = span('rf-keyword', 'in');
      const name = span('rf-italic', node.name || '?');
      return joinInline([
        kwSet,
        ' ',
        name,
        span('rf-op', ' = '),
        renderNode(node.value, 0, options),
        ' ',
        kwIn,
        ' ',
        renderNode(node.body, 0, options),
      ]);
    }

    default:
      return span('rf-atom', node.kind || '?');
  }
}

export function renderFormulaToContainer(ast, container, options = {}) {
  if (!container) {
    return;
  }
  container.textContent = '';
  const node = renderNode(ast, 0, options);
  node.classList.add('rf-root');
  container.appendChild(node);
}

