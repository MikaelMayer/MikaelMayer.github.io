import {
  ParserInput,
  ParseSuccess,
  ParseFailure,
  ParseSeverity,
} from './parser-primitives.mjs';
import {
  createParser,
  regexMatch,
  optionalWhitespace,
} from './parser-combinators.mjs';
import {
  Const,
  Add,
  Sub,
  Mul,
  Div,
  Compose,
  VarZ,
  Offset,
  VarX,
  VarY,
} from './core-engine.mjs';

const numberToken = regexMatch(/[+-]?(?:\d+\.\d+|\d+|\.\d+)(?:[eE][+-]?\d+)?/y, {
  ctor: 'NumberToken',
  transform: (match) => ({
    text: match[0],
    value: Number(match[0]),
  }),
});

const whitespaceParser = optionalWhitespace();

function skipWhitespace(input) {
  return whitespaceParser.runNormalized(input).next;
}

function makeFailure(ctor, input, message, expected = null, severity = ParseSeverity.error) {
  return new ParseFailure({
    ctor,
    message,
    severity,
    expected,
    span: input.createSpan(0, 0),
  });
}

function annotateNode(node, startInput, endInput) {
  if (!node || !startInput || !endInput) {
    return null;
  }
  const consumed = startInput.length - endInput.length;
  if (consumed < 0) {
    return null;
  }
  const span = startInput.createSpan(0, consumed);
  node.span = span;
  node.input = span.input;
  return span;
}

function successWithNode(ctor, node, startInput, endInput, { attachSpan = true } = {}) {
  const consumed = startInput.length - endInput.length;
  const span = startInput.createSpan(0, consumed);
  if (attachSpan) {
    node.span = span;
    node.input = span.input;
  }
  return new ParseSuccess({
    ctor,
    value: node,
    span,
    next: endInput,
  });
}

const literalParser = createParser('Literal', (input) => {
  const start = skipWhitespace(input);
  const numeric = numberToken.runNormalized(start);
  if (numeric.ok) {
    let next = numeric.next;
    let real = numeric.value.value;
    let imag = 0;
    if (!next.isEmpty()) {
      const ch = next.peek();
      if (ch === 'i' || ch === 'I') {
        imag = real;
        real = 0;
        next = next.advance(1);
      }
    }
    const node = Const(real, imag);
    return successWithNode('Literal', node, start, next);
  }

  // Handle +i / -i / i shorthand
  let current = start;
  if (current.isEmpty()) {
    return makeFailure('Literal', start, 'Expected literal', 'literal', ParseSeverity.recoverable);
  }
  let sign = 1;
  const first = current.peek();
  if (first === '+' || first === '-') {
    sign = first === '-' ? -1 : 1;
    current = current.advance(1);
  }
  if (!current.isEmpty()) {
    const maybeI = current.peek();
    if (maybeI === 'i' || maybeI === 'I') {
      const node = Const(0, sign);
      const next = current.advance(1);
      return successWithNode('Literal', node, start, next);
    }
  }
  return makeFailure('Literal', start, 'Expected numeric or imaginary literal', 'literal', ParseSeverity.recoverable);
});

function readPrimitiveKeyword(input, keyword) {
  if (input.length < keyword.length) {
    return null;
  }
  for (let i = 0; i < keyword.length; i += 1) {
    if (input.buffer[input.start + i] !== keyword[i]) {
      return null;
    }
  }
  const next = input.advance(keyword.length);
  const nextChar = next.peek();
  if (nextChar && /[A-Za-z0-9_]/.test(nextChar)) {
    return null;
  }
  return next;
}

const primitiveParser = createParser('Primitive', (input) => {
  const start = skipWhitespace(input);
  if (start.isEmpty()) {
    return makeFailure('Primitive', start, 'Expected primitive', 'primitive', ParseSeverity.recoverable);
  }
  const ch = start.peek();
  if (ch === 'z') {
    const next = start.advance(1);
    const node = VarZ();
    return successWithNode('Primitive', node, start, next);
  }
  if (ch === 'x') {
    const next = start.advance(1);
    const node = VarX();
    return successWithNode('Primitive', node, start, next);
  }
  if (ch === 'y') {
    const next = start.advance(1);
    const node = VarY();
    return successWithNode('Primitive', node, start, next);
  }
  if (ch === 'F') {
    const next = readPrimitiveKeyword(start, 'F1');
    if (!next) {
      return makeFailure('Primitive', start, 'Expected F1', 'F1', ParseSeverity.recoverable);
    }
    const node = Offset();
    return successWithNode('Primitive', node, start, next);
  }
  return makeFailure('Primitive', start, 'Unknown primitive', 'primitive', ParseSeverity.recoverable);
});

function parseDelimitedExpressionSequence(input) {
  let current = skipWhitespace(input);
  if (current.isEmpty() || current.peek() !== '(') {
    return makeFailure('CompositionCall', current, 'Expected (" following o', '"("', ParseSeverity.error);
  }
  current = skipWhitespace(current.advance(1));
  const first = expressionParser.runNormalized(current);
  if (!first.ok) {
    return first;
  }
  current = skipWhitespace(first.next);
  if (current.isEmpty() || current.peek() !== ',') {
    return makeFailure('CompositionCall', current, 'Expected comma between arguments', '","', ParseSeverity.error);
  }
  current = skipWhitespace(current.advance(1));
  const second = expressionParser.runNormalized(current);
  if (!second.ok) {
    return second;
  }
  current = skipWhitespace(second.next);
  if (current.isEmpty() || current.peek() !== ')') {
    return makeFailure('CompositionCall', current, 'Expected ) after arguments', '")"', ParseSeverity.error);
  }
  const afterClose = current.advance(1);
  return {
    ok: true,
    next: afterClose,
    args: [first.value, second.value],
  };
}

const explicitComposeParser = createParser('ExplicitCompose', (input) => {
  const start = skipWhitespace(input);
  if (start.isEmpty() || start.peek() !== 'o') {
    return makeFailure('ExplicitCompose', start, 'Expected o(...)', 'o', ParseSeverity.recoverable);
  }
  const afterO = skipWhitespace(start.advance(1));
  const argsResult = parseDelimitedExpressionSequence(afterO);
  if (!argsResult.ok) {
    return argsResult;
  }
  const node = Compose(argsResult.args[0], argsResult.args[1]);
  return successWithNode('ExplicitCompose', node, start, argsResult.next);
});

const primaryParser = createParser('Primary', (input) => {
  const start = skipWhitespace(input);
  if (start.isEmpty()) {
    return makeFailure('Primary', start, 'Unexpected end of input', 'primary', ParseSeverity.error);
  }
  if (start.peek() === '(') {
    const afterOpen = skipWhitespace(start.advance(1));
    const inner = expressionParser.runNormalized(afterOpen);
    if (!inner.ok) {
      return inner;
    }
    const afterExpr = skipWhitespace(inner.next);
    if (afterExpr.isEmpty() || afterExpr.peek() !== ')') {
      return makeFailure('Primary', afterExpr, 'Expected ) to close group', '")"', ParseSeverity.error);
    }
    const next = afterExpr.advance(1);
    // keep inner node span as-is but return success for the grouped region
    return new ParseSuccess({
      ctor: 'Group',
      value: inner.value,
      span: start.createSpan(0, start.length - next.length),
      next,
    });
  }

  const explicit = explicitComposeParser.runNormalized(start);
  if (explicit.ok) {
    return explicit;
  }

  const literal = literalParser.runNormalized(start);
  if (literal.ok) {
    return literal;
  }

  return primitiveParser.runNormalized(start);
});

const unaryParser = createParser('Unary', (input) => {
  let start = skipWhitespace(input);
  if (!start.isEmpty() && start.peek() === '+') {
    const afterPlus = skipWhitespace(start.advance(1));
    return unaryParser.runNormalized(afterPlus);
  }
  if (!start.isEmpty() && start.peek() === '-') {
    const literalAttempt = literalParser.runNormalized(start);
    if (literalAttempt.ok) {
      return literalAttempt;
    }
    const afterMinus = skipWhitespace(start.advance(1));
    const operand = unaryParser.runNormalized(afterMinus);
    if (!operand.ok) {
      return operand;
    }
    const zeroNode = Const(0, 0);
    annotateNode(zeroNode, start, start);
    const node = Sub(zeroNode, operand.value);
    return successWithNode('UnaryNegate', node, start, operand.next);
  }
  return primaryParser.runNormalized(start);
});

function parseLeftAssociativeChain(childParser, operators, ctorName, input) {
  let current = childParser.runNormalized(input);
  if (!current.ok) {
    return current;
  }
  let node = current.value;
  let cursor = current.next;
  let consumed = false;

  while (true) {
    const afterWs = skipWhitespace(cursor);
    if (afterWs.isEmpty()) {
      break;
    }
    const symbol = operators.find((op) => afterWs.peek() === op.symbol);
    if (!symbol) {
      break;
    }
    consumed = true;
    let rhsInput = skipWhitespace(afterWs.advance(1));
    const rhs = childParser.runNormalized(rhsInput);
    if (!rhs.ok) {
      return rhs;
    }
    node = symbol.builder(node, rhs.value);
    annotateNode(node, input, rhs.next);
    cursor = rhs.next;
  }

  if (!consumed) {
    return current;
  }

  const span = input.createSpan(0, input.length - cursor.length);
  return new ParseSuccess({
    ctor: ctorName,
    value: node,
    span,
    next: cursor,
  });
}

const multiplicativeParser = createParser('MulDiv', (input) =>
  parseLeftAssociativeChain(unaryParser, [
    { symbol: '*', builder: (l, r) => Mul(l, r) },
    { symbol: '/', builder: (l, r) => Div(l, r) },
  ], 'MulDiv', skipWhitespace(input)),
);

const additiveParser = createParser('AddSub', (input) =>
  parseLeftAssociativeChain(multiplicativeParser, [
    { symbol: '+', builder: (l, r) => Add(l, r) },
    { symbol: '-', builder: (l, r) => Sub(l, r) },
  ], 'AddSub', skipWhitespace(input)),
);

const compositionChainParser = createParser('Composition', (input) => {
  const start = skipWhitespace(input);
  const head = additiveParser.runNormalized(start);
  if (!head.ok) {
    return head;
  }
  let node = head.value;
  let cursor = head.next;
  let consumed = false;

  while (true) {
    const afterWs = skipWhitespace(cursor);
    if (afterWs.isEmpty() || afterWs.peek() !== '$') {
      break;
    }
    consumed = true;
    let rhsInput = skipWhitespace(afterWs.advance(1));
    const rhs = additiveParser.runNormalized(rhsInput);
    if (!rhs.ok) {
      return rhs;
    }
    node = Compose(node, rhs.value);
    annotateNode(node, start, rhs.next);
    cursor = rhs.next;
  }

  if (!consumed) {
    return head;
  }

  const span = start.createSpan(0, start.length - cursor.length);
  return new ParseSuccess({
    ctor: 'Composition',
    value: node,
    span,
    next: cursor,
  });
});

const expressionParser = compositionChainParser;

export function parseFormulaInput(input) {
  const normalized = ParserInput.from(input ?? '');
  const start = skipWhitespace(normalized);
  if (start.isEmpty()) {
    return makeFailure('Expression', start, 'Formula cannot be empty', 'expression');
  }
  const parsed = expressionParser.runNormalized(start);
  if (!parsed.ok) {
    return parsed;
  }
  const rest = skipWhitespace(parsed.next);
  if (!rest.isEmpty()) {
    return makeFailure('TrailingInput', rest, 'Unexpected trailing characters', 'end of formula');
  }
  return parsed;
}

export function parseFormulaToAST(source) {
  const result = parseFormulaInput(source);
  if (!result.ok) {
    const err = new SyntaxError(result.message || 'Failed to parse formula');
    err.parseFailure = result;
    throw err;
  }
  return result.value;
}

export const __internal = {
  literalParser,
  primitiveParser,
  expressionParser,
};
