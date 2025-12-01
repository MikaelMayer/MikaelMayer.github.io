import {
  ParserInput,
  ParseSuccess,
  ParseFailure,
  ParseSeverity,
} from './parser-primitives.mjs';

const INTERNAL_IMPL = Symbol('reflex4you.parser.impl');
const parserPrototype = Object.create(Function.prototype);

function normalizeInput(input) {
  return input instanceof ParserInput ? input : ParserInput.from(input);
}

function ensureParser(candidate, label = 'parser') {
  if (typeof candidate === 'function' && candidate[INTERNAL_IMPL]) {
    return candidate;
  }
  throw new TypeError(`Expected ${label} created via createParser/Combinator.`);
}

function spanBetween(startInput, endInput) {
  return startInput.createSpan(0, startInput.length - endInput.length);
}

function makeSuccess(ctor, startInput, endInput, value, severity = ParseSeverity.info) {
  const span = spanBetween(startInput, endInput);
  return new ParseSuccess({ ctor, value, span, next: endInput, severity });
}

function makeFailure({
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
    message: message || '',
    severity,
    expected,
    span: resolvedSpan,
    input: resolvedSpan.input,
    children: [...children],
  });
}

function attachParserPrototype(fn) {
  Object.setPrototypeOf(fn, parserPrototype);
  return fn;
}

export function createParser(ctor, impl) {
  if (typeof impl !== 'function') {
    throw new TypeError('createParser expects an implementation function.');
  }
  function parser(value) {
    const normalized = normalizeInput(value);
    return impl(normalized);
  }
  parser.ctor = ctor;
  parser[INTERNAL_IMPL] = impl;
  parser.displayName = ctor;
  parser.parse = parser;
  parser.run = parser;
  parser.runNormalized = (input) => impl(normalizeInput(input));
  return attachParserPrototype(parser);
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

parserPrototype.Concat = function methodConcat(other, options) {
  return Concat(this, other, options);
};

parserPrototype.Then = parserPrototype.Concat;

parserPrototype.Many = function methodMany(options) {
  return Many(this, options);
};

parserPrototype.Optional = function methodOptional(defaultValue = null, options) {
  return Optional(this, defaultValue, options);
};

parserPrototype.Label = function methodLabel(expected, message, options) {
  if (typeof expected === 'object' && expected !== null) {
    return Label(this, undefined, undefined, expected);
  }
  return Label(this, expected, message, options);
};

parserPrototype.Sequence = function methodSequence(parsers, options) {
  return Sequence([this, ...parsers], options);
};

export function Succeed(value, { ctor = 'Succeed' } = {}) {
  return createParser(ctor, (input) => makeSuccess(ctor, input, input, value));
}

export function Fail(message, { ctor = 'Fail', severity = ParseSeverity.error, expected = null } = {}) {
  return createParser(ctor, (input) =>
    makeFailure({ ctor, input, message, severity, expected })
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
    return new ParseSuccess({
      ctor,
      value: mapped,
      span: result.span,
      next: result.next,
      severity: result.severity,
    });
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
    const tailParser = ensureParser(nextFactory(head.value, head), 'chain continuation');
    const tail = tailParser.runNormalized(head.next);
    if (!tail.ok) {
      return tail;
    }
    return makeSuccess(ctor, input, tail.next, tail.value, tail.severity);
  });
}

export function Concat(left, right, { ctor = 'Concat', projector, span = 'full' } = {}) {
  const first = ensureParser(left, 'left parser');
  const second = ensureParser(right, 'right parser');
  const combine = typeof projector === 'function' ? projector : (a, b) => [a, b];

  function selectSpanStart(mode, initialInput, rightInput) {
    switch (mode) {
      case 'full':
      case 'left':
        return initialInput;
      case 'right':
        return rightInput;
      default:
        throw new RangeError(`Unknown span mode "${mode}"`);
    }
  }

  return createParser(ctor, (input) => {
    const leftResult = first.runNormalized(input);
    if (!leftResult.ok) {
      return leftResult;
    }
    const rightInput = leftResult.next;
    const rightResult = second.runNormalized(rightInput);
    if (!rightResult.ok) {
      return rightResult;
    }
    const value = combine(leftResult.value, rightResult.value, leftResult, rightResult);
    const spanStart = selectSpanStart(span, input, rightInput);
    return makeSuccess(ctor, spanStart, rightResult.next, value);
  });
}

export function Sequence(parsers, { ctor = 'Sequence', projector } = {}) {
  if (!Array.isArray(parsers) || parsers.length === 0) {
    throw new TypeError('Sequence expects an array with at least one parser.');
  }
  const normalized = parsers.map((parser, idx) => ensureParser(parser, `sequence[${idx}]`));
  return createParser(ctor, (input) => {
    const values = [];
    const results = [];
    let current = input;
    for (const parser of normalized) {
      const result = parser.runNormalized(current);
      if (!result.ok) {
        return result;
      }
      values.push(result.value);
      results.push(result);
      current = result.next;
    }
    const combined = typeof projector === 'function' ? projector(values, results) : values;
    return makeSuccess(ctor, input, current, combined);
  });
}

export function Or(left, right, { ctor = 'Or' } = {}) {
  const first = ensureParser(left, 'left parser');
  const second = ensureParser(right, 'right parser');
  return createParser(ctor, (input) => {
    const leftResult = first.runNormalized(input);
    if (leftResult.ok) {
      return leftResult;
    }
    const rightResult = second.runNormalized(input);
    if (rightResult.ok) {
      return rightResult;
    }
    const leftSpan = leftResult.span;
    const rightSpan = rightResult.span;
    const span =
      !leftSpan || !rightSpan
        ? leftSpan || rightSpan
        : leftSpan.end >= rightSpan.end
          ? leftSpan
          : rightSpan;
    const severity =
      leftResult.severity === ParseSeverity.error || rightResult.severity === ParseSeverity.error
        ? ParseSeverity.error
        : leftResult.severity === ParseSeverity.recoverable || rightResult.severity === ParseSeverity.recoverable
          ? ParseSeverity.recoverable
          : ParseSeverity.info;
    return makeFailure({
      ctor,
      input,
      severity,
      message: 'No alternatives matched.',
      children: [leftResult, rightResult],
      span,
    });
  });
}

export function Choice(parsers, { ctor = 'Choice' } = {}) {
  if (!Array.isArray(parsers) || parsers.length === 0) {
    throw new TypeError('Choice requires at least one parser.');
  }
  return parsers.slice(1).reduce(
    (acc, parser, idx) => Or(acc, ensureParser(parser, `choice[${idx + 1}]`), { ctor }),
    ensureParser(parsers[0], 'choice[0]'),
  );
}

export function Many(parser, { min = 0, max = Infinity, ctor = 'Many' } = {}) {
  const base = ensureParser(parser, 'Many source');
  if (min < 0) {
    throw new RangeError('Many requires min >= 0');
  }
  if (!Number.isFinite(max) || max < min) {
    throw new RangeError('Many requires max >= min and finite.');
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
      return makeFailure({
        ctor,
        input,
        message: `Expected at least ${min} repetitions`,
        severity: ParseSeverity.recoverable,
        expected: `${base.ctor}×${min}`,
      });
    }
    return makeSuccess(ctor, input, current, values);
  });
}

export function Optional(parser, defaultValue = null, { ctor = 'Optional' } = {}) {
  const base = ensureParser(parser, 'Optional source');
  return createParser(ctor, (input) => {
    const result = base.runNormalized(input);
    if (result.ok) {
      return result;
    }
    return makeSuccess(ctor, input, input, defaultValue);
  });
}

export function Label(parser, expected, message, { ctor = 'Label', severity = ParseSeverity.recoverable } = {}) {
  const base = ensureParser(parser, 'Label source');
  const expectation = expected ?? message ?? base.ctor;
  return createParser(ctor, (input) => {
    const result = base.runNormalized(input);
    if (result.ok) {
      return result;
    }
    return makeFailure({
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

export function Literal(text, { ctor = `Literal(${text})`, caseSensitive = true } = {}) {
  if (!text) {
    throw new TypeError('Literal parser requires non-empty text.');
  }
  const reference = caseSensitive ? text : text.toLowerCase();
  return createParser(ctor, (input) => {
    if (input.length < text.length) {
      return makeFailure({
        ctor,
        input,
        message: `Expected "${text}"`,
        severity: ParseSeverity.recoverable,
        expected: text,
      });
    }
    let matches = true;
    for (let i = 0; i < text.length; i += 1) {
      const candidate = input.buffer[input.start + i];
      const normalized = caseSensitive ? candidate : candidate.toLowerCase();
      if (normalized !== reference[i]) {
        matches = false;
        break;
      }
    }
    if (!matches) {
      return makeFailure({
        ctor,
        input,
        message: `Expected "${text}"`,
        severity: ParseSeverity.recoverable,
        expected: text,
      });
    }
    const next = input.advance(text.length);
    return makeSuccess(ctor, input, next, text);
  });
}

function ensureStickyRegex(source) {
  const flags = source.flags.includes('y') ? source.flags : `${source.flags}y`;
  const unique = Array.from(new Set(flags.split(''))).join('');
  return new RegExp(source.source, unique);
}

export function Regex(regex, { ctor = 'Regex', transform, allowEmpty = false } = {}) {
  if (!(regex instanceof RegExp)) {
    throw new TypeError('Regex expects a RegExp instance.');
  }
  const sticky = ensureStickyRegex(regex);
  return createParser(ctor, (input) => {
    sticky.lastIndex = input.start;
    const matches = sticky.exec(input.buffer);
    if (!matches || matches.index !== input.start) {
      return makeFailure({
        ctor,
        input,
        message: `Expected pattern ${regex}`,
        severity: ParseSeverity.recoverable,
        expected: regex.toString(),
      });
    }
    if (!allowEmpty && matches[0].length === 0) {
      return makeFailure({
        ctor,
        input,
        message: `Pattern ${regex} cannot match empty input`,
        severity: ParseSeverity.recoverable,
        expected: regex.toString(),
      });
    }
    const next = input.advance(matches[0].length);
    const value = typeof transform === 'function' ? transform(matches) : matches[0];
    return makeSuccess(ctor, input, next, value);
  });
}

export function WS({ ctor = 'WS' } = {}) {
  return Regex(/[ \t\r\n]*/y, { ctor, allowEmpty: true, transform: (match) => match[0] });
}

export function WS1({ ctor = 'WS1' } = {}) {
  return Regex(/[ \t\r\n]+/y, { ctor, allowEmpty: false, transform: (match) => match[0] });
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
      return makeFailure({
        ctor,
        input,
        message: `Expected ${description}`,
        severity: ParseSeverity.recoverable,
        expected: description,
      });
    }
    const ch = input.peek();
    if (!predicate(ch)) {
      return makeFailure({
        ctor,
        input,
        message: `Unexpected "${ch}"`,
        severity: ParseSeverity.recoverable,
        expected: description,
      });
    }
    const next = input.advance(1);
    return makeSuccess(ctor, input, next, ch);
  });
}

export function anyChar({ ctor = 'AnyChar' } = {}) {
  return charWhere(() => true, { ctor, description: 'any character' });
}
