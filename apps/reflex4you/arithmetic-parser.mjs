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
  Ln,
  Abs,
  Conjugate,
  oo,
  If,
  FingerOffset,
  SetBindingNode,
  SetRef,
} from './core-engine.mjs';

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

const FINGER_TOKENS = ['F1', 'F2', 'F3', 'D1', 'D2', 'D3'];

const fingerLiteralParsers = FINGER_TOKENS.map((label) =>
  keywordLiteral(label, { ctor: `Finger(${label})` }).Map((_, result) => withSpan(FingerOffset(label), result.span)),
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
  'ln',
  'abs',
  'conj',
  'oo',
  'comp',
  'o',
  'x',
  'y',
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
  keywordLiteral('x', { ctor: 'VarX' }).Map((_, result) => withSpan(VarX(), result.span)),
  keywordLiteral('y', { ctor: 'VarY' }).Map((_, result) => withSpan(VarY(), result.span)),
  keywordLiteral('z', { ctor: 'VarZ' }).Map((_, result) => withSpan(VarZ(), result.span)),
  ...fingerLiteralParsers,
  iterationVariableLiteral,
  identifierReferenceParser,
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

const elementaryFunctionParser = Choice([
  createUnaryFunctionParser('exp', Exp),
  createUnaryFunctionParser('sin', Sin),
  createUnaryFunctionParser('cos', Cos),
  createUnaryFunctionParser('tan', Tan),
  createUnaryFunctionParser('atan', Atan),
  lnParser,
  createUnaryFunctionParser('abs', Abs),
  createUnaryFunctionParser('conj', Conjugate),
], { ctor: 'ElementaryFunction' });

const primaryParser = Choice([
  explicitRepeatComposeParser,
  compParser,
  explicitComposeParser,
  elementaryFunctionParser,
  ifParser,
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
    node = withSpan(Pow(node, suffix.value), span);
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
    case 'Pow':
      return { ...node, base: substitutePlaceholder(node.base, placeholder, replacement) };
    case 'Exp':
    case 'Sin':
    case 'Cos':
    case 'Tan':
    case 'Atan':
    case 'Abs':
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
    case 'Abs':
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
    case 'If':
      return {
        ...node,
        condition: cloneAst(node.condition),
        thenBranch: cloneAst(node.thenBranch),
        elseBranch: cloneAst(node.elseBranch),
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
    case 'Pow':
      return { ...node, base: substituteIdentifierWithClone(node.base, targetName, replacement) };
    case 'Exp':
    case 'Sin':
    case 'Cos':
    case 'Tan':
    case 'Atan':
    case 'Abs':
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
      case 'Ln':
      case 'Abs':
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
      case 'Ln':
      case 'Abs':
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
      case 'SetBinding':
        stack.push(node.value, node.body);
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
    case 'Abs':
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
  const exponentResult = numberToken.runNormalized(caret.next);
  if (!exponentResult.ok) {
    return exponentResult;
  }
  if (!Number.isInteger(exponentResult.value)) {
    return new ParseFailure({
      ctor: 'PowerSuffix',
      message: 'Exponent must be an integer',
      severity: ParseSeverity.error,
      expected: 'integer exponent',
      span: exponentResult.span,
      input: exponentResult.span.input,
    });
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
  const countResult = numberToken.runNormalized(opResult.next);
  if (!countResult.ok) {
    return countResult;
  }
  const validatedCount = validateRepeatCount(countResult.value, countResult.span);
  if (validatedCount instanceof ParseFailure) {
    return validatedCount;
  }
  return new ParseSuccess({
    ctor: 'RepeatSuffix',
    value: { count: validatedCount },
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
    node = withSpan(oo(node, suffix.value.count), span);
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
  if (letResult.severity === ParseSeverity.error) {
    return letResult;
  }
  const setResult = setBindingParser.runNormalized(input);
  if (setResult.ok) {
    return setResult;
  }
  if (setResult.severity === ParseSeverity.error) {
    return setResult;
  }
  return logicalOrParser.runNormalized(input);
});

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
  const letReduced = eliminateTopLevelLets(parsed.value, normalized);
  if (letReduced instanceof ParseFailure) {
    return letReduced;
  }
  const resolveError = resolveSetReferences(letReduced, normalized);
  if (resolveError instanceof ParseFailure) {
    return resolveError;
  }
  parsed.value = letReduced;
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
