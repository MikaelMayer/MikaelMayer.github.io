import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFormulaInput } from './arithmetic-parser.mjs';
import { formulaAstToLatex } from './formula-renderer.mjs';
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
  Tan,
  Atan,
  Asin,
  Acos,
  Ln,
  oo,
  FingerOffset,
  LessThan,
  GreaterThan,
  LessThanOrEqual,
  GreaterThanOrEqual,
  Equal,
  LogicalAnd,
  LogicalOr,
  If,
  Abs,
  Abs2,
  Floor,
  Conjugate,
  buildFragmentSourceFromAST,
} from './core-engine.mjs';

const EPSILON = 1e-9;

function approxEqual(a, b) {
  return Math.abs(a - b) < EPSILON;
}

test('default formula is the identity function z -> z', () => {
  const ast = evaluateFormulaSource(defaultFormulaSource);
  assert.equal(ast.kind, 'Var');
  assert.equal(ast.name, 'z');
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
  // Guard against rare GPU/driver divide-by-zero on strictly negative reals.
  assert.match(fragment, /if\s*\(re < 0\.0 && denRaw <= COLOR_MIN_DEN\)/);
});

test('buildFragmentSourceFromAST preserves set-binding identity when cloning/materializing', () => {
  const parsed = parseFormulaInput('set a = 1 in a + a');
  assert.equal(parsed.ok, true);
  const fragment = buildFragmentSourceFromAST(parsed.value);
  assert.match(fragment, /vec2 set_binding_slot_\d+;/);
  assert.doesNotMatch(fragment, /set_binding_slot_undefined/);
});

test('buildFragmentSourceFromAST does not mutate repeat-composition (ComposeMultiple) nodes', () => {
  const parsed = parseFormulaInput('sin $$ 40');
  assert.equal(parsed.ok, true);
  const ast = parsed.value;
  assert.equal(ast.kind, 'ComposeMultiple');

  const latexBefore = formulaAstToLatex(ast);
  assert.match(latexBefore, /\\circ 40/);

  // Building a shader should materialize internally, without mutating `ast`.
  buildFragmentSourceFromAST(ast);

  assert.equal(ast.kind, 'ComposeMultiple');
  const latexAfter = formulaAstToLatex(ast);
  assert.equal(latexAfter, latexBefore);
});

test('buildFragmentSourceFromAST does not silently drop legacy RepeatComposePlaceholder nodes', () => {
  // This node kind should normally be resolved during parsing, but shader generation
  // must not compile it as just the base when the count is a literal.
  const legacy = {
    kind: 'RepeatComposePlaceholder',
    base: { kind: 'Var', name: 'z' },
    countExpression: { kind: 'Const', re: 8, im: 0 },
  };
  const fragment = buildFragmentSourceFromAST(legacy);
  const matches = fragment.match(/return\s+node\d+\(node\d+\(z\)\);/g) || [];
  // oo(f, 8) produces 7 Compose wrappers in the materialized tree.
  assert.equal(matches.length, 7);
});

test('Pow nodes emit exponentiation by squaring and allow negatives', () => {
  const ast = Pow(Const(1, 0), -3);
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /pow_step_0/);
  assert.match(fragment, /c_inv/);
});

test('Offset2 nodes read from the fixed offset array', () => {
  const ast = Offset2();
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /uniform vec2 u_fixedOffsets\[2\]/);
  assert.match(fragment, /return u_fixedOffsets\[1\];/);
});

test('dynamic fingers read from the dynamic offset array', () => {
  const ast = FingerOffset('D1');
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /uniform vec2 u_dynamicOffsets\[1\]/);
  assert.match(fragment, /return u_dynamicOffsets\[0\];/);
});

test('supports sparse high-index finger uniforms', () => {
  const fixedAst = FingerOffset('F7');
  const fixedFragment = buildFragmentSourceFromAST(fixedAst);
  assert.match(fixedFragment, /uniform vec2 u_fixedOffsets\[7\]/);
  assert.match(fixedFragment, /return u_fixedOffsets\[6\];/);

  const dynamicAst = FingerOffset('D12');
  const dynamicFragment = buildFragmentSourceFromAST(dynamicAst);
  assert.match(dynamicFragment, /uniform vec2 u_dynamicOffsets\[12\]/);
  assert.match(dynamicFragment, /return u_dynamicOffsets\[11\];/);
});

test('W fingers read from the W offset array', () => {
  const ast = FingerOffset('W2');
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /uniform vec2 u_wOffsets\[2\]/);
  assert.match(fragment, /return u_wOffsets\[1\];/);
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

test('tan and atan nodes emit their helpers', () => {
  const ast = Tan(Atan(VarZ()));
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /c_tan/);
  assert.match(fragment, /c_atan/);
});

test('asin and acos nodes emit their helpers', () => {
  const ast = Asin(Acos(VarZ()));
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /c_asin/);
  assert.match(fragment, /c_acos/);
});

test('ln nodes support branch shifts via second argument', () => {
  const ast = Ln(VarZ(), VarX());
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /c_ln_branch/);
  assert.match(fragment, /branchShift/);
});

test('Conjugate nodes flip the imaginary component', () => {
  const ast = Conjugate(VarZ());
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /vec2 inner =/);
  assert.match(fragment, /vec2\(inner\.x, -inner\.y\)/);
});

test('LessThan nodes compare real parts and emit boolean constants', () => {
  const ast = LessThan(Const(1, 0), Const(0, 0));
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /a\.x < b\.x/);
  assert.match(fragment, /vec2\(flag, 0\.0\)/);
});

test('Other comparison nodes emit using real parts', () => {
  const gt = GreaterThan(Const(1, 0), Const(0, 0));
  const ge = GreaterThanOrEqual(Const(1, 0), Const(1, 0));
  const le = LessThanOrEqual(Const(0, 0), Const(1, 0));
  const eq = Equal(Const(2, 0), Const(3, 0));
  [gt, ge, le, eq].forEach((ast) => {
    const fragment = buildFragmentSourceFromAST(ast);
    if (ast.kind === 'GreaterThan') {
      assert.match(fragment, /a\.x > b\.x/);
    }
    if (ast.kind === 'GreaterThanOrEqual') {
      assert.match(fragment, /a\.x >= b\.x/);
    }
    if (ast.kind === 'LessThanOrEqual') {
      assert.match(fragment, /a\.x <= b\.x/);
    }
    if (ast.kind === 'Equal') {
      assert.match(fragment, /a\.x == b\.x/);
    }
  });
});

test('Logical operators implement non-zero truthiness', () => {
  const andAst = LogicalAnd(Const(1, 0), Const(0, 1));
  const orAst = LogicalOr(Const(0, 0), Const(0, 1));
  const andFragment = buildFragmentSourceFromAST(andAst);
  const orFragment = buildFragmentSourceFromAST(orAst);
  assert.match(andFragment, /leftTruthy/);
  assert.match(andFragment, /&&/);
  assert.match(orFragment, /rightTruthy/);
  assert.match(orFragment, /\|\|/);
});

test('If nodes branch based on non-zero condition', () => {
  const ast = If(Const(1, 0), Const(2, 0), Const(3, 0));
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /vec2 cond =/);
  assert.match(fragment, /bool selector =/);
  assert.match(fragment, /if \(selector\)/);
});

test('Abs nodes emit magnitude as real output', () => {
  const ast = Abs(Add(Const(3, 0), Const(0, 4)));
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /float magnitude = length/);
  assert.match(fragment, /vec2\(magnitude, 0\.0\)/);
});

test('Abs2 nodes emit squared magnitude as real output', () => {
  const ast = Abs2(Const(3, 4));
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /float magnitudeSquared = dot/);
  assert.match(fragment, /vec2\(magnitudeSquared, 0\.0\)/);
});

test('Floor nodes emit component-wise floor', () => {
  const ast = Floor(VarZ());
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /return floor\(v\);/);
});
