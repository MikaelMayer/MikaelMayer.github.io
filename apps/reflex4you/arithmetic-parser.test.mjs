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
  assert.equal(add.right.kind, 'FingerOffset');
  assert.equal(add.right.slot, 'F1');
});

test('parses power operator with integer exponent', () => {
  const result = parseFormulaInput('z ^ 3');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Pow');
  assert.equal(result.value.exponent, 3);
});

test('parses negative exponents', () => {
  const result = parseFormulaInput('z^-2');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Pow');
  assert.equal(result.value.exponent, -2);
});

test('rejects non-integer exponents', () => {
  const result = parseFormulaInput('z ^ 1.5');
  assert.equal(result.ok, false);
  assert.match(result.message, /exponent must be an integer/i);
});

test('parses exp/sin/cos/ln calls', () => {
  const result = parseFormulaInput('exp(sin(cos(ln(z))))');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Exp');
  assert.equal(result.value.value.kind, 'Sin');
});

test('parses tan and atan calls', () => {
  const result = parseFormulaInput('tan(atan(z))');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Tan');
  assert.equal(result.value.value.kind, 'Atan');
});

test('parses atan2 calls with two arguments', () => {
  const result = parseFormulaInput('atan2(y, x)');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Atan2');
  assert.equal(result.value.left.kind, 'VarY');
  assert.equal(result.value.right.kind, 'VarX');
});

test('parses F2 primitive', () => {
  const result = parseFormulaInput('F2 + 1');
  assert.equal(result.ok, true);
  assert.equal(result.value.left.kind, 'FingerOffset');
  assert.equal(result.value.left.slot, 'F2');
});

test('parses additional finger primitives', () => {
  const result = parseFormulaInput('F3 + D2 + D3');
  assert.equal(result.ok, true);
  const add = result.value;
  assert.equal(add.kind, 'Add');
  assert.equal(add.left.kind, 'Add');
  assert.equal(add.left.left.kind, 'FingerOffset');
  assert.equal(add.left.left.slot, 'F3');
  assert.equal(add.left.right.kind, 'FingerOffset');
  assert.equal(add.left.right.slot, 'D2');
  assert.equal(add.right.kind, 'FingerOffset');
  assert.equal(add.right.slot, 'D3');
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
  assert.equal(result.value.g.kind, 'FingerOffset');
  assert.equal(result.value.g.slot, 'F1');
  assert.equal(result.value.f.kind, 'Compose');
});

test('$$ requires positive integer counts', () => {
  const result = parseFormulaInput('z $$ 0');
  assert.equal(result.ok, false);
  assert.match(result.message, /positive integer/i);
});

test('parses less-than comparisons using real parts', () => {
  const result = parseFormulaInput('(z $ F1) < 0');
  assert.equal(result.ok, true);
  const node = result.value;
  assert.equal(node.kind, 'LessThan');
  assert.equal(node.left.kind, 'Compose');
  assert.equal(node.right.kind, 'Const');
});

test('parses the remaining comparison operators', () => {
  const gt = parseFormulaInput('x > y');
  assert.equal(gt.ok, true);
  assert.equal(gt.value.kind, 'GreaterThan');

  const ge = parseFormulaInput('x >= y');
  assert.equal(ge.ok, true);
  assert.equal(ge.value.kind, 'GreaterThanOrEqual');

  const le = parseFormulaInput('x <= y');
  assert.equal(le.ok, true);
  assert.equal(le.value.kind, 'LessThanOrEqual');

  const eq = parseFormulaInput('x == y');
  assert.equal(eq.ok, true);
  assert.equal(eq.value.kind, 'Equal');
});

test('parses logical and/or with correct precedence', () => {
  const result = parseFormulaInput('x < y && y < z || z == x');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'LogicalOr');
  assert.equal(result.value.left.kind, 'LogicalAnd');
  assert.equal(result.value.left.left.kind, 'LessThan');
  assert.equal(result.value.left.right.kind, 'LessThan');
  assert.equal(result.value.right.kind, 'Equal');
});

test('parses abs() calls as unary functions', () => {
  const result = parseFormulaInput('abs(z)');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Abs');
  assert.equal(result.value.value.kind, 'Var');
});

test('parses if expressions with embedded comparisons', () => {
  const result = parseFormulaInput('if(x < y, x + 1, y + 2)');
  assert.equal(result.ok, true);
  const node = result.value;
  assert.equal(node.kind, 'If');
  assert.equal(node.condition.kind, 'LessThan');
  assert.equal(node.thenBranch.kind, 'Add');
  assert.equal(node.elseBranch.kind, 'Add');
});

test('set bindings produce scoped nodes with shared slots', () => {
  const result = parseFormulaInput('set foo = x + 1 in foo * foo');
  assert.equal(result.ok, true);
  const ast = result.value;
  assert.equal(ast.kind, 'SetBinding');
  assert.equal(ast.name, 'foo');
  assert.equal(ast.value.kind, 'Add');
  assert.equal(ast.body.kind, 'Mul');
  assert.equal(ast.body.left.kind, 'SetRef');
  assert.equal(ast.body.right.kind, 'SetRef');
  assert.strictEqual(ast.body.left.binding, ast);
  assert.strictEqual(ast.body.right.binding, ast);
});

test('set bindings associate weaker than $$ and $', () => {
  const result = parseFormulaInput('set f = z $$ 2 in f $ f');
  assert.equal(result.ok, true);
  const ast = result.value;
  assert.equal(ast.kind, 'SetBinding');
  assert.equal(ast.value.kind, 'Compose');
  assert.equal(ast.body.kind, 'Compose');
  assert.equal(ast.body.f.kind, 'SetRef');
  assert.equal(ast.body.g.kind, 'SetRef');
});

test('set bindings can reference and shadow earlier names', () => {
  const result = parseFormulaInput('set a = 1 in set a = a + 1 in a');
  assert.equal(result.ok, true);
  const outer = result.value;
  assert.equal(outer.kind, 'SetBinding');
  assert.equal(outer.name, 'a');
  const inner = outer.body;
  assert.equal(inner.kind, 'SetBinding');
  assert.equal(inner.value.kind, 'Add');
  assert.equal(inner.body.kind, 'SetRef');
  assert.strictEqual(inner.body.binding, inner);
});

test('set binding rejects reserved identifiers', () => {
  const result = parseFormulaInput('set x = 1 in x + 1');
  assert.equal(result.ok, false);
  assert.match(result.message, /reserved identifier/i);
});

test('referencing undefined variables is rejected', () => {
  const result = parseFormulaInput('foo + 1');
  assert.equal(result.ok, false);
  assert.match(result.message, /unknown variable/i);
});

test('top-level let inlines its right-hand side in the body', () => {
  const result = parseFormulaInput('let f = z + 1 in f $ f');
  assert.equal(result.ok, true);
  const ast = result.value;
  assert.equal(ast.kind, 'Compose');
  assert.equal(ast.f.kind, 'Add');
  assert.equal(ast.g.kind, 'Add');
});

test('nested let bindings are rejected', () => {
  const result = parseFormulaInput('set a = let f = z in f in a');
  assert.equal(result.ok, false);
  assert.match(result.message, /top level/i);
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

test('parses constant j shorthand', () => {
  const result = parseFormulaInput('j');
  assert.equal(result.ok, true);
  const node = result.value;
  assert.equal(node.kind, 'Const');
  assert.equal(node.re, -0.5);
  assert.ok(Math.abs(node.im - Math.sqrt(3) / 2) < 1e-9);
});

test('parses conj() calls as conjugate nodes', () => {
  const result = parseFormulaInput('conj(z)');
  assert.equal(result.ok, true);
  const node = result.value;
  assert.equal(node.kind, 'Conjugate');
  assert.equal(node.value.kind, 'Var');
});

test('comp(...) expands iterative compositions', () => {
  const result = parseFormulaInput('comp(v^2+z, v, 0, 2)');
  assert.equal(result.ok, true);
  const ast = result.value;
  assert.equal(ast.kind, 'Add');
  assert.equal(ast.left.kind, 'Pow');
  assert.equal(ast.left.base.kind, 'Add');
  assert.equal(ast.left.exponent, 2);
  assert.equal(ast.left.base.right.kind, 'Var');
  assert.equal(ast.right.kind, 'Var');
});

test('comp with zero iterations returns the seed expression', () => {
  const result = parseFormulaInput('comp(v+1, v, z, 0)');
  assert.equal(result.ok, true);
  const ast = result.value;
  assert.equal(ast.kind, 'Var');
});

test('standalone iteration variables are rejected', () => {
  const result = parseFormulaInput('v + 1');
  assert.equal(result.ok, false);
  assert.match(result.message, /comp/i);
});
