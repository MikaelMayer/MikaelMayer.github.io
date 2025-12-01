import {
  ParserInput,
  ParseSuccess,
  ParseFailure,
  ParseSeverity,
} from './parser-primitives.mjs';
import {
  createParser,
  Literal,
  Regex,
  Sequence,
  Optional,
  Choice,
  lazy,
  WS,
} from './parser-combinators.mjs';
import {
  Const,
  Add,
  Sub,
  Mul,
  Div,
  Compose,
  VarX,
  VarY,
  VarZ,
  Offset,
} from './core-engine.mjs';

const IDENTIFIER_CHAR = /[A-Za-z0-9_]/;
const NUMBER_REGEX = /[+-]?(?:\d+\.\d+|\d+|\.\d+)(?:[eE][+-]?\d+)?/y;

function withSpan(node, span) {
  return { ...node, span, input: span.input };
}

function wsLiteral(text, options = {}) {
  const wsCtor = options.wsCtor ?? `WS:${text}`;
  return WS({ ctor: wsCtor })._i(Literal(text, options), { ctor: `wsLiteral(${text})` });
}

function wsRegex(regex, options = {}) {
  const wsCtor = options.wsCtor ?? 'WS:regex';
  const literalCtor = options.ctor ?? 'RegexToken';
  return WS({ ctor: wsCtor })._i(
    Regex(regex, { ...options, ctor: literalCtor }),
    { ctor: `${literalCtor}:withWS` },
  );
}

function keywordLiteral(text, options = {}) {
  const literal = wsLiteral(text, options);
  return createParser(`Keyword(${text})`, (input) => {
    const result = literal.runNormalized(input);
    if (!result.ok) {
      return result;
    }
    const nextChar = result.next.peek();
    if (nextChar && IDENTIFIER_CHAR.test(nextChar)) {
      return new ParseFailure({
        ctor: `Keyword(${text})`,
        message: `Expected ${text}`,
        severity: ParseSeverity.recoverable,
        expected: text,
        span: result.span,
        input: result.span.input,
      });
    }
    return new ParseSuccess({
      ctor: `Keyword(${text})`,
      value: result.value,
      span: result.span,
      next: result.next,
    });
  });
}

const numberToken = wsRegex(NUMBER_REGEX, {
  ctor: 'NumberToken',
  transform: (match) => Number(match[0]),
});

const imagUnit = wsLiteral('i', { ctor: 'ImagUnit', caseSensitive: false });

const signParser = Choice([
  wsLiteral('+', { ctor: 'PlusSign' }).Map(() => 1),
  wsLiteral('-', { ctor: 'MinusSign' }).Map(() => -1),
], { ctor: 'Sign' });

const optionalSign = signParser.Optional(1, { ctor: 'OptionalSign' });

const numberLiteral = numberToken.Map((value, result) => withSpan(Const(value, 0), result.span));

const imagFromNumber = numberToken.i_(imagUnit, { ctor: 'NumericImag' })
  .Map((magnitude, result) => withSpan(Const(0, magnitude), result.span));

const unitImagLiteral = optionalSign.i_(imagUnit, { ctor: 'UnitImag' })
  .Map((sign, result) => withSpan(Const(0, sign), result.span));

const literalParser = Choice([
  imagFromNumber,
  unitImagLiteral,
  numberLiteral,
], { ctor: 'Literal' });

const primitiveParser = Choice([
  keywordLiteral('x', { ctor: 'VarX' }).Map((_, result) => withSpan(VarX(), result.span)),
  keywordLiteral('y', { ctor: 'VarY' }).Map((_, result) => withSpan(VarY(), result.span)),
  keywordLiteral('z', { ctor: 'VarZ' }).Map((_, result) => withSpan(VarZ(), result.span)),
  keywordLiteral('F1', { ctor: 'Offset' }).Map((_, result) => withSpan(Offset(), result.span)),
], { ctor: 'Primitive' });

let expressionParser;
const expressionRef = lazy(() => expressionParser, { ctor: 'ExpressionRef' });

const groupedParser = Sequence([
  wsLiteral('(', { ctor: 'GroupOpen' }),
  expressionRef,
  wsLiteral(')', { ctor: 'GroupClose' }),
], {
  ctor: 'Group',
  projector: (values) => values[1],
}).Map((expr, result) => withSpan(expr, result.span));

const explicitComposeParser = Sequence([
  wsLiteral('o', { ctor: 'ComposeKeyword' }),
  wsLiteral('(', { ctor: 'ComposeOpen' }),
  expressionRef,
  wsLiteral(',', { ctor: 'ComposeComma' }),
  expressionRef,
  wsLiteral(')', { ctor: 'ComposeClose' }),
], {
  ctor: 'ExplicitCompose',
  projector: (values) => ({ first: values[2], second: values[4] }),
}).Map(({ first, second }, result) => withSpan(Compose(first, second), result.span));

const primaryParser = Choice([
  explicitComposeParser,
  groupedParser,
  literalParser,
  primitiveParser,
], { ctor: 'Primary' });

let unaryParser;
const unaryRef = lazy(() => unaryParser, { ctor: 'UnaryRef' });

const unaryNegative = Sequence([
  wsLiteral('-', { ctor: 'UnaryMinusSymbol' }),
  unaryRef,
], {
  ctor: 'UnaryMinusSeq',
  projector: (values) => values[1],
}).Map((expr, result) => {
  const zero = withSpan(Const(0, 0), result.span);
  return withSpan(Sub(zero, expr), result.span);
});

const unaryPositive = Sequence([
  wsLiteral('+', { ctor: 'UnaryPlusSymbol' }),
  unaryRef,
], {
  ctor: 'UnaryPlusSeq',
  projector: (values) => values[1],
}).Map((expr, result) => withSpan(expr, result.span));

unaryParser = Choice([
  primaryParser,
  unaryNegative,
  unaryPositive,
], { ctor: 'Unary' });

function leftAssociative(termParser, operatorParser, ctor) {
  const maybeOperator = operatorParser.Optional(null, { ctor: `${ctor}:maybeOp` });
  return createParser(ctor, (input) => {
    const head = termParser.runNormalized(input);
    if (!head.ok) {
      return head;
    }
    let node = head.value;
    let cursor = head.next;
    while (true) {
      const opResult = maybeOperator.runNormalized(cursor);
      if (!opResult.ok) {
        return opResult;
      }
      if (opResult.value === null) {
        break;
      }
      const rhs = termParser.runNormalized(opResult.next);
      if (!rhs.ok) {
        return rhs;
      }
      const span = spanBetween(input, rhs.next);
      node = withSpan(opResult.value(node, rhs.value), span);
      cursor = rhs.next;
    }
    const span = spanBetween(input, cursor);
    return new ParseSuccess({ ctor, value: node, span, next: cursor });
  });
}

function spanBetween(startInput, endInput) {
  return startInput.createSpan(0, startInput.length - endInput.length);
}

const multiplicativeOperators = Choice([
  wsLiteral('*', { ctor: 'MulOp' }).Map(() => (left, right) => Mul(left, right)),
  wsLiteral('/', { ctor: 'DivOp' }).Map(() => (left, right) => Div(left, right)),
], { ctor: 'MulOpChoice' });

const additiveOperators = Choice([
  wsLiteral('+', { ctor: 'AddOp' }).Map(() => (left, right) => Add(left, right)),
  wsLiteral('-', { ctor: 'SubOp' }).Map(() => (left, right) => Sub(left, right)),
], { ctor: 'AddOpChoice' });

const composeOperator = wsLiteral('$', { ctor: 'ComposeOp' }).Map(() => (left, right) => Compose(left, right));

const multiplicativeParser = leftAssociative(unaryParser, multiplicativeOperators, 'MulDiv');
const additiveParser = leftAssociative(multiplicativeParser, additiveOperators, 'AddSub');
const compositionChainParser = leftAssociative(additiveParser, composeOperator, 'Composition');

expressionParser = compositionChainParser;

export function parseFormulaInput(input) {
  const normalized = ParserInput.from(input ?? '');
  if (normalized.toString().trim().length === 0) {
    return new ParseFailure({
      ctor: 'Expression',
      message: 'Formula cannot be empty',
      severity: ParseSeverity.error,
      span: normalized.createSpan(0, 0),
      input: normalized,
    });
  }
  const parsed = expressionParser.runNormalized(normalized);
  if (!parsed.ok) {
    return parsed;
  }
  const trailing = WS({ ctor: 'TrailingWS' }).runNormalized(parsed.next);
  const remainder = trailing.next;
  if (!remainder.isEmpty()) {
    return new ParseFailure({
      ctor: 'TrailingInput',
      message: 'Unexpected trailing characters',
      severity: ParseSeverity.error,
      expected: 'end of formula',
      span: remainder.createSpan(0, Math.min(1, remainder.length)),
      input: remainder,
    });
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
  explicitComposeParser,
  groupedParser,
};
