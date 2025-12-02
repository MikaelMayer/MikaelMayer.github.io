import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateFormulaSource,
  defaultFormulaSource,
  VarZ,
  VarX,
  VarY,
  Offset,
  Offset2,
  Add,
  Compose,
  Const,
  Pow,
  Exp,
  Sin,
  Cos,
  Ln,
  oo,
  LessThan,
  If,
  buildFragmentSourceFromAST,
} from './core-engine.mjs';

const EPSILON = 1e-9;

function approxEqual(a, b) {
  return Math.abs(a - b) < EPSILON;
}

test('default formula parses into a multiplication AST', () => {
  const ast = evaluateFormulaSource(defaultFormulaSource);
  assert.equal(ast.kind, 'Mul');
  assert.equal(ast.left.kind, 'Sub');
  assert.equal(ast.right.kind, 'Op');
});

test('Compose nodes wrap inner functions correctly', () => {
  const composed = Compose(Add(VarZ(), Offset()), Const(1, 0));
  assert.equal(composed.kind, 'Compose');
  assert.equal(composed.f.kind, 'Add');
  assert.equal(composed.g.kind, 'Const');
  assert.equal(composed.f.left.kind, 'Var');
});

test('oo composes a function multiple times', () => {
  const base = Add(VarZ(), Const(1, 0));
  const repeated = oo(base, 3);
  assert.equal(repeated.kind, 'Compose');
  assert.equal(repeated.f.kind, 'Compose');
  assert.equal(repeated.g, base);
  assert.equal(repeated.f.f, base);
  assert.equal(repeated.f.g, base);
});

test('fragment generator embeds node functions and top entry', () => {
  const ast = Add(Const(1, 0), Const(0, 1));
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /vec2 node\d+\(vec2 z\)/);
  assert.match(fragment, /vec2 f\(vec2 z\)/);
  assert.match(fragment, /return node\d+\(z\);/);
});

test('Pow nodes emit exponentiation by squaring and allow negatives', () => {
  const ast = Pow(Const(1, 0), -3);
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /pow_step_0/);
  assert.match(fragment, /c_inv/);
});

test('Offset2 nodes read from the secondary offset uniform', () => {
  const ast = Offset2();
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /uniform vec2 u_offset2;/);
  assert.match(fragment, /return u_offset2;/);
});

test('VarX and VarY nodes project components', () => {
  const ast = Add(VarX(), VarY());
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /return vec2\(z\.x, 0\.0\);/);
  assert.match(fragment, /return vec2\(z\.y, 0\.0\);/);
});

test('evaluateFormulaSource throws on invalid input', () => {
  assert.throws(() => evaluateFormulaSource('notAFunction('));
});

// simple numeric sanity: Add(Const(1,0), Const(2,0)) -> ensure constants captured

test('constant nodes retain numeric payload', () => {
  const ast = evaluateFormulaSource('Add(Const(1.5, -2.5), Const(-0.5, 2.5))');
  assert.equal(ast.kind, 'Add');
  assert.ok(approxEqual(ast.left.re, 1.5));
  assert.ok(approxEqual(ast.left.im, -2.5));
  assert.ok(approxEqual(ast.right.re, -0.5));
  assert.ok(approxEqual(ast.right.im, 2.5));
});

test('elementary functions emit the dedicated helpers', () => {
  const ast = Exp(Sin(Cos(Ln(VarZ()))));
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /c_ln/);
  assert.match(fragment, /c_cos/);
  assert.match(fragment, /c_sin/);
  assert.match(fragment, /c_exp/);
});

test('LessThan nodes compare real parts and emit boolean constants', () => {
  const ast = LessThan(Const(1, 0), Const(0, 0));
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /a\.x < b\.x/);
  assert.match(fragment, /vec2\(flag, 0\.0\)/);
});

test('If nodes mix branches based on non-zero condition', () => {
  const ast = If(Const(1, 0), Const(2, 0), Const(3, 0));
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /vec2 cond =/);
  assert.match(fragment, /mix\(elseValue, thenValue, selector\)/);
});
