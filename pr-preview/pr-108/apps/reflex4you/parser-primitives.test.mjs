import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ParserInput,
  ParseSpan,
  ParseSuccess,
  ParseFailure,
  ParseSeverity,
} from './parser-primitives.mjs';

test('ParserInput slice reuses underlying buffer without copies', () => {
  const root = new ParserInput('hello world');
  const slice = root.slice(0, 5);
  assert.equal(slice.toString(), 'hello');
  assert.equal(slice.buffer, root.buffer);
  assert.equal(slice.root, root);
  assert.equal(slice.length, 5);
});

test('ParserInput advance and span creation track absolute offsets', () => {
  const input = new ParserInput('abcdef');
  const advanced = input.advance(2);
  assert.equal(advanced.start, input.start + 2);
  assert.equal(advanced.peek(), 'c');

  const span = input.createSpan(1, 4);
  assert.equal(span.text(), 'bcd');
  assert.equal(span.start, input.start + 1);
  assert.equal(span.end, input.start + 4);
});

test('ParseSuccess carries ctor, severity, span, and remaining input', () => {
  const input = new ParserInput('xyz');
  const span = input.createSpan(0, 2);
  const next = input.advance(2);
  const success = new ParseSuccess({
    ctor: 'Literal',
    value: 42,
    span,
    next,
  });

  assert.equal(success.ok, true);
  assert.equal(success.ctor, 'Literal');
  assert.equal(success.severity, ParseSeverity.info);
  assert.equal(success.span, span);
  assert.equal(success.input, span.input);
  assert.equal(success.next, next);
  assert.equal(success.value, 42);
});

test('ParseFailure defaults to error severity and supports nesting', () => {
  const input = new ParserInput('123');
  const span = input.createSpan(2, 2); // failure at position 2
  const failure = new ParseFailure({
    ctor: 'Digit',
    message: 'Expected digit',
    span,
  });
  assert.equal(failure.ok, false);
  assert.equal(failure.severity, ParseSeverity.error);
  assert.equal(failure.children.length, 0);

  const child = new ParseFailure({
    ctor: 'Sign',
    message: 'Expected + or -',
    span,
    severity: ParseSeverity.recoverable,
  });
  failure.addChild(child);
  assert.equal(failure.children.length, 1);
  assert.equal(failure.children[0], child);
});
