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
  LessThan,
  GreaterThan,
  LessThanOrEqual,
  GreaterThanOrEqual,
  Equal,
  LogicalAnd,
  LogicalOr,
  Compose,
  VarX,
  VarY,
  VarZ,
  Pow,
  Exp,
  Sin,
  Cos,
  Tan,
  Atan,
  Asin,
  Acos,
  Ln,
  Abs,
  Abs2,
  Floor,
  Conjugate,
  oo,
  If,
  FingerOffset,
  SetBindingNode,
  SetRef,
} from './core-engine.mjs';

const MAX_DIRECT_POWER_EXPONENT = 10;
let currentConstantEvaluationContext = null;

const IDENTIFIER_CHAR = /[A-Za-z0-9_]/;
const NUMBER_REGEX = /[+-]?(?:\d+\.\d+|\d+|\.\d+)(?:[eE][+-]?\d+)?/y;
const SQRT3_OVER_2 = Math.sqrt(3) / 2;
const ITERATION_VARIABLE_NAME = 'v';
const IDENTIFIER_REGEX = /[A-Za-z_][A-Za-z0-9_]*/y;

function createPlaceholderVar(name) {
  return { kind: 'PlaceholderVar', name };
}

function createIdentifier(name) {
  return { kind: 'Identifier', name };
}

function withSpan(node, span) {
  return { ...node, span, input: span.input };
}

function withSyntax(node, syntaxLabel) {
  if (node && typeof node === 'object' && syntaxLabel) {
    node.syntaxLabel = syntaxLabel;
  }
  return node;
}

function createConstNode(re, im, span) {
  if (!span) {
    return Const(re, im);
  }
  return withSpan(Const(re, im), span);
}

function createSqrtExpression(valueNode, branchNode = null, spanOverride = null) {
  const primarySpan = spanOverride || valueNode?.span || branchNode?.span;
  const lnSpan = valueNode?.span || primarySpan;
  const lnNode = lnSpan ? withSpan(Ln(valueNode, branchNode), lnSpan) : Ln(valueNode, branchNode);
  if (!primarySpan) {
    return Exp(Mul(Const(0.5, 0), lnNode));
  }
  const halfConst = createConstNode(0.5, 0, primarySpan);
  const mulNode = withSpan(Mul(halfConst, lnNode), primarySpan);
  return withSpan(Exp(mulNode), primarySpan);
}

function createHeavExpression(valueNode, spanOverride = null) {
  const primarySpan = spanOverride || valueNode?.span;
  const zeroForComparison = createConstNode(0, 0, primarySpan);
  const oneConst = createConstNode(1, 0, primarySpan);
  const zeroConst = createConstNode(0, 0, primarySpan);
  if (!primarySpan) {
    return If(GreaterThan(valueNode, Const(0, 0)), Const(1, 0), Const(0, 0));
  }
  const comparison = withSpan(GreaterThan(valueNode, zeroForComparison), primarySpan);
  return withSpan(If(comparison, oneConst, zeroConst), primarySpan);
}

const BUILTIN_FUNCTION_DEFINITIONS = [
  { name: 'exp', factory: Exp },
  { name: 'sin', factory: Sin },
  { name: 'cos', factory: Cos },
  { name: 'tan', factory: Tan },
  { name: 'atan', factory: Atan },
  { name: 'arctan', factory: Atan },
  { name: 'asin', factory: Asin },
  { name: 'arcsin', factory: Asin },
  { name: 'acos', factory: Acos },
  { name: 'arccos', factory: Acos },
  { name: 'ln', factory: (value) => Ln(value, null) },
  { name: 'sqrt', factory: (value) => createSqrtExpression(value, null) },
  { name: 'abs', factory: Abs },
  { name: 'abs2', factory: Abs2 },
  { name: 'conj', factory: Conjugate },
  { name: 'floor', factory: Floor },
  { name: 'heav', factory: (value) => createHeavExpression(value) },
];

function createBuiltinFunctionLiteral(name, factory, span) {
  const identityVar = withSpan(VarZ(), span);
  const node = withSpan(factory(identityVar), span);
  node.__functionLiteral = {
    kind: 'builtin',
    name,
    apply: (arg) => factory(arg),
  };
  return node;
}

function isBuiltinFunctionLiteral(node) {
  return Boolean(node && node.__functionLiteral && node.__functionLiteral.kind === 'builtin');
}

function applyFunctionLiteral(node, argument) {
  if (!isBuiltinFunctionLiteral(node)) {
    return null;
  }
  const applied = node.__functionLiteral.apply(argument);
  return applied;
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

const imagUnit = keywordLiteral('i', { ctor: 'ImagUnit', caseSensitive: false });
const tightImagUnit = Literal('i', { ctor: 'ImagUnitTight', caseSensitive: false });

const signParser = Choice([
  wsLiteral('+', { ctor: 'PlusSign' }).Map(() => 1),
  wsLiteral('-', { ctor: 'MinusSign' }).Map(() => -1),
], { ctor: 'Sign' });

const optionalSign = signParser.Optional(1, { ctor: 'OptionalSign' });

const numberLiteral = numberToken.Map((value, result) => withSpan(Const(value, 0), result.span));

const imagFromNumber = numberToken.i_(tightImagUnit, { ctor: 'NumericImag' })
  .Map((magnitude, result) => withSpan(Const(0, magnitude), result.span));

const unitImagLiteral = optionalSign.i_(imagUnit, { ctor: 'UnitImag' })
  .Map((sign, result) => withSpan(Const(0, sign), result.span));

const jLiteral = keywordLiteral('j', { ctor: 'ConstJ', caseSensitive: false })
  .Map((_, result) => withSpan(Const(-0.5, SQRT3_OVER_2), result.span));

const literalParser = Choice([
  imagFromNumber,
  unitImagLiteral,
  numberLiteral,
  jLiteral,
], { ctor: 'Literal' });

const FINGER_TOKENS = ['F1', 'F2', 'F3', 'D1', 'D2', 'D3', 'W1', 'W2'];

const DEFAULT_FINGER_VALUE_MAP = {
  F1: { re: 0, im: 0 },
  F2: { re: 0, im: 0 },
  F3: { re: 0, im: 0 },
  D1: { re: 0, im: 0 },
  D2: { re: 0, im: 0 },
  D3: { re: 0, im: 0 },
  W1: { re: 1, im: 0 },
  W2: { re: 0, im: 0 },
};

const fingerLiteralParsers = FINGER_TOKENS.map((label) =>
  keywordLiteral(label, { ctor: `Finger(${label})` }).Map((_, result) =>
    withSyntax(withSpan(FingerOffset(label), result.span), label),
  ),
);

const RESERVED_BINDING_NAMES = new Set([
  'set',
  'in',
  'if',
  'exp',
  'sin',
  'cos',
  'tan',
  'atan',
  'asin',
  'acos',
  'arcsin',
  'arccos',
  'arctan',
  'ln',
  'sqrt',
  'abs',
  'abs2',
  'floor',
  'conj',
  'heav',
  'oo',
  'comp',
  'o',
  'x',
  'y',
  'real',
  'imag',
  'z',
  'j',
  ITERATION_VARIABLE_NAME,
  ...FINGER_TOKENS,
]);

const iterationVariableLiteral = keywordLiteral(ITERATION_VARIABLE_NAME, { ctor: 'IterationVar' })
  .Map((_, result) => withSpan(createPlaceholderVar(ITERATION_VARIABLE_NAME), result.span));

const iterationVariableNameParser = keywordLiteral(ITERATION_VARIABLE_NAME, { ctor: 'IterationName' })
  .Map(() => ITERATION_VARIABLE_NAME);

const identifierToken = wsRegex(IDENTIFIER_REGEX, {
  ctor: 'IdentifierToken',
  transform: (match) => match[0],
});

const identifierReferenceParser = createParser('Identifier', (input) => {
  const identifier = identifierToken.runNormalized(input);
  if (!identifier.ok) {
    return identifier;
  }
  return new ParseSuccess({
    ctor: 'Identifier',
    value: withSpan(createIdentifier(identifier.value), identifier.span),
    span: identifier.span,
    next: identifier.next,
  });
});

const bindingIdentifierParser = createParser('BindingIdentifier', (input) => {
  const identifier = identifierToken.runNormalized(input);
  if (!identifier.ok) {
    return identifier;
  }
  if (RESERVED_BINDING_NAMES.has(identifier.value)) {
    return new ParseFailure({
      ctor: 'BindingIdentifier',
      message: `"${identifier.value}" is a reserved identifier and cannot be bound with set`,
      severity: ParseSeverity.error,
      expected: 'non-reserved identifier',
      span: identifier.span,
      input: identifier.span.input,
    });
  }
  return new ParseSuccess({
    ctor: 'BindingIdentifier',
    value: identifier.value,
    span: identifier.span,
    next: identifier.next,
  });
});

const primitiveParser = Choice([
  keywordLiteral('x', { ctor: 'VarX' }).Map((_, result) => withSyntax(withSpan(VarX(), result.span), 'x')),
  keywordLiteral('y', { ctor: 'VarY' }).Map((_, result) => withSyntax(withSpan(VarY(), result.span), 'y')),
  keywordLiteral('real', { ctor: 'VarReal' }).Map((_, result) => withSyntax(withSpan(VarX(), result.span), 'real')),
  keywordLiteral('imag', { ctor: 'VarImag' }).Map((_, result) => withSyntax(withSpan(VarY(), result.span), 'imag')),
  keywordLiteral('z', { ctor: 'VarZ' }).Map((_, result) => withSpan(VarZ(), result.span)),
  ...fingerLiteralParsers,
  iterationVariableLiteral,
  identifierReferenceParser,
], { ctor: 'Primitive' });

let expressionParser;
const expressionRef = lazy(() => expressionParser, { ctor: 'ExpressionRef' });
const setBindingRef = lazy(() => setBindingParser, { ctor: 'SetBindingRef' });

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

const explicitRepeatComposeParser = createParser('ExplicitRepeatCompose', (input) => {
  const keyword = wsLiteral('oo', { ctor: 'RepeatComposeKeyword' }).runNormalized(input);
  if (!keyword.ok) {
    return keyword;
  }
  const open = wsLiteral('(', { ctor: 'RepeatComposeOpen' }).runNormalized(keyword.next);
  if (!open.ok) {
    return open;
  }
  const fnResult = expressionRef.runNormalized(open.next);
  if (!fnResult.ok) {
    return fnResult;
  }
  const comma = wsLiteral(',', { ctor: 'RepeatComposeComma' }).runNormalized(fnResult.next);
  if (!comma.ok) {
    return comma;
  }
  const countResult = numberToken.runNormalized(comma.next);
  if (!countResult.ok) {
    return countResult;
  }
  const validatedCount = validateRepeatCount(countResult.value, countResult.span);
  if (validatedCount instanceof ParseFailure) {
    return validatedCount;
  }
  const close = wsLiteral(')', { ctor: 'RepeatComposeClose' }).runNormalized(countResult.next);
  if (!close.ok) {
    return close;
  }
  const span = spanBetween(input, close.next);
  return new ParseSuccess({
    ctor: 'ExplicitRepeatCompose',
    value: withSpan(oo(fnResult.value, validatedCount), span),
    span,
    next: close.next,
  });
});

const compParser = createParser('CompCall', (input) => {
  const keyword = keywordLiteral('comp', { ctor: 'CompKeyword' }).runNormalized(input);
  if (!keyword.ok) {
    return keyword;
  }
  const open = wsLiteral('(', { ctor: 'CompOpen' }).runNormalized(keyword.next);
  if (!open.ok) {
    return open;
  }
  const bodyResult = expressionRef.runNormalized(open.next);
  if (!bodyResult.ok) {
    return bodyResult;
  }
  const comma1 = wsLiteral(',', { ctor: 'CompComma1' }).runNormalized(bodyResult.next);
  if (!comma1.ok) {
    return comma1;
  }
  const nameResult = iterationVariableNameParser.runNormalized(comma1.next);
  if (!nameResult.ok) {
    return nameResult;
  }
  const comma2 = wsLiteral(',', { ctor: 'CompComma2' }).runNormalized(nameResult.next);
  if (!comma2.ok) {
    return comma2;
  }
  const seedResult = expressionRef.runNormalized(comma2.next);
  if (!seedResult.ok) {
    return seedResult;
  }
  const comma3 = wsLiteral(',', { ctor: 'CompComma3' }).runNormalized(seedResult.next);
  if (!comma3.ok) {
    return comma3;
  }
  const countResult = numberToken.runNormalized(comma3.next);
  if (!countResult.ok) {
    return countResult;
  }
  const validatedCount = validateCompIterationCount(countResult.value, countResult.span);
  if (validatedCount instanceof ParseFailure) {
    return validatedCount;
  }
  const close = wsLiteral(')', { ctor: 'CompClose' }).runNormalized(countResult.next);
  if (!close.ok) {
    return close;
  }
  const span = spanBetween(input, close.next);
  const value = buildCompAST({
    body: bodyResult.value,
    placeholder: nameResult.value,
    seed: seedResult.value,
    iterations: validatedCount,
    span,
  });
  return new ParseSuccess({
    ctor: 'CompCall',
    value,
    span,
    next: close.next,
  });
});

const ifParser = Sequence([
  keywordLiteral('if', { ctor: 'IfKeyword' }),
  wsLiteral('(', { ctor: 'IfOpen' }),
  expressionRef,
  wsLiteral(',', { ctor: 'IfComma1' }),
  expressionRef,
  wsLiteral(',', { ctor: 'IfComma2' }),
  expressionRef,
  wsLiteral(')', { ctor: 'IfClose' }),
], {
  ctor: 'IfCall',
  projector: (values) => ({
    condition: values[2],
    thenBranch: values[4],
    elseBranch: values[6],
  }),
}).Map(({ condition, thenBranch, elseBranch }, result) => withSpan(If(condition, thenBranch, elseBranch), result.span));

function createUnaryFunctionParser(name, factory) {
  return Sequence([
    keywordLiteral(name, { ctor: `${name}Keyword` }),
    wsLiteral('(', { ctor: `${name}Open` }),
    expressionRef,
    wsLiteral(')', { ctor: `${name}Close` }),
  ], {
    ctor: `${name}Call`,
    projector: (values) => values[2],
  }).Map((expr, result) => withSpan(factory(expr), result.span));
}

function createUnaryFunctionParsers(names, factory) {
  return names.map((name) => createUnaryFunctionParser(name, factory));
}

const lnParser = createParser('LnCall', (input) => {
  const keyword = keywordLiteral('ln', { ctor: 'lnKeyword' }).runNormalized(input);
  if (!keyword.ok) {
    return keyword;
  }
  const open = wsLiteral('(', { ctor: 'lnOpen' }).runNormalized(keyword.next);
  if (!open.ok) {
    return open;
  }
  const valueResult = expressionRef.runNormalized(open.next);
  if (!valueResult.ok) {
    return valueResult;
  }

  let cursor = valueResult.next;
  let branchNode = null;
  const comma = wsLiteral(',', { ctor: 'lnComma' }).runNormalized(cursor);
  if (comma.ok) {
    const branchResult = expressionRef.runNormalized(comma.next);
    if (!branchResult.ok) {
      return branchResult;
    }
    branchNode = branchResult.value;
    cursor = branchResult.next;
  } else if (comma.severity === ParseSeverity.error) {
    return comma;
  }

  const close = wsLiteral(')', { ctor: 'lnClose' }).runNormalized(cursor);
  if (!close.ok) {
    return close;
  }

  const span = spanBetween(input, close.next);
  return new ParseSuccess({
    ctor: 'LnCall',
    value: withSpan(Ln(valueResult.value, branchNode), span),
    span,
    next: close.next,
  });
});

const sqrtParser = createParser('SqrtCall', (input) => {
  const keyword = keywordLiteral('sqrt', { ctor: 'sqrtKeyword' }).runNormalized(input);
  if (!keyword.ok) {
    return keyword;
  }
  const open = wsLiteral('(', { ctor: 'sqrtOpen' }).runNormalized(keyword.next);
  if (!open.ok) {
    return open;
  }
  const valueResult = expressionRef.runNormalized(open.next);
  if (!valueResult.ok) {
    return valueResult;
  }
  let cursor = valueResult.next;
  let branchNode = null;
  const comma = wsLiteral(',', { ctor: 'sqrtComma' }).runNormalized(cursor);
  if (comma.ok) {
    const branchResult = expressionRef.runNormalized(comma.next);
    if (!branchResult.ok) {
      return branchResult;
    }
    branchNode = branchResult.value;
    cursor = branchResult.next;
  } else if (comma.severity === ParseSeverity.error) {
    return comma;
  }
  const close = wsLiteral(')', { ctor: 'sqrtClose' }).runNormalized(cursor);
  if (!close.ok) {
    return close;
  }
  const span = spanBetween(input, close.next);
  return new ParseSuccess({
    ctor: 'SqrtCall',
    value: createSqrtExpression(valueResult.value, branchNode, span),
    span,
    next: close.next,
  });
});

const elementaryFunctionParser = Choice([
  ...createUnaryFunctionParsers(['exp'], Exp),
  ...createUnaryFunctionParsers(['sin'], Sin),
  ...createUnaryFunctionParsers(['cos'], Cos),
  ...createUnaryFunctionParsers(['tan'], Tan),
  ...createUnaryFunctionParsers(['atan', 'arctan'], Atan),
  ...createUnaryFunctionParsers(['asin', 'arcsin'], Asin),
  ...createUnaryFunctionParsers(['acos', 'arccos'], Acos),
  lnParser,
  sqrtParser,
  ...createUnaryFunctionParsers(['abs'], Abs),
  ...createUnaryFunctionParsers(['abs2'], Abs2),
  ...createUnaryFunctionParsers(['floor'], Floor),
  ...createUnaryFunctionParsers(['conj'], Conjugate),
  ...createUnaryFunctionParsers(['heav'], (value) => createHeavExpression(value)),
], { ctor: 'ElementaryFunction' });

const builtinFunctionLiteralParser = Choice(
  BUILTIN_FUNCTION_DEFINITIONS.map(({ name, factory }) =>
    keywordLiteral(name, { ctor: `${name}FunctionLiteral` }).Map((_, result) =>
      createBuiltinFunctionLiteral(name, factory, result.span),
    ),
  ),
  { ctor: 'BuiltinFunctionLiteral' },
);

const primaryParser = Choice([
  explicitRepeatComposeParser,
  compParser,
  explicitComposeParser,
  elementaryFunctionParser,
  builtinFunctionLiteralParser,
  ifParser,
  setBindingRef,
  groupedParser,
  literalParser,
  primitiveParser,
], { ctor: 'Primary' });

let unaryParser;
const unaryRef = lazy(() => unaryParser, { ctor: 'UnaryRef' });

const functionCallSuffixParser = Sequence(
  [
    wsLiteral('(', { ctor: 'CallOpen' }),
    expressionRef,
    wsLiteral(')', { ctor: 'CallClose' }),
  ],
  {
    ctor: 'FunctionCallSuffix',
    projector: (values) => values[1],
  },
);

const callExpressionParser = createParser('CallExpression', (input) => {
  const head = primaryParser.runNormalized(input);
  if (!head.ok) {
    return head;
  }
  let node = head.value;
  let cursor = head.next;
  while (true) {
    const suffix = functionCallSuffixParser.runNormalized(cursor);
    if (!suffix.ok) {
      if (suffix.severity === ParseSeverity.error) {
        return suffix;
      }
      break;
    }
    const span = spanBetween(input, suffix.next);
    const applied = applyFunctionLiteral(node, suffix.value);
    if (applied) {
      node = withSpan(applied, span);
    } else {
      node = withSpan(Compose(node, suffix.value), span);
    }
    cursor = suffix.next;
  }
  const span = spanBetween(input, cursor);
  return new ParseSuccess({
    ctor: 'CallExpression',
    value: node,
    span,
    next: cursor,
  });
});

const dotSuffixParser = createParser('DotSuffix', (input) => {
  const dot = wsLiteral('.', { ctor: 'DotOp' }).runNormalized(input);
  if (!dot.ok) {
    return dot;
  }
  const rhs = callExpressionParser.runNormalized(dot.next);
  if (!rhs.ok) {
    return rhs;
  }
  const span = spanBetween(input, rhs.next);
  return new ParseSuccess({
    ctor: 'DotSuffix',
    value: rhs.value,
    span,
    next: rhs.next,
  });
});

const dotExpressionParser = createParser('DotExpression', (input) => {
  const head = callExpressionParser.runNormalized(input);
  if (!head.ok) {
    return head;
  }
  let node = head.value;
  let cursor = head.next;
  while (true) {
    const suffix = dotSuffixParser.runNormalized(cursor);
    if (!suffix.ok) {
      if (suffix.severity === ParseSeverity.error) {
        return suffix;
      }
      break;
    }
    const span = spanBetween(input, suffix.next);
    node = withSpan(Compose(suffix.value, node), span);
    cursor = suffix.next;
  }
  const span = spanBetween(input, cursor);
  return new ParseSuccess({
    ctor: 'DotExpression',
    value: node,
    span,
    next: cursor,
  });
});

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
  dotExpressionParser,
  unaryNegative,
  unaryPositive,
], { ctor: 'Unary' });

const powerParser = createParser('Power', (input) => {
  const head = unaryParser.runNormalized(input);
  if (!head.ok) {
    return head;
  }
  let node = head.value;
  let cursor = head.next;
  while (true) {
    const suffix = powerSuffixParser.runNormalized(cursor);
    if (!suffix.ok) {
      if (suffix.severity === ParseSeverity.error) {
        return suffix;
      }
      break;
    }
    const span = spanBetween(input, suffix.next);
    node = createPowerApplication(node, suffix.value, span);
    cursor = suffix.next;
  }
  const span = spanBetween(input, cursor);
  return new ParseSuccess({
    ctor: 'Power',
    value: node,
    span,
    next: cursor,
  });
});

function createPowerApplication(baseNode, exponentNode, span) {
  const literal = extractSmallIntegerExponent(exponentNode);
  if (literal !== null) {
    return withSpan(Pow(baseNode, literal), span);
  }
  const lnSpan = baseNode?.span || span;
  const lnNode = withSpan(Ln(baseNode, null), lnSpan);
  const mulNode = withSpan(Mul(exponentNode, lnNode), span);
  const expNode = withSpan(Exp(mulNode), span);
  expNode.__powerExpression = {
    base: baseNode,
    exponent: exponentNode,
  };
  return expNode;
}

function extractSmallIntegerExponent(node, contextOverride = null) {
  const value = evaluateNodeToRealScalar(node, contextOverride ?? currentConstantEvaluationContext);
  if (value === null) {
    return null;
  }
  if (!Number.isFinite(value)) {
    return null;
  }
  if (!Number.isInteger(value)) {
    return null;
  }
  if (Math.abs(value) > MAX_DIRECT_POWER_EXPONENT) {
    return null;
  }
  return value;
}

function evaluateNodeToRealScalar(node, context) {
  if (!node || typeof node !== 'object') {
    return null;
  }
  if (node.kind === 'Const') {
    if (node.im !== 0) {
      return null;
    }
    return node.re;
  }
  if (!context) {
    return null;
  }
  const evaluated = evaluateConstantNode(node, context);
  if (!evaluated || evaluated.im !== 0) {
    return null;
  }
  return evaluated.re;
}

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

function failureAdvancedPastInput(failure, originInput) {
  if (!failure || failure.ok) {
    return false;
  }
  const originStart = originInput?.start ?? 0;
  return failureContainsStartPastOrigin(failure, originStart);
}

function failureContainsStartPastOrigin(node, originStart) {
  if (!node) {
    return false;
  }
  if (node.span && typeof node.span.start === 'number' && node.span.start > originStart) {
    const spanInput = node.span.input;
    const source = spanInput?.buffer;
    if (source) {
      const deltaSlice = source.slice(originStart, node.span.start);
      if (deltaSlice.trim().length === 0) {
        return false;
      }
    }
    return true;
  }
  if (!node.children || node.children.length === 0) {
    return false;
  }
  return node.children.some((child) => failureContainsStartPastOrigin(child, originStart));
}

function createRepeatComposePlaceholder(base, countExpression, countSpan) {
  return {
    kind: 'RepeatComposePlaceholder',
    base,
    countExpression,
    countSpan,
  };
}

function createComposeMultipleNode({ base, countExpression, countSpan, span, resolvedCount }) {
  const node = {
    kind: 'ComposeMultiple',
    base,
    countExpression: countExpression || null,
    countSpan: countSpan || null,
    resolvedCount,
  };
  if (span) {
    node.span = span;
    node.input = span.input;
  }
  return node;
}

function buildCompAST({ body, placeholder, seed, iterations, span }) {
  let current = cloneAst(seed);
  for (let i = 0; i < iterations; i += 1) {
    current = substitutePlaceholder(body, placeholder, current);
  }
  if (span) {
    current.span = span;
    current.input = span.input;
  }
  return current;
}

function substitutePlaceholder(node, placeholder, replacement) {
  if (!node || typeof node !== 'object') {
    return node;
  }
  if (node.kind === 'PlaceholderVar') {
    if (node.name === placeholder) {
      return cloneAst(replacement);
    }
    return cloneAst(node);
  }
  switch (node.kind) {
    case 'Const':
    case 'Var':
    case 'VarX':
    case 'VarY':
    case 'FingerOffset':
    case 'Identifier':
    case 'SetRef':
      return cloneAst(node);
    case 'LetBinding':
      return {
        ...node,
        value: substitutePlaceholder(node.value, placeholder, replacement),
        body: substitutePlaceholder(node.body, placeholder, replacement),
      };
    case 'Pow':
      return { ...node, base: substitutePlaceholder(node.base, placeholder, replacement) };
    case 'Exp':
    case 'Sin':
    case 'Cos':
    case 'Tan':
    case 'Atan':
    case 'Asin':
    case 'Acos':
    case 'Abs':
    case 'Abs2':
    case 'Conjugate':
      return { ...node, value: substitutePlaceholder(node.value, placeholder, replacement) };
    case 'Ln': {
      const nextValue = substitutePlaceholder(node.value, placeholder, replacement);
      const nextBranch = node.branch
        ? substitutePlaceholder(node.branch, placeholder, replacement)
        : null;
      return { ...node, value: nextValue, branch: nextBranch };
    }
    case 'Sub':
    case 'Mul':
    case 'Op':
    case 'Add':
    case 'Div':
    case 'LessThan':
    case 'GreaterThan':
    case 'LessThanOrEqual':
    case 'GreaterThanOrEqual':
    case 'Equal':
    case 'LogicalAnd':
    case 'LogicalOr':
      return {
        ...node,
        left: substitutePlaceholder(node.left, placeholder, replacement),
        right: substitutePlaceholder(node.right, placeholder, replacement),
      };
    case 'Compose':
      return {
        ...node,
        f: substitutePlaceholder(node.f, placeholder, replacement),
        g: substitutePlaceholder(node.g, placeholder, replacement),
      };
    case 'ComposeMultiple':
      return {
        ...node,
        base: substitutePlaceholder(node.base, placeholder, replacement),
        countExpression: node.countExpression
          ? substitutePlaceholder(node.countExpression, placeholder, replacement)
          : null,
      };
    case 'RepeatComposePlaceholder':
      return {
        ...node,
        base: substitutePlaceholder(node.base, placeholder, replacement),
        countExpression: substitutePlaceholder(node.countExpression, placeholder, replacement),
      };
    case 'If':
      return {
        ...node,
        condition: substitutePlaceholder(node.condition, placeholder, replacement),
        thenBranch: substitutePlaceholder(node.thenBranch, placeholder, replacement),
        elseBranch: substitutePlaceholder(node.elseBranch, placeholder, replacement),
      };
    case 'SetBinding':
      return {
        ...node,
        value: substitutePlaceholder(node.value, placeholder, replacement),
        body: substitutePlaceholder(node.body, placeholder, replacement),
      };
    default:
      return cloneAst(node);
  }
}

function cloneAst(node) {
  if (!node || typeof node !== 'object') {
    return node;
  }
  switch (node.kind) {
    case 'Const':
    case 'Var':
    case 'VarX':
    case 'VarY':
    case 'FingerOffset':
    case 'PlaceholderVar':
    case 'Identifier':
    case 'SetRef':
      return { ...node };
    case 'LetBinding':
      return {
        ...node,
        value: cloneAst(node.value),
        body: cloneAst(node.body),
      };
    case 'SetBinding':
      return {
        ...node,
        value: cloneAst(node.value),
        body: cloneAst(node.body),
      };
    case 'Pow':
      return { ...node, base: cloneAst(node.base) };
    case 'Exp':
    case 'Sin':
    case 'Cos':
    case 'Tan':
    case 'Atan':
    case 'Asin':
    case 'Acos':
    case 'Abs':
    case 'Abs2':
    case 'Conjugate':
      return { ...node, value: cloneAst(node.value) };
    case 'Ln':
      return {
        ...node,
        value: cloneAst(node.value),
        branch: node.branch ? cloneAst(node.branch) : null,
      };
    case 'Sub':
    case 'Mul':
    case 'Op':
    case 'Add':
    case 'Div':
    case 'LessThan':
    case 'GreaterThan':
    case 'LessThanOrEqual':
    case 'GreaterThanOrEqual':
    case 'Equal':
    case 'LogicalAnd':
    case 'LogicalOr':
      return {
        ...node,
        left: cloneAst(node.left),
        right: cloneAst(node.right),
      };
    case 'Compose':
      return { ...node, f: cloneAst(node.f), g: cloneAst(node.g) };
    case 'ComposeMultiple':
      return {
        ...node,
        base: cloneAst(node.base),
        countExpression: node.countExpression ? cloneAst(node.countExpression) : null,
      };
    case 'If':
      return {
        ...node,
        condition: cloneAst(node.condition),
        thenBranch: cloneAst(node.thenBranch),
        elseBranch: cloneAst(node.elseBranch),
      };
    case 'RepeatComposePlaceholder':
      return {
        ...node,
        base: cloneAst(node.base),
        countExpression: cloneAst(node.countExpression),
      };
    default:
      throw new Error(`Unknown AST kind in cloneAst: ${node.kind}`);
  }
}

function substituteIdentifierWithClone(node, targetName, replacement) {
  if (!node || typeof node !== 'object') {
    return node;
  }
  if (node.kind === 'Identifier') {
    if (node.name === targetName) {
      const cloned = cloneAst(replacement);
      if (node.span) {
        cloned.span = node.span;
        cloned.input = node.input;
      }
      return cloned;
    }
    return cloneAst(node);
  }
  switch (node.kind) {
    case 'Const':
    case 'Var':
    case 'VarX':
    case 'VarY':
    case 'FingerOffset':
    case 'PlaceholderVar':
    case 'SetRef':
      return cloneAst(node);
    case 'LetBinding': {
      const nextValue = substituteIdentifierWithClone(node.value, targetName, replacement);
      const nextBody =
        node.name === targetName
          ? cloneAst(node.body)
          : substituteIdentifierWithClone(node.body, targetName, replacement);
      return {
        ...node,
        value: nextValue,
        body: nextBody,
      };
    }
    case 'Pow':
      return { ...node, base: substituteIdentifierWithClone(node.base, targetName, replacement) };
    case 'Exp':
    case 'Sin':
    case 'Cos':
    case 'Tan':
    case 'Atan':
    case 'Asin':
    case 'Acos':
    case 'Abs':
    case 'Abs2':
    case 'Conjugate':
      return { ...node, value: substituteIdentifierWithClone(node.value, targetName, replacement) };
    case 'Ln': {
      const nextValue = substituteIdentifierWithClone(node.value, targetName, replacement);
      const nextBranch = node.branch
        ? substituteIdentifierWithClone(node.branch, targetName, replacement)
        : null;
      return { ...node, value: nextValue, branch: nextBranch };
    }
    case 'Sub':
    case 'Mul':
    case 'Op':
    case 'Add':
    case 'Div':
    case 'LessThan':
    case 'GreaterThan':
    case 'LessThanOrEqual':
    case 'GreaterThanOrEqual':
    case 'Equal':
    case 'LogicalAnd':
    case 'LogicalOr':
      return {
        ...node,
        left: substituteIdentifierWithClone(node.left, targetName, replacement),
        right: substituteIdentifierWithClone(node.right, targetName, replacement),
      };
    case 'Compose':
      return {
        ...node,
        f: substituteIdentifierWithClone(node.f, targetName, replacement),
        g: substituteIdentifierWithClone(node.g, targetName, replacement),
      };
    case 'ComposeMultiple':
      return {
        ...node,
        base: substituteIdentifierWithClone(node.base, targetName, replacement),
        countExpression: node.countExpression
          ? substituteIdentifierWithClone(node.countExpression, targetName, replacement)
          : null,
      };
    case 'If':
      return {
        ...node,
        condition: substituteIdentifierWithClone(node.condition, targetName, replacement),
        thenBranch: substituteIdentifierWithClone(node.thenBranch, targetName, replacement),
        elseBranch: substituteIdentifierWithClone(node.elseBranch, targetName, replacement),
      };
    case 'SetBinding': {
      const nextValue = substituteIdentifierWithClone(node.value, targetName, replacement);
      const nextBody =
        node.name === targetName
          ? cloneAst(node.body)
          : substituteIdentifierWithClone(node.body, targetName, replacement);
      return {
        ...node,
        value: nextValue,
        body: nextBody,
      };
    }
    case 'RepeatComposePlaceholder':
      return {
        ...node,
        base: substituteIdentifierWithClone(node.base, targetName, replacement),
        countExpression: substituteIdentifierWithClone(node.countExpression, targetName, replacement),
      };
    default:
      return cloneAst(node);
  }
}

function findFirstPlaceholderNode(ast) {
  if (!ast || typeof ast !== 'object') {
    return null;
  }
  const stack = [ast];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') {
      continue;
    }
    if (node.kind === 'PlaceholderVar') {
      return node;
    }
    switch (node.kind) {
      case 'Pow':
        stack.push(node.base);
        break;
      case 'Exp':
      case 'Sin':
      case 'Cos':
      case 'Tan':
      case 'Atan':
      case 'Asin':
      case 'Acos':
      case 'Ln':
      case 'Abs':
      case 'Abs2':
      case 'Conjugate':
        stack.push(node.value);
        if (node.kind === 'Ln' && node.branch) {
          stack.push(node.branch);
        }
        break;
      case 'Sub':
      case 'Mul':
      case 'Op':
      case 'Add':
      case 'Div':
      case 'LessThan':
      case 'GreaterThan':
      case 'LessThanOrEqual':
      case 'GreaterThanOrEqual':
      case 'Equal':
      case 'LogicalAnd':
      case 'LogicalOr':
        stack.push(node.left, node.right);
        break;
      case 'If':
        stack.push(node.condition, node.thenBranch, node.elseBranch);
        break;
      case 'Compose':
        stack.push(node.f, node.g);
        break;
      case 'ComposeMultiple':
        stack.push(node.base);
        if (node.countExpression) {
          stack.push(node.countExpression);
        }
        break;
      case 'RepeatComposePlaceholder':
        stack.push(node.base);
        if (node.countExpression) {
          stack.push(node.countExpression);
        }
        break;
      case 'SetBinding':
        stack.push(node.value, node.body);
        break;
      default:
        break;
    }
  }
  return null;
}

function findFirstLetBinding(ast) {
  if (!ast || typeof ast !== 'object') {
    return null;
  }
  const stack = [ast];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') {
      continue;
    }
    if (node.kind === 'LetBinding') {
      return node;
    }
    switch (node.kind) {
      case 'Pow':
        stack.push(node.base);
        break;
      case 'Exp':
      case 'Sin':
      case 'Cos':
      case 'Tan':
      case 'Atan':
      case 'Asin':
      case 'Acos':
      case 'Ln':
      case 'Abs':
      case 'Abs2':
      case 'Conjugate':
        stack.push(node.value);
        if (node.kind === 'Ln' && node.branch) {
          stack.push(node.branch);
        }
        break;
      case 'Sub':
      case 'Mul':
      case 'Op':
      case 'Add':
      case 'Div':
      case 'LessThan':
      case 'GreaterThan':
      case 'LessThanOrEqual':
      case 'GreaterThanOrEqual':
      case 'Equal':
      case 'LogicalAnd':
      case 'LogicalOr':
        stack.push(node.left, node.right);
        break;
      case 'If':
        stack.push(node.condition, node.thenBranch, node.elseBranch);
        break;
      case 'Compose':
        stack.push(node.f, node.g);
        break;
      case 'ComposeMultiple':
        stack.push(node.base);
        if (node.countExpression) {
          stack.push(node.countExpression);
        }
        break;
      case 'SetBinding':
        stack.push(node.value, node.body);
        break;
      case 'RepeatComposePlaceholder':
        stack.push(node.base);
        if (node.countExpression) {
          stack.push(node.countExpression);
        }
        break;
      default:
        break;
    }
  }
  return null;
}

function eliminateTopLevelLets(ast, input) {
  let current = ast;
  while (current && typeof current === 'object' && current.kind === 'LetBinding') {
    const substituted = substituteIdentifierWithClone(current.body, current.name, current.value);
    if (current.span && substituted && typeof substituted === 'object') {
      substituted.span = current.span;
      substituted.input = current.input;
    }
    current = substituted;
  }
  const nestedLet = findFirstLetBinding(current);
  if (nestedLet) {
    const span = nestedLet.span ?? input.createSpan(0, 0);
    return new ParseFailure({
      ctor: 'LetBinding',
      message: 'let bindings are only allowed at the top level',
      severity: ParseSeverity.error,
      expected: 'top-level let',
      span,
      input: span.input || input,
    });
  }
  return current;
}

function resolveSetReferences(ast, input) {
  const env = [];
  function visit(node) {
    if (!node || typeof node !== 'object') {
      return null;
    }
    switch (node.kind) {
      case 'SetBinding': {
        const valueErr = visit(node.value);
        if (valueErr) {
          return valueErr;
        }
        env.push(node);
        const bodyErr = visit(node.body);
        env.pop();
        return bodyErr;
      }
      case 'Identifier': {
        const binding = findBindingForName(env, node.name);
        if (!binding) {
          const span = node.span ?? input.createSpan(0, 0);
          return new ParseFailure({
            ctor: 'Identifier',
            message: `Unknown variable "${node.name}". Introduce it with "set ${node.name} = value in ..."`,
            severity: ParseSeverity.error,
            expected: 'set binding',
            span,
            input: span.input || input,
          });
        }
        const resolved = SetRef(node.name, binding);
        resolved.span = node.span;
        resolved.input = node.input;
        Object.assign(node, resolved);
        return null;
      }
      case 'LetBinding':
        return new ParseFailure({
          ctor: 'LetBinding',
          message: 'let bindings are only allowed at the top level',
          severity: ParseSeverity.error,
          expected: 'top-level let',
          span: node.span ?? input.createSpan(0, 0),
          input: (node.span && node.span.input) || input,
        });
      case 'Const':
      case 'Var':
      case 'VarX':
      case 'VarY':
      case 'FingerOffset':
      case 'PlaceholderVar':
      case 'SetRef':
        return null;
      case 'Pow':
        return visit(node.base);
    case 'Exp':
    case 'Sin':
    case 'Cos':
    case 'Tan':
    case 'Atan':
    case 'Asin':
    case 'Acos':
    case 'Abs':
    case 'Abs2':
    case 'Conjugate':
      return visit(node.value);
    case 'Ln': {
      const valueErr = visit(node.value);
      if (valueErr) {
        return valueErr;
      }
      if (node.branch) {
        return visit(node.branch);
      }
      return null;
    }
      case 'Sub':
      case 'Mul':
      case 'Op':
      case 'Add':
      case 'Div':
      case 'LessThan':
      case 'GreaterThan':
      case 'LessThanOrEqual':
      case 'GreaterThanOrEqual':
    case 'Equal':
    case 'LogicalAnd':
    case 'LogicalOr': {
        const leftErr = visit(node.left);
        if (leftErr) {
          return leftErr;
        }
        return visit(node.right);
      }
      case 'Compose': {
        const fErr = visit(node.f);
        if (fErr) {
          return fErr;
        }
        return visit(node.g);
      }
      case 'ComposeMultiple': {
        const baseErr = visit(node.base);
        if (baseErr) {
          return baseErr;
        }
        if (node.countExpression) {
          return visit(node.countExpression);
        }
        return null;
      }
      case 'RepeatComposePlaceholder': {
        const baseErr = visit(node.base);
        if (baseErr) {
          return baseErr;
        }
        if (node.countExpression) {
          return visit(node.countExpression);
        }
        return null;
      }
      case 'If': {
        const condErr = visit(node.condition);
        if (condErr) {
          return condErr;
        }
        const thenErr = visit(node.thenBranch);
        if (thenErr) {
          return thenErr;
        }
        return visit(node.elseBranch);
      }
      default:
        return null;
    }
  }
  return visit(ast);
}

function findBindingForName(env, name) {
  for (let i = env.length - 1; i >= 0; i -= 1) {
    if (env[i].name === name) {
      return env[i];
    }
  }
  return null;
}

function normalizeParseOptions(options = {}) {
  return {
    fingerValues: normalizeFingerValuesSource(options.fingerValues),
  };
}

function normalizeFingerValuesSource(source) {
  const map = createDefaultFingerValueMap();
  if (!source) {
    return map;
  }
  if (source instanceof Map) {
    source.forEach((value, key) => {
      assignFingerValue(map, key, value);
    });
    return map;
  }
  if (typeof source === 'object') {
    Object.keys(source).forEach((key) => {
      assignFingerValue(map, key, source[key]);
    });
  }
  return map;
}

function createDefaultFingerValueMap() {
  const map = new Map();
  FINGER_TOKENS.forEach((label) => {
    const defaults = DEFAULT_FINGER_VALUE_MAP[label] || { re: 0, im: 0 };
    map.set(label, { re: defaults.re, im: defaults.im });
  });
  return map;
}

function assignFingerValue(map, label, value) {
  if (!FINGER_TOKENS.includes(label)) {
    return;
  }
  const normalized = normalizeComplexInput(value);
  if (normalized) {
    map.set(label, normalized);
  }
}

function normalizeComplexInput(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const rawRe = value.re ?? value.x;
  const rawIm = value.im ?? value.y;
  const re = Number(rawRe);
  const im = Number(rawIm);
  if (!Number.isFinite(re) || !Number.isFinite(im)) {
    return null;
  }
  return { re, im };
}

const REPEAT_COUNT_TOLERANCE = 1e-9;

function resolveRepeatPlaceholders(ast, parseOptions, input) {
  const context = {
    fingerValues: parseOptions.fingerValues,
    bindingStack: [],
  };
  function visit(node, parent, key) {
    if (!node || typeof node !== 'object') {
      return null;
    }
    switch (node.kind) {
      case 'RepeatComposePlaceholder': {
        const baseErr = visit(node.base, node, 'base');
        if (baseErr) {
          return baseErr;
        }
        const countExprErr = node.countExpression
          ? visit(node.countExpression, node, 'countExpression')
          : null;
        if (countExprErr) {
          return countExprErr;
        }
        const span =
          (node.countExpression && node.countExpression.span) ||
          node.countSpan ||
          node.span ||
          (parent?.span ?? input.createSpan(0, 0));
        const count = evaluateRepeatCountExpression(node.countExpression, span, context, input);
        if (count instanceof ParseFailure) {
          return count;
        }
        const composeMultiple = createComposeMultipleNode({
          base: node.base,
          countExpression: node.countExpression,
          countSpan: span,
          span: node.span,
          resolvedCount: count,
        });
        if (parent && key) {
          parent[key] = composeMultiple;
          return null;
        }
        ast = composeMultiple;
        return null;
      }
      case 'SetBinding': {
        const valueErr = visit(node.value, node, 'value');
        if (valueErr) {
          return valueErr;
        }
        const constantValue = evaluateConstantNode(node.value, context);
        context.bindingStack.push({ binding: node, value: constantValue });
        const bodyErr = visit(node.body, node, 'body');
        context.bindingStack.pop();
        return bodyErr;
      }
      case 'SetRef':
      case 'Const':
      case 'Var':
      case 'VarX':
      case 'VarY':
      case 'FingerOffset':
      case 'PlaceholderVar':
        return null;
      case 'Pow':
        return visit(node.base, node, 'base');
      case 'Exp': {
        const valueErr = visit(node.value, node, 'value');
        if (valueErr) {
          return valueErr;
        }
        const replacement = maybeReducePowerExpression(node, parent, key, context);
        if (!replacement) {
          return null;
        }
        if (parent && key) {
          parent[key] = replacement;
          return visit(replacement, parent, key);
        }
        ast = replacement;
        return visit(ast, null, null);
      }
      case 'Sin':
      case 'Cos':
      case 'Tan':
      case 'Atan':
      case 'Asin':
      case 'Acos':
      case 'Abs':
      case 'Abs2':
      case 'Floor':
      case 'Conjugate':
        return visit(node.value, node, 'value');
      case 'Ln': {
        const valueErr = visit(node.value, node, 'value');
        if (valueErr) {
          return valueErr;
        }
        if (node.branch) {
          return visit(node.branch, node, 'branch');
        }
        return null;
      }
      case 'Sub':
      case 'Mul':
      case 'Op':
      case 'Add':
      case 'Div':
      case 'LessThan':
      case 'GreaterThan':
      case 'LessThanOrEqual':
      case 'GreaterThanOrEqual':
      case 'Equal':
      case 'LogicalAnd':
      case 'LogicalOr': {
        const leftErr = visit(node.left, node, 'left');
        if (leftErr) {
          return leftErr;
        }
        return visit(node.right, node, 'right');
      }
      case 'Compose': {
        const fErr = visit(node.f, node, 'f');
        if (fErr) {
          return fErr;
        }
        return visit(node.g, node, 'g');
      }
      case 'If': {
        const condErr = visit(node.condition, node, 'condition');
        if (condErr) {
          return condErr;
        }
        const thenErr = visit(node.thenBranch, node, 'thenBranch');
        if (thenErr) {
          return thenErr;
        }
        return visit(node.elseBranch, node, 'elseBranch');
      }
      default:
        return null;
    }
  }
  const error = visit(ast, null, null);
  if (error instanceof ParseFailure) {
    return error;
  }
  return ast;
}

function maybeReducePowerExpression(node, parent, key, context) {
  if (!node || typeof node !== 'object' || !node.__powerExpression) {
    return null;
  }
  const metadata = node.__powerExpression;
  const integerExponent = extractSmallIntegerExponent(metadata.exponent, context);
  delete node.__powerExpression;
  if (integerExponent === null) {
    return null;
  }
  const replacement = Pow(metadata.base, integerExponent);
  if (node.span) {
    replacement.span = node.span;
    replacement.input = node.input;
  }
  return replacement;
}

function evaluateRepeatCountExpression(node, span, context) {
  const value = evaluateConstantNode(node, context);
  if (!value) {
    return new ParseFailure({
      ctor: 'RepeatCount',
      message: 'Repeat count must be a constant expression',
      severity: ParseSeverity.error,
      expected: 'constant non-negative integer',
      span,
      input: span.input,
    });
  }
  if (Math.abs(value.im) > REPEAT_COUNT_TOLERANCE) {
    return new ParseFailure({
      ctor: 'RepeatCount',
      message: 'Repeat count must be a real value',
      severity: ParseSeverity.error,
      expected: 'real constant',
      span,
      input: span.input,
    });
  }
  if (!Number.isFinite(value.re)) {
    return new ParseFailure({
      ctor: 'RepeatCount',
      message: 'Repeat count must be finite',
      severity: ParseSeverity.error,
      expected: 'finite constant',
      span,
      input: span.input,
    });
  }
  const rounded = Math.round(value.re);
  if (Math.abs(value.re - rounded) > REPEAT_COUNT_TOLERANCE) {
    return new ParseFailure({
      ctor: 'RepeatCount',
      message: 'Repeat count must be an integer',
      severity: ParseSeverity.error,
      expected: 'integer constant',
      span,
      input: span.input,
    });
  }
  if (rounded < 0) {
    return new ParseFailure({
      ctor: 'RepeatCount',
      message: 'Repeat count must be a non-negative integer',
      severity: ParseSeverity.error,
      expected: 'non-negative integer',
      span,
      input: span.input,
    });
  }
  return rounded;
}

function evaluateConstantNode(node, context, scope = {}, localBindings = []) {
  if (!node || typeof node !== 'object') {
    return null;
  }
  switch (node.kind) {
    case 'Const':
      return { re: node.re, im: node.im };
    case 'FingerOffset':
      return getFingerValueFromContext(node.slot, context.fingerValues);
    case 'Var':
      return scope.z ? { re: scope.z.re, im: scope.z.im } : null;
    case 'VarX':
      return scope.z ? { re: scope.z.re, im: 0 } : null;
    case 'VarY':
      return scope.z ? { re: scope.z.im, im: 0 } : null;
    case 'Add': {
      const left = evaluateConstantNode(node.left, context, scope, localBindings);
      if (!left) {
        return null;
      }
      const right = evaluateConstantNode(node.right, context, scope, localBindings);
      if (!right) {
        return null;
      }
      return complexAdd(left, right);
    }
    case 'Sub': {
      const left = evaluateConstantNode(node.left, context, scope, localBindings);
      if (!left) {
        return null;
      }
      const right = evaluateConstantNode(node.right, context, scope, localBindings);
      if (!right) {
        return null;
      }
      return complexSub(left, right);
    }
    case 'Mul': {
      const left = evaluateConstantNode(node.left, context, scope, localBindings);
      if (!left) {
        return null;
      }
      const right = evaluateConstantNode(node.right, context, scope, localBindings);
      if (!right) {
        return null;
      }
      return complexMul(left, right);
    }
    case 'Div': {
      const left = evaluateConstantNode(node.left, context, scope, localBindings);
      if (!left) {
        return null;
      }
      const right = evaluateConstantNode(node.right, context, scope, localBindings);
      if (!right) {
        return null;
      }
      return complexDiv(left, right);
    }
    case 'Pow': {
      const base = evaluateConstantNode(node.base, context, scope, localBindings);
      if (!base) {
        return null;
      }
      return complexPowInt(base, node.exponent);
    }
    case 'Exp': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      return value ? complexExp(value) : null;
    }
    case 'Sin': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      return value ? complexSin(value) : null;
    }
    case 'Cos': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      return value ? complexCos(value) : null;
    }
    case 'Tan': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      return value ? complexTan(value) : null;
    }
    case 'Atan': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      return value ? complexAtan(value) : null;
    }
    case 'Asin': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      return value ? complexAsin(value) : null;
    }
    case 'Acos': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      return value ? complexAcos(value) : null;
    }
    case 'Ln': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      if (!value) {
        return null;
      }
      let center = 0;
      if (node.branch) {
        const branchValue = evaluateConstantNode(node.branch, context, scope, localBindings);
        if (!branchValue) {
          return null;
        }
        center = branchValue.re;
      }
      return complexLn(value, center);
    }
    case 'Abs': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      if (!value) {
        return null;
      }
      return { re: complexAbs(value), im: 0 };
    }
    case 'Abs2': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      if (!value) {
        return null;
      }
      return { re: complexAbs2(value), im: 0 };
    }
    case 'Floor': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      return value ? complexFloor(value) : null;
    }
    case 'Conjugate': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      return value ? complexConjugate(value) : null;
    }
    case 'Compose': {
      const inner = evaluateConstantNode(node.g, context, scope, localBindings);
      if (!inner) {
        return null;
      }
      return evaluateConstantNode(node.f, context, { z: inner }, localBindings);
    }
    case 'ComposeMultiple': {
      const count = typeof node.resolvedCount === 'number' ? node.resolvedCount : null;
      if (count === null) {
        return null;
      }
      if (count === 0) {
        return scope.z ? { re: scope.z.re, im: scope.z.im } : null;
      }
      if (count === 1) {
        return evaluateConstantNode(node.base, context, scope, localBindings);
      }
      const repeated = oo(node.base, count);
      if (node.span && repeated && typeof repeated === 'object') {
        repeated.span = node.span;
        repeated.input = node.input;
      }
      return evaluateConstantNode(repeated, context, scope, localBindings);
    }
    case 'LessThan':
    case 'GreaterThan':
    case 'LessThanOrEqual':
    case 'GreaterThanOrEqual':
    case 'Equal': {
      const left = evaluateConstantNode(node.left, context, scope, localBindings);
      if (!left) {
        return null;
      }
      const right = evaluateConstantNode(node.right, context, scope, localBindings);
      if (!right) {
        return null;
      }
      return { re: evaluateComparison(node.kind, left, right), im: 0 };
    }
    case 'LogicalAnd':
    case 'LogicalOr': {
      const left = evaluateConstantNode(node.left, context, scope, localBindings);
      if (!left) {
        return null;
      }
      const right = evaluateConstantNode(node.right, context, scope, localBindings);
      if (!right) {
        return null;
      }
      const leftTruthy = isTruthyComplex(left);
      const rightTruthy = isTruthyComplex(right);
      const result =
        node.kind === 'LogicalAnd'
          ? leftTruthy && rightTruthy
          : leftTruthy || rightTruthy;
      return { re: result ? 1 : 0, im: 0 };
    }
    case 'If': {
      const condition = evaluateConstantNode(node.condition, context, scope, localBindings);
      if (!condition) {
        return null;
      }
      const branch = isTruthyComplex(condition) ? node.thenBranch : node.elseBranch;
      return evaluateConstantNode(branch, context, scope, localBindings);
    }
    case 'SetBinding': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      if (!value) {
        return null;
      }
      localBindings.push({ binding: node, value });
      const result = evaluateConstantNode(node.body, context, scope, localBindings);
      localBindings.pop();
      return result;
    }
    case 'SetRef': {
      for (let i = localBindings.length - 1; i >= 0; i -= 1) {
        if (localBindings[i].binding === node.binding) {
          return localBindings[i].value;
        }
      }
      if (context.bindingStack) {
        for (let i = context.bindingStack.length - 1; i >= 0; i -= 1) {
          const entry = context.bindingStack[i];
          if (entry.binding === node.binding) {
            return entry.value || null;
          }
        }
      }
      return null;
    }
    default:
      return null;
  }
}

function isTruthyComplex(value) {
  return Math.abs(value.re) > REPEAT_COUNT_TOLERANCE || Math.abs(value.im) > REPEAT_COUNT_TOLERANCE;
}

function evaluateComparison(kind, left, right) {
  switch (kind) {
    case 'LessThan':
      return left.re < right.re ? 1 : 0;
    case 'GreaterThan':
      return left.re > right.re ? 1 : 0;
    case 'LessThanOrEqual':
      return left.re <= right.re ? 1 : 0;
    case 'GreaterThanOrEqual':
      return left.re >= right.re ? 1 : 0;
    case 'Equal':
      return left.re === right.re ? 1 : 0;
    default:
      return 0;
  }
}

function getFingerValueFromContext(label, fingerValues) {
  const value = fingerValues?.get(label);
  if (!value) {
    return null;
  }
  return { re: value.re, im: value.im };
}

function complexAdd(a, b) {
  return { re: a.re + b.re, im: a.im + b.im };
}

function complexSub(a, b) {
  return { re: a.re - b.re, im: a.im - b.im };
}

function complexMul(a, b) {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

function complexDiv(a, b) {
  const denom = b.re * b.re + b.im * b.im;
  if (denom < 1e-12) {
    return null;
  }
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
  };
}

function complexPowInt(base, exponent) {
  if (!Number.isInteger(exponent)) {
    return null;
  }
  if (exponent === 0) {
    return { re: 1, im: 0 };
  }
  let result = { re: 1, im: 0 };
  let power = exponent;
  let current = { re: base.re, im: base.im };
  if (power < 0) {
    const inv = complexDiv({ re: 1, im: 0 }, current);
    if (!inv) {
      return null;
    }
    current = inv;
    power = -power;
  }
  while (power > 0) {
    if (power % 2 === 1) {
      result = complexMul(result, current);
    }
    power = Math.floor(power / 2);
    if (power > 0) {
      current = complexMul(current, current);
    }
  }
  return result;
}

function complexAbs2(value) {
  return value.re * value.re + value.im * value.im;
}

function complexAbs(value) {
  return Math.hypot(value.re, value.im);
}

function complexFloor(value) {
  return { re: Math.floor(value.re), im: Math.floor(value.im) };
}

function complexConjugate(value) {
  return { re: value.re, im: -value.im };
}

function complexExp(value) {
  const expReal = Math.exp(value.re);
  return {
    re: expReal * Math.cos(value.im),
    im: expReal * Math.sin(value.im),
  };
}

function complexSin(value) {
  const sinX = Math.sin(value.re);
  const cosX = Math.cos(value.re);
  const sinhY = Math.sinh(value.im);
  const coshY = Math.cosh(value.im);
  return {
    re: sinX * coshY,
    im: cosX * sinhY,
  };
}

function complexCos(value) {
  const sinX = Math.sin(value.re);
  const cosX = Math.cos(value.re);
  const sinhY = Math.sinh(value.im);
  const coshY = Math.cosh(value.im);
  return {
    re: cosX * coshY,
    im: -sinX * sinhY,
  };
}

function complexTan(value) {
  const sin = complexSin(value);
  const cos = complexCos(value);
  return complexDiv(sin, cos);
}

function complexSqrt(value) {
  if (!value) {
    return null;
  }
  const magnitude = complexAbs(value);
  if (!Number.isFinite(magnitude)) {
    return null;
  }
  if (magnitude === 0) {
    return { re: 0, im: 0 };
  }
  const realPart = Math.sqrt(0.5 * (magnitude + value.re));
  const imagPartMagnitude = Math.sqrt(Math.max(0, 0.5 * (magnitude - value.re)));
  const imagPart = value.im >= 0 ? imagPartMagnitude : -imagPartMagnitude;
  return { re: realPart, im: imagPart };
}

function complexAsin(value) {
  if (!value) {
    return null;
  }
  const iz = { re: -value.im, im: value.re };
  const one = { re: 1, im: 0 };
  const zSquared = complexMul(value, value);
  const underSqrt = complexSub(one, zSquared);
  const sqrtTerm = complexSqrt(underSqrt);
  if (!sqrtTerm) {
    return null;
  }
  const inside = complexAdd(iz, sqrtTerm);
  const lnValue = complexLn(inside);
  if (!lnValue) {
    return null;
  }
  return { re: lnValue.im, im: -lnValue.re };
}

function complexAcos(value) {
  const asinValue = complexAsin(value);
  if (!asinValue) {
    return null;
  }
  return { re: Math.PI / 2 - asinValue.re, im: -asinValue.im };
}

function complexLn(value, branchCenter = 0) {
  const magnitude = complexAbs(value);
  if (magnitude < 1e-12) {
    return null;
  }
  const angle = Math.atan2(value.im, value.re);
  const adjusted = wrapAngleToRange(angle, branchCenter);
  return {
    re: Math.log(magnitude),
    im: adjusted,
  };
}

function complexAtan(value) {
  const iz = { re: -value.im, im: value.re };
  const one = { re: 1, im: 0 };
  const term1 = complexLn(complexSub(one, iz));
  const term2 = complexLn(complexAdd(one, iz));
  if (!term1 || !term2) {
    return null;
  }
  const diff = complexSub(term1, term2);
  return complexMul({ re: 0, im: 0.5 }, diff);
}

function wrapAngleToRange(angle, center) {
  const shifted = angle - center;
  const normalized = shifted - Math.PI * 2 * Math.floor((shifted + Math.PI) / (Math.PI * 2));
  return normalized + center;
}

function validateRepeatCount(value, span) {
  if (!Number.isInteger(value) || value < 1) {
    return new ParseFailure({
      ctor: 'RepeatCount',
      message: 'Repeat count must be a positive integer',
      severity: ParseSeverity.error,
      expected: 'positive integer repeat count',
      span,
      input: span.input,
    });
  }
  return value;
}

function validateCompIterationCount(value, span) {
  if (!Number.isInteger(value) || value < 0) {
    return new ParseFailure({
      ctor: 'CompIterations',
      message: 'comp iteration count must be a non-negative integer',
      severity: ParseSeverity.error,
      expected: 'non-negative integer iteration count',
      span,
      input: span.input,
    });
  }
  return value;
}

const powerSuffixParser = createParser('PowerSuffix', (input) => {
  const caret = wsLiteral('^', { ctor: 'PowerOp' }).runNormalized(input);
  if (!caret.ok) {
    return caret;
  }
  const exponentResult = unaryParser.runNormalized(caret.next);
  if (!exponentResult.ok) {
    return exponentResult;
  }
  const span = spanBetween(input, exponentResult.next);
  return new ParseSuccess({
    ctor: 'PowerSuffix',
    value: exponentResult.value,
    span,
    next: exponentResult.next,
  });
});

const multiplicativeOperators = Choice([
  wsLiteral('*', { ctor: 'MulOp' }).Map(() => (left, right) => Mul(left, right)),
  wsLiteral('/', { ctor: 'DivOp' }).Map(() => (left, right) => Div(left, right)),
], { ctor: 'MulOpChoice' });

const additiveOperators = Choice([
  wsLiteral('+', { ctor: 'AddOp' }).Map(() => (left, right) => Add(left, right)),
  wsLiteral('-', { ctor: 'SubOp' }).Map(() => (left, right) => Sub(left, right)),
], { ctor: 'AddOpChoice' });

const composeOperator = wsLiteral('$', { ctor: 'ComposeOp' }).Map(() => (left, right) => Compose(left, right));

const multiplicativeParser = leftAssociative(powerParser, multiplicativeOperators, 'MulDiv');
const additiveParser = leftAssociative(multiplicativeParser, additiveOperators, 'AddSub');
const repeatSuffixParser = createParser('RepeatSuffix', (input) => {
  const opResult = wsLiteral('$$', { ctor: 'RepeatOp' }).runNormalized(input);
  if (!opResult.ok) {
    return opResult;
  }
  const countResult = additiveParser.runNormalized(opResult.next);
  if (!countResult.ok) {
    return countResult;
  }
  return new ParseSuccess({
    ctor: 'RepeatSuffix',
    value: { expression: countResult.value, span: countResult.span },
    span: spanBetween(input, countResult.next),
    next: countResult.next,
  });
});

const repeatComposeParser = createParser('RepeatCompose', (input) => {
  const head = additiveParser.runNormalized(input);
  if (!head.ok) {
    return head;
  }
  let node = head.value;
  let cursor = head.next;
  while (true) {
    const suffix = repeatSuffixParser.runNormalized(cursor);
    if (!suffix.ok) {
      if (suffix.severity === ParseSeverity.error) {
        return suffix;
      }
      break;
    }
    const span = spanBetween(input, suffix.next);
    node = withSpan(
      createRepeatComposePlaceholder(node, suffix.value.expression, suffix.value.span || suffix.span),
      span,
    );
    cursor = suffix.next;
  }
  const span = spanBetween(input, cursor);
  return new ParseSuccess({
    ctor: 'RepeatCompose',
    value: node,
    span,
    next: cursor,
  });
});

const compositionChainParser = leftAssociative(repeatComposeParser, composeOperator, 'Composition');

const comparisonOperatorParser = Choice([
  wsLiteral('<=', { ctor: 'LessThanOrEqualOp' }).Map(
    () => (left, right) => LessThanOrEqual(left, right),
  ),
  wsLiteral('>=', { ctor: 'GreaterThanOrEqualOp' }).Map(
    () => (left, right) => GreaterThanOrEqual(left, right),
  ),
  wsLiteral('==', { ctor: 'EqualsOp' }).Map(
    () => (left, right) => Equal(left, right),
  ),
  wsLiteral('<', { ctor: 'LessThanOp' }).Map(
    () => (left, right) => LessThan(left, right),
  ),
  wsLiteral('>', { ctor: 'GreaterThanOp' }).Map(
    () => (left, right) => GreaterThan(left, right),
  ),
], { ctor: 'ComparisonOperator' });

const maybeComparisonOperator = comparisonOperatorParser.Optional(null, { ctor: 'MaybeComparisonOp' });

const comparisonParser = createParser('Comparison', (input) => {
  const leftResult = compositionChainParser.runNormalized(input);
  if (!leftResult.ok) {
    return leftResult;
  }
  const operatorResult = maybeComparisonOperator.runNormalized(leftResult.next);
  if (!operatorResult.ok) {
    return operatorResult;
  }
  if (operatorResult.value === null) {
    const span = spanBetween(input, leftResult.next);
    return new ParseSuccess({
      ctor: 'Comparison',
      value: leftResult.value,
      span,
      next: leftResult.next,
    });
  }
  const rightResult = compositionChainParser.runNormalized(operatorResult.next);
  if (!rightResult.ok) {
    return rightResult;
  }
  const span = spanBetween(input, rightResult.next);
  return new ParseSuccess({
    ctor: 'Comparison',
    value: withSpan(operatorResult.value(leftResult.value, rightResult.value), span),
    span,
    next: rightResult.next,
  });
});

const logicalAndOperator = wsLiteral('&&', { ctor: 'LogicalAndOp' }).Map(
  () => (left, right) => LogicalAnd(left, right),
);

const logicalOrOperator = wsLiteral('||', { ctor: 'LogicalOrOp' }).Map(
  () => (left, right) => LogicalOr(left, right),
);

const logicalAndParser = leftAssociative(comparisonParser, logicalAndOperator, 'LogicalAnd');
const logicalOrParser = leftAssociative(logicalAndParser, logicalOrOperator, 'LogicalOr');

const setKeyword = keywordLiteral('set', { ctor: 'SetKeyword' });
const inKeyword = keywordLiteral('in', { ctor: 'SetInKeyword' });
const setEqualsLiteral = wsLiteral('=', { ctor: 'SetEquals' });

const setBindingParser = createParser('SetBinding', (input) => {
  const keyword = setKeyword.runNormalized(input);
  if (!keyword.ok) {
    return keyword;
  }
  const nameResult = bindingIdentifierParser.runNormalized(keyword.next);
  if (!nameResult.ok) {
    return nameResult;
  }
  const equalsResult = setEqualsLiteral.runNormalized(nameResult.next);
  if (!equalsResult.ok) {
    return equalsResult;
  }
  const valueResult = expressionRef.runNormalized(equalsResult.next);
  if (!valueResult.ok) {
    return valueResult;
  }
  const inResult = inKeyword.runNormalized(valueResult.next);
  if (!inResult.ok) {
    return inResult;
  }
  const bodyResult = expressionRef.runNormalized(inResult.next);
  if (!bodyResult.ok) {
    return bodyResult;
  }
  const span = spanBetween(input, bodyResult.next);
  const value = withSpan(
    SetBindingNode(nameResult.value, valueResult.value, bodyResult.value),
    span,
  );
  return new ParseSuccess({
    ctor: 'SetBinding',
    value,
    span,
    next: bodyResult.next,
  });
});

const letKeyword = keywordLiteral('let', { ctor: 'LetKeyword' });
const letEqualsLiteral = wsLiteral('=', { ctor: 'LetEquals' });

const letBindingParser = createParser('LetBinding', (input) => {
  const keyword = letKeyword.runNormalized(input);
  if (!keyword.ok) {
    return keyword;
  }
  const nameResult = bindingIdentifierParser.runNormalized(keyword.next);
  if (!nameResult.ok) {
    return nameResult;
  }
  const equalsResult = letEqualsLiteral.runNormalized(nameResult.next);
  if (!equalsResult.ok) {
    return equalsResult;
  }
  const valueResult = expressionRef.runNormalized(equalsResult.next);
  if (!valueResult.ok) {
    return valueResult;
  }
  const inResult = inKeyword.runNormalized(valueResult.next);
  if (!inResult.ok) {
    return inResult;
  }
  const bodyResult = expressionRef.runNormalized(inResult.next);
  if (!bodyResult.ok) {
    return bodyResult;
  }
  const span = spanBetween(input, bodyResult.next);
  const value = {
    kind: 'LetBinding',
    name: nameResult.value,
    value: valueResult.value,
    body: bodyResult.value,
    span,
    input: span.input,
  };
  return new ParseSuccess({
    ctor: 'LetBinding',
    value,
    span,
    next: bodyResult.next,
  });
});

expressionParser = createParser('Expression', (input) => {
  const letResult = letBindingParser.runNormalized(input);
  if (letResult.ok) {
    return letResult;
  }
  if (letResult.severity === ParseSeverity.error || failureAdvancedPastInput(letResult, input)) {
    return letResult;
  }
  const setResult = setBindingParser.runNormalized(input);
  if (setResult.ok) {
    return setResult;
  }
  if (setResult.severity === ParseSeverity.error || failureAdvancedPastInput(setResult, input)) {
    return setResult;
  }
  return logicalOrParser.runNormalized(input);
});

export function parseFormulaInput(input, options = {}) {
  const parseOptions = normalizeParseOptions(options);
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
  currentConstantEvaluationContext = {
    fingerValues: parseOptions.fingerValues,
    bindingStack: [],
  };
  let parsed;
  try {
    parsed = expressionParser.runNormalized(normalized);
  } finally {
    currentConstantEvaluationContext = null;
  }
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
  const letReduced = eliminateTopLevelLets(parsed.value, normalized);
  if (letReduced instanceof ParseFailure) {
    return letReduced;
  }
  const resolveError = resolveSetReferences(letReduced, normalized);
  if (resolveError instanceof ParseFailure) {
    return resolveError;
  }
  const repeatResolved = resolveRepeatPlaceholders(letReduced, parseOptions, normalized);
  if (repeatResolved instanceof ParseFailure) {
    return repeatResolved;
  }
  parsed.value = repeatResolved;
  const placeholderNode = findFirstPlaceholderNode(parsed.value);
  if (placeholderNode) {
    const span = placeholderNode.span ?? normalized.createSpan(0, 0);
    return new ParseFailure({
      ctor: 'PlaceholderVar',
      message: `Placeholder variable "${placeholderNode.name}" is only allowed inside comp(...)`,
      severity: ParseSeverity.error,
      expected: 'comp(...) placeholder usage',
      span,
      input: span.input || normalized,
    });
  }
  return parsed;
}

export function parseFormulaToAST(source, options) {
  const result = parseFormulaInput(source, options);
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
  setBindingParser,
  bindingIdentifierParser,
  identifierReferenceParser,
  setKeyword,
  inKeyword,
  setEqualsLiteral,
  expressionParser,
  letBindingParser,
  letKeyword,
  letEqualsLiteral,
};
