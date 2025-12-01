import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFormulaInput,
  parseFormulaToAST,
} from './arithmetic-parser.mjs';

test('parses additive and multiplicative precedence', () => {
  const result = parseFormulaInput('1 + 2 * 3');
  assert.equal(result.ok, true);
  const ast = result.value;
  assert.equal(ast.kind, 'Add');
  assert.equal(ast.left.kind, 'Const');
  assert.equal(ast.right.kind, 'Mul');
  assert.equal(ast.right.left.kind, 'Const');
  assert.equal(ast.right.right.kind, 'Const');
});

test('parses imaginary literals and shorthand i', () => {
  const result = parseFormulaInput('-i');
  assert.equal(result.ok, true);
  const node = result.value;
  assert.equal(node.kind, 'Const');
  assert.equal(node.re, 0);
  assert.equal(node.im, -1);
});

test('parses primitives z, x, y, F1', () => {
  const result = parseFormulaInput('x + y + z + F1');
  assert.equal(result.ok, true);
  const add = result.value;
  assert.equal(add.kind, 'Add');
  assert.equal(add.left.kind, 'Add');
  assert.equal(add.right.kind, 'Offset');
});

test('parses F2 primitive', () => {
  const result = parseFormulaInput('F2 + 1');
  assert.equal(result.ok, true);
  assert.equal(result.value.left.kind, 'Offset2');
});

test('parses function composition forms', () => {
  const result = parseFormulaInput('o(z, F1) $ (z + 1)');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Compose');
  assert.equal(result.value.f.kind, 'Compose');
});

test('parses oo(...) shorthand for repeated composition', () => {
  const result = parseFormulaInput('oo(z + 1, 3)');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Compose');
});

test('$$ postfix binds tighter than $', () => {
  const result = parseFormulaInput('z $$ 2 $ F1');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Compose');
  assert.equal(result.value.g.kind, 'Offset');
  assert.equal(result.value.f.kind, 'Compose');
});

test('$$ requires positive integer counts', () => {
  const result = parseFormulaInput('z $$ 0');
  assert.equal(result.ok, false);
  assert.match(result.message, /positive integer/i);
});

test('parseFormulaToAST throws on invalid formula', () => {
  assert.throws(() => parseFormulaToAST('('), {
    name: 'SyntaxError',
  });
});

test('parseFormulaInput rejects trailing input', () => {
  const result = parseFormulaInput('1 2');
  assert.equal(result.ok, false);
  assert.equal(result.expected, 'end of formula');
});
