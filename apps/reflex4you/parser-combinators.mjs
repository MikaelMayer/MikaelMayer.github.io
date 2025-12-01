import {
  ParserInput,
  ParseSuccess,
  ParseFailure,
  ParseSeverity,
} from './parser-primitives.mjs';

// Utilities inspired by Dafny's parser modules: parsers are callable functions
// that also expose builder-style helpers (e.g., p.Or(q)) in addition to the
// standalone Or(p, q) helpers below.

const severityRank = {
  [ParseSeverity.info]: 0,
  [ParseSeverity.recoverable]: 1,
  [ParseSeverity.error]: 2,
};

const INTERNAL_IMPL = Symbol('reflex4you.parser.impl');

const parserPrototype = Object.create(Function.prototype);

function ensureParser(candidate, label = 'parser') {
  if (typeof candidate === 'function' && candidate[INTERNAL_IMPL]) {
    return candidate;
  }
  throw new TypeError(`Expected ${label} created via createParser/Combinator.`);
}

function normalizeInput(input) {
  return input instanceof ParserInput ? input : ParserInput.from(input);
}

function success({ ctor, value, input, next, severity = ParseSeverity.info }) {
  const consumed = input.length - next.length;
  const span = input.createSpan(0, consumed);
  return new ParseSuccess({ ctor, value, span, next, severity });
}

function failure({
  ctor,
  input,
  message,
  severity = ParseSeverity.error,
  expected = null,
  span = null,
  children = [],
}) {
  const resolvedSpan = span ?? input.createSpan(0, 0);
  return new ParseFailure({
    ctor,
    message,
    severity,
    expected,
    span: resolvedSpan,
    input: input.root ?? input,
    children,
  });
}

function maxSeverity(a, b) {
  return severityRank[a] >= severityRank[b] ? a : b;
}

function attachParserHelpers(fn) {
  Object.setPrototypeOf(fn, parserPrototype);
  return fn;
}

export function createParser(ctor, impl) {
  if (typeof impl !== 'function') {
    throw new TypeError('createParser expects an implementation function.');
  }
  const parser = function run(input) {
    const normalized = normalizeInput(input);
    return impl(normalized);
  };
  parser.ctor = ctor;
  parser[INTERNAL_IMPL] = impl;
  parser.displayName = ctor;
  parser.parse = parser;
  parser.run = parser;
  parser.runNormalized = (input) => impl(input);
  return attachParserHelpers(parser);
}

parserPrototype.runNormalized = function runNormalized(input) {
  return this[INTERNAL_IMPL](normalizeInput(input));
};

parserPrototype.Or = function methodOr(other, options) {
  return Or(this, other, options);
};

parserPrototype.Map = function methodMap(mapper, options) {
  return Map(this, mapper, options);
};

parserPrototype.Chain = function methodChain(nextFactory, options) {
  return Chain(this, nextFactory, options);
};

parserPrototype.Then = function methodThen(next, options) {
  return Then(this, next, options);
};

parserPrototype.Many = function methodMany(options) {
  return Many(this, options);
};

parserPrototype.Optional = function methodOptional(defaultValue = null, options) {
  return Optional(this, defaultValue, options);
};

parserPrototype.Label = function methodLabel(expected, message, options) {
  return Label(this, expected, message, options);
};

export function Succeed(value, ctor = 'Succeed') {
  return createParser(ctor, (input) =>
    success({ ctor, value, input, next: input })
  );
}

export function Fail(message, { ctor = 'Fail', severity = ParseSeverity.error, expected = null } = {}) {
  return createParser(ctor, (input) =>
    failure({ ctor, input, message, severity, expected })
  );
}

export function Map(parser, mapper, { ctor = 'Map' } = {}) {
  const base = ensureParser(parser, 'mapper source');
  if (typeof mapper !== 'function') {
    throw new TypeError('Map requires a mapper function.');
  }
  return createParser(ctor, (input) => {
    const result = base.runNormalized(input);
    if (!result.ok) {
      return result;
    }
    const mapped = mapper(result.value, result);
    return success({ ctor, value: mapped, input, next: result.next });
  });
}

export function Chain(parser, nextFactory, { ctor = 'Chain' } = {}) {
  const base = ensureParser(parser, 'chain source');
  if (typeof nextFactory !== 'function') {
    throw new TypeError('Chain requires a factory that returns a parser.');
  }
  return createParser(ctor, (input) => {
    const head = base.runNormalized(input);
    if (!head.ok) {
      return head;
    }
    const nextParser = ensureParser(nextFactory(head.value, head), 'chain continuation');
    const tail = nextParser.runNormalized(head.next);
    if (!tail.ok) {
      return tail;
    }
    return success({ ctor, value: tail.value, input, next: tail.next });
  });
}

export function Then(left, right, { ctor = 'Then', projector } = {}) {
  const first = ensureParser(left, 'left parser');
  const second = ensureParser(right, 'right parser');
  const projectValue =
    typeof projector === 'function' ? projector : (a, b) => [a, b];
  return createParser(ctor, (input) => {
    const leftResult = first.runNormalized(input);
    if (!leftResult.ok) {
      return leftResult;
    }
    const rightResult = second.runNormalized(leftResult.next);
    if (!rightResult.ok) {
      return rightResult;
    }
    const combinedValue = projectValue(
      leftResult.value,
      rightResult.value,
      leftResult,
      rightResult,
    );
    return success({ ctor, value: combinedValue, input, next: rightResult.next });
  });
}

export function Or(left, right, { ctor = 'Or' } = {}) {
  const first = ensureParser(left, 'left option');
  const second = ensureParser(right, 'right option');
  return createParser(ctor, (input) => {
    const leftResult = first.runNormalized(input);
    if (leftResult.ok) {
      return leftResult;
    }
    const rightResult = second.runNormalized(input);
    if (rightResult.ok) {
      return rightResult;
    }
    const bestSpan =
      !leftResult.span || !rightResult.span
        ? leftResult.span || rightResult.span
        : leftResult.span.end >= rightResult.span.end
          ? leftResult.span
          : rightResult.span;
    const mergedSeverity = maxSeverity(leftResult.severity, rightResult.severity);
    return failure({
      ctor,
      input,
      severity: mergedSeverity,
      message: 'No alternatives matched.',
      expected: null,
      span: bestSpan,
      children: [leftResult, rightResult],
    });
  });
}

export function Many(parser, { min = 0, max = Infinity, ctor = 'Many' } = {}) {
  const base = ensureParser(parser, 'Many source');
  if (min < 0) {
    throw new RangeError('Many requires min >= 0');
  }
  return createParser(ctor, (input) => {
    const values = [];
    let current = input;
    let count = 0;
    while (count < max) {
      const result = base.runNormalized(current);
      if (!result.ok) {
        break;
      }
      if (result.next === current) {
        throw new Error('Many parser must consume input on success to avoid infinite loops.');
      }
      values.push(result.value);
      current = result.next;
      count += 1;
    }
    if (count < min) {
      return failure({
        ctor,
        input,
        message: `Expected at least ${min} repetitions`,
        severity: ParseSeverity.recoverable,
        expected: `${parser.ctor}×${min}`,
      });
    }
    return success({ ctor, value: values, input, next: current });
  });
}

export function Optional(parser, defaultValue = null, { ctor = 'Optional' } = {}) {
  const base = ensureParser(parser, 'Optional source');
  return createParser(ctor, (input) => {
    const result = base.runNormalized(input);
    if (result.ok) {
      return result;
    }
    return success({ ctor, value: defaultValue, input, next: input });
  });
}

export function Label(parser, expected, message, { ctor = 'Label', severity = ParseSeverity.recoverable } = {}) {
  const base = ensureParser(parser, 'Label source');
  const expectation = expected ?? message ?? parser.ctor;
  return createParser(ctor, (input) => {
    const result = base.runNormalized(input);
    if (result.ok) {
      return result;
    }
    return failure({
      ctor,
      input,
      message: message ?? `Expected ${expectation}`,
      severity,
      expected: expectation,
      span: result.span,
      children: [result],
    });
  });
}

export function literal(text, { ctor = `Literal(${text})`, caseSensitive = true } = {}) {
  if (!text) {
    throw new TypeError('literal parser requires non-empty text.');
  }
  const reference = caseSensitive ? text : text.toLowerCase();
  return createParser(ctor, (input) => {
    if (input.length < text.length) {
      return failure({
        ctor,
        input,
        message: `Expected "${text}"`,
        severity: ParseSeverity.recoverable,
        expected: text,
      });
    }
    let matches = true;
    for (let i = 0; i < text.length; i += 1) {
      const char = input.buffer[input.start + i];
      if ((caseSensitive ? char : char.toLowerCase()) !== reference[i]) {
        matches = false;
        break;
      }
    }
    if (!matches) {
      return failure({
        ctor,
        input,
        message: `Expected "${text}"`,
        severity: ParseSeverity.recoverable,
        expected: text,
      });
    }
    const next = input.advance(text.length);
    return success({ ctor, value: text, input, next });
  });
}

function ensureStickyRegex(source) {
  const flags = source.flags.includes('y') ? source.flags : `${source.flags}y`;
  const uniqueFlags = Array.from(new Set(flags.split(''))).join('');
  return new RegExp(source.source, uniqueFlags);
}

export function regexMatch(regex, { ctor = 'Regex', transform } = {}) {
  if (!(regex instanceof RegExp)) {
    throw new TypeError('regexMatch expects a RegExp.');
  }
  const sticky = ensureStickyRegex(regex);
  return createParser(ctor, (input) => {
    sticky.lastIndex = input.start;
    const matches = sticky.exec(input.buffer);
    if (!matches || matches.index !== input.start || matches[0].length === 0) {
      return failure({
        ctor,
        input,
        message: `Expected pattern ${regex}`,
        severity: ParseSeverity.recoverable,
        expected: regex.toString(),
      });
    }
    const value = typeof transform === 'function' ? transform(matches) : matches[0];
    const next = input.advance(matches[0].length);
    return success({ ctor, value, input, next });
  });
}

export function lazy(factory, { ctor = 'Lazy' } = {}) {
  if (typeof factory !== 'function') {
    throw new TypeError('lazy expects a factory function.');
  }
  let built = null;
  return createParser(ctor, (input) => {
    if (!built) {
      built = ensureParser(factory(), 'lazy factory result');
    }
    return built.runNormalized(input);
  });
}

export function charWhere(predicate, { ctor = 'Char', description = 'character' } = {}) {
  if (typeof predicate !== 'function') {
    throw new TypeError('charWhere expects predicate function.');
  }
  return createParser(ctor, (input) => {
    if (input.isEmpty()) {
      return failure({
        ctor,
        input,
        message: `Expected ${description}`,
        severity: ParseSeverity.recoverable,
        expected: description,
      });
    }
    const ch = input.peek();
    if (!predicate(ch)) {
      return failure({
        ctor,
        input,
        message: `Unexpected "${ch}"`,
        severity: ParseSeverity.recoverable,
        expected: description,
      });
    }
    const next = input.advance(1);
    return success({ ctor, value: ch, input, next });
  });
}

export function anyChar({ ctor = 'AnyChar' } = {}) {
  return charWhere(() => true, { ctor, description: 'any character' });
}

export function whitespace({ ctor = 'Whitespace' } = {}) {
  return regexMatch(/[ \r\n\t\f\v]+/y, { ctor });
}

export function optionalWhitespace({ ctor = 'OptionalWhitespace' } = {}) {
  return Optional(whitespace({ ctor: `${ctor}:inner` }), '', { ctor });
}

// Convenience helper for custom tokenization in the arithmetic parser.
export function consumeWhile(input, predicate) {
  let idx = 0;
  while (idx < input.length) {
    const ch = input.peek(idx);
    if (!predicate(ch)) {
      break;
    }
    idx += 1;
  }
  if (idx === 0) {
    return null;
  }
  return input.advance(idx);
}
