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
  Div,
  Compose,
  Const,
  Pow,
  Exp,
  Sin,
  Cos,
  Tan,
  Atan,
  Arg,
  Asin,
  Acos,
  Ln,
  oo,
  FingerOffset,
  DeviceRotation,
  LessThan,
  GreaterThan,
  LessThanOrEqual,
  GreaterThanOrEqual,
  Equal,
  LogicalAnd,
  LogicalOr,
  If,
  IfNaN,
  Abs,
  Abs2,
  Floor,
  Conjugate,
  IsNaN,
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
  assert.match(fragment, /vec2 f\(vec2 z\)/);
  assert.doesNotMatch(fragment, /vec2 node\d+\(vec2 z\)/);
  // Guard against rare GPU/driver divide-by-zero on strictly negative reals.
  assert.match(fragment, /if\s*\(re < 0\.0 && denRaw <= COLOR_MIN_DEN\)/);
});

test('buildFragmentSourceFromAST preserves set-binding identity when cloning/materializing', () => {
  const parsed = parseFormulaInput('set a = 1 in a + a');
  assert.equal(parsed.ok, true);
  const fragment = buildFragmentSourceFromAST(parsed.value);
  // SSA-style codegen: no global set-binding slots.
  assert.doesNotMatch(fragment, /set_binding_slot_/);
  assert.doesNotMatch(fragment, /undefined/);
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
    base: { kind: 'Sin', value: { kind: 'Var', name: 'z' } },
    countExpression: { kind: 'Const', re: 8, im: 0 },
  };
  const fragment = buildFragmentSourceFromAST(legacy);
  const calls = fragment.match(/c_sin\(/g) || [];
  assert.ok(calls.length >= 8);
});

test('Pow nodes emit exponentiation by squaring and allow negatives', () => {
  const ast = Pow(Const(1, 0), -3);
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /vec2 c_pow_int\(vec2 base, int exp\)/);
  assert.match(fragment, /c_pow_int\([^)]+,\s*-3\)/);
});

test('Offset2 nodes read from the fixed offset array', () => {
  const ast = Offset2();
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /uniform vec2 u_fixedOffsets\[2\]/);
  assert.match(fragment, /u_fixedOffsets\[1\]/);
});

test('dynamic fingers read from the dynamic offset array', () => {
  const ast = FingerOffset('D1');
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /uniform vec2 u_dynamicOffsets\[1\]/);
  assert.match(fragment, /u_dynamicOffsets\[0\]/);
});

test('F0 and D0 map to the first uniform slot', () => {
  const fixed = buildFragmentSourceFromAST(FingerOffset('F0'));
  assert.match(fixed, /uniform vec2 u_fixedOffsets\[1\]/);
  assert.match(fixed, /u_fixedOffsets\[0\]/);

  const dyn = buildFragmentSourceFromAST(FingerOffset('D0'));
  assert.match(dyn, /uniform vec2 u_dynamicOffsets\[1\]/);
  assert.match(dyn, /u_dynamicOffsets\[0\]/);
});

test('supports sparse high-index finger uniforms', () => {
  const fixedAst = FingerOffset('F7');
  const fixedFragment = buildFragmentSourceFromAST(fixedAst);
  assert.match(fixedFragment, /uniform vec2 u_fixedOffsets\[7\]/);
  assert.match(fixedFragment, /u_fixedOffsets\[6\]/);

  const dynamicAst = FingerOffset('D12');
  const dynamicFragment = buildFragmentSourceFromAST(dynamicAst);
  assert.match(dynamicFragment, /uniform vec2 u_dynamicOffsets\[12\]/);
  assert.match(dynamicFragment, /u_dynamicOffsets\[11\]/);
});

test('W fingers read from the W offset array', () => {
  const ast = FingerOffset('W2');
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /uniform vec2 u_wOffsets\[2\]/);
  assert.match(fragment, /u_wOffsets\[1\]/);
});

test('W0 maps to the W2 uniform slot in shaders', () => {
  const ast = FingerOffset('W0');
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /uniform vec2 u_wOffsets\[2\]/);
  assert.match(fragment, /u_wOffsets\[1\]/);
});

test('device orientation primitives read from scalar uniforms', () => {
  const ast = DeviceRotation('A');
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /uniform vec2 u_qA;/);
  assert.match(fragment, /u_qA/);
});

test('VarX and VarY nodes project components', () => {
  const ast = Add(VarX(), VarY());
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /vec2\s+_x\d+\s*=\s*vec2\(z\.x,\s*0\.0\);/);
  assert.match(fragment, /vec2\s+_y\d+\s*=\s*vec2\(z\.y,\s*0\.0\);/);
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

test('Arg nodes emit imag(ln) and support branch shifts', () => {
  const fragment = buildFragmentSourceFromAST(Arg(VarZ()));
  assert.match(fragment, /c_ln\(/);
  assert.match(fragment, /vec2\s+_arg\d+\s*=\s*vec2\([^)]*\.y,\s*0\.0\);/);

  const fragmentWithBranch = buildFragmentSourceFromAST(Arg(VarZ(), VarX()));
  assert.match(fragmentWithBranch, /c_ln_branch\(/);
  assert.match(fragmentWithBranch, /\.x\)/);
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
  assert.match(fragment, /\.x\)/);
});

test('Conjugate nodes flip the imaginary component', () => {
  const ast = Conjugate(VarZ());
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /vec2\s+_conj\d+\s*=\s*vec2\([^)]*\.x,\s*-[^)]*\.y\);/);
});

test('isnan() nodes emit the error predicate helper and boolean output', () => {
  const ast = IsNaN(Div(Const(1, 0), Const(0, 0)));
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /float c_is_error\(vec2 z\)/);
  assert.match(fragment, /vec2\s+_isnan\d+\s*=\s*vec2\(c_is_error\([^)]*\),\s*0\.0\);/);
});

test('LessThan nodes compare real parts and emit boolean constants', () => {
  const ast = LessThan(Const(1, 0), Const(0, 0));
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /\.x < .*\.x/);
  assert.match(fragment, /\?\s*1\.0\s*:\s*0\.0/);
});

test('Other comparison nodes emit using real parts', () => {
  const gt = GreaterThan(Const(1, 0), Const(0, 0));
  const ge = GreaterThanOrEqual(Const(1, 0), Const(1, 0));
  const le = LessThanOrEqual(Const(0, 0), Const(1, 0));
  const eq = Equal(Const(2, 0), Const(3, 0));
  [gt, ge, le, eq].forEach((ast) => {
    const fragment = buildFragmentSourceFromAST(ast);
    if (ast.kind === 'GreaterThan') {
      assert.match(fragment, /\.x > .*\.x/);
    }
    if (ast.kind === 'GreaterThanOrEqual') {
      assert.match(fragment, /\.x >= .*\.x/);
    }
    if (ast.kind === 'LessThanOrEqual') {
      assert.match(fragment, /\.x <= .*\.x/);
    }
    if (ast.kind === 'Equal') {
      assert.match(fragment, /\.x == .*\.x/);
    }
  });
});

test('Logical operators implement non-zero truthiness', () => {
  const andAst = LogicalAnd(Const(1, 0), Const(0, 1));
  const orAst = LogicalOr(Const(0, 0), Const(0, 1));
  const andFragment = buildFragmentSourceFromAST(andAst);
  const orFragment = buildFragmentSourceFromAST(orAst);
  assert.match(andFragment, /&&/);
  assert.match(orFragment, /\|\|/);
});

test('If nodes branch based on non-zero condition', () => {
  const ast = If(Const(1, 0), Const(2, 0), Const(3, 0));
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /bool\s+_if\d+_sel\s*=/);
  assert.match(fragment, /if\s*\(_if\d+_sel\)/);
});

test('ifnan(value, fallback) evaluates value once and returns it when not error', () => {
  const ast = IfNaN(Div(VarZ(), Const(0, 0)), Const(7, 0));
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /float\s+_ifnan\d+_flag\s*=\s*c_is_error\(/);
  assert.match(fragment, /if\s*\(_ifnan\d+_flag > 0\.5\)/);
});

test('Abs nodes emit magnitude as real output', () => {
  const ast = Abs(Add(Const(3, 0), Const(0, 4)));
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /length\(/);
  assert.match(fragment, /vec2\([^)]*,\s*0\.0\)/);
});

test('Abs2 nodes emit squared magnitude as real output', () => {
  const ast = Abs2(Const(3, 4));
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /dot\(/);
  assert.match(fragment, /vec2\([^)]*,\s*0\.0\)/);
});

test('Floor nodes emit component-wise floor', () => {
  const ast = Floor(VarZ());
  const fragment = buildFragmentSourceFromAST(ast);
  assert.match(fragment, /floor\(/);
});
