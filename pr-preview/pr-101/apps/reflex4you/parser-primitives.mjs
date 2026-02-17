export const ParseSeverity = Object.freeze({
  info: 'info',
  recoverable: 'recoverable',
  error: 'error',
});

export class ParseSpan {
  constructor(input, start, end) {
    if (!input) {
      throw new TypeError('ParseSpan requires an originating input reference.');
    }
    if (start > end) {
      throw new RangeError('ParseSpan start must be <= end.');
    }
    this.input = input;
    this.start = start;
    this.end = end;
  }

  static fromRelative(input, relativeStart, relativeEnd) {
    const spanStart = input.start + relativeStart;
    const spanEnd = input.start + relativeEnd;
    return new ParseSpan(input.root ?? input, spanStart, spanEnd);
  }

  get length() {
    return this.end - this.start;
  }

  text() {
    return this.input.buffer.slice(this.start, this.end);
  }
}

export class ParserInput {
  constructor(source, start = 0, end = source.length, root = null) {
    if (typeof source !== 'string') {
      throw new TypeError('ParserInput source must be a string.');
    }
    if (start < 0 || end < start || end > source.length) {
      throw new RangeError('ParserInput start/end are out of bounds.');
    }
    this.buffer = source;
    this.start = start;
    this.end = end;
    this.root = root ?? this;
  }

  static from(value) {
    if (value instanceof ParserInput) {
      return value;
    }
    return new ParserInput(String(value ?? ''));
  }

  get length() {
    return this.end - this.start;
  }

  isEmpty() {
    return this.length === 0;
  }

  peek(offset = 0) {
    const idx = this.start + offset;
    if (idx < this.start || idx >= this.end) {
      return null;
    }
    return this.buffer[idx];
  }

  charCodeAt(offset = 0) {
    const idx = this.start + offset;
    if (idx < this.start || idx >= this.end) {
      return undefined;
    }
    return this.buffer.charCodeAt(idx);
  }

  advance(count) {
    if (count < 0 || count > this.length) {
      throw new RangeError('Cannot advance past input bounds.');
    }
    if (count === 0) {
      return this;
    }
    return new ParserInput(this.buffer, this.start + count, this.end, this.root);
  }

  slice(relativeStart = 0, relativeEnd = this.length) {
    if (relativeStart < 0 || relativeEnd < relativeStart || relativeEnd > this.length) {
      throw new RangeError('Slice range is invalid for this ParserInput.');
    }
    if (relativeStart === 0 && relativeEnd === this.length) {
      return this;
    }
    const absoluteStart = this.start + relativeStart;
    const absoluteEnd = this.start + relativeEnd;
    return new ParserInput(this.buffer, absoluteStart, absoluteEnd, this.root);
  }

  createSpan(relativeStart = 0, relativeEnd = relativeStart) {
    if (relativeStart < 0 || relativeEnd < relativeStart || relativeEnd > this.length) {
      throw new RangeError('Span range is invalid for this ParserInput.');
    }
    return ParseSpan.fromRelative(this, relativeStart, relativeEnd);
  }

  toString() {
    return this.buffer.slice(this.start, this.end);
  }

  toJSON() {
    return {
      text: this.toString(),
      start: this.start,
      end: this.end,
    };
  }
}

class ParseResultBase {
  constructor({ ctor, severity, span, input }) {
    if (!ctor) {
      throw new TypeError('Parse results require a ctor identifier.');
    }
    this.ctor = ctor;
    this.severity = severity;
    this.span = span || null;
    this.input = input || (span ? span.input : null);
  }
}

export class ParseSuccess extends ParseResultBase {
  constructor({ ctor, value, span, next, severity = ParseSeverity.info, input }) {
    super({ ctor, severity, span, input });
    this.ok = true;
    this.value = value;
    this.next = next || null;
  }
}

export class ParseFailure extends ParseResultBase {
  constructor({
    ctor,
    message,
    severity = ParseSeverity.error,
    span,
    input,
    expected = null,
    children = [],
  }) {
    super({ ctor, severity, span, input });
    this.ok = false;
    this.message = message || '';
    this.expected = expected;
    this.children = [...children];
  }

  addChild(childFailure) {
    if (childFailure instanceof ParseFailure) {
      this.children.push(childFailure);
    }
    return this;
  }
}
