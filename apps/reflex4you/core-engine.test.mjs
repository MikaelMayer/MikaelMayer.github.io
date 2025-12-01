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
  oo,
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
  assert.match(fragment, /return vec2\(0\.0, z\.y\);/);
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
