import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFormulaInput,
  parseFormulaToAST,
} from './arithmetic-parser.mjs';
import { visitAst } from './ast-utils.mjs';
import { formulaAstToLatex } from './formula-renderer.mjs';
import { buildFragmentSourceFromAST } from './core-engine.mjs';

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

test('unary minus binds weaker than exponentiation', () => {
  const result = parseFormulaInput('-z^4');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Sub');
  assert.equal(result.value.left.kind, 'Const');
  assert.equal(result.value.right.kind, 'Pow');
  assert.equal(result.value.right.base.kind, 'Var');
  assert.equal(result.value.right.exponent, 4);
});

test('parentheses can force (-z)^4', () => {
  const result = parseFormulaInput('(-z)^4');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Pow');
  assert.equal(result.value.exponent, 4);
  assert.equal(result.value.base.kind, 'Sub');
});

test('non-integer exponents lower to exp form', () => {
  const result = parseFormulaInput('z ^ 1.5');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Exp');
  assert.equal(result.value.value.kind, 'Mul');
  assert.equal(result.value.value.left.kind, 'Const');
});

test('power expressions simplify to Pow when exponent is an integer expression', () => {
  const result = parseFormulaInput('z ^ (1 + 1)');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Pow');
  assert.equal(result.value.exponent, 2);
});

test('set-bound integer exponent resolves to Pow', () => {
  const result = parseFormulaInput('set n = 3 in z ^ n');
  assert.equal(result.ok, true);
  const binding = result.value;
  assert.equal(binding.kind, 'SetBinding');
  assert.equal(binding.body.kind, 'Pow');
  assert.equal(binding.body.exponent, 3);
});

test('symbolic non-integer exponents remain in exp form', () => {
  const result = parseFormulaInput('z ^ x');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Exp');
});

test('power exponents beyond threshold fall back to exp form', () => {
  const result = parseFormulaInput('z ^ 11');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Exp');
});

test('power exponents from finger-based constants collapse to Pow', () => {
  const result = parseFormulaInput('z ^ (F1.x + 1)', {
    fingerValues: {
      F1: { x: 2, y: 0 },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Pow');
  assert.equal(result.value.exponent, 3);
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

test('parses arc trig aliases', () => {
  const asinResult = parseFormulaInput('asin(z)');
  assert.equal(asinResult.ok, true);
  assert.equal(asinResult.value.kind, 'Asin');

  const arcsinResult = parseFormulaInput('arcsin(z)');
  assert.equal(arcsinResult.ok, true);
  assert.equal(arcsinResult.value.kind, 'Asin');

  const acosResult = parseFormulaInput('acos(z)');
  assert.equal(acosResult.ok, true);
  assert.equal(acosResult.value.kind, 'Acos');

  const arccosResult = parseFormulaInput('arccos(z)');
  assert.equal(arccosResult.ok, true);
  assert.equal(arccosResult.value.kind, 'Acos');

  const arctanResult = parseFormulaInput('arctan(z)');
  assert.equal(arctanResult.ok, true);
  assert.equal(arctanResult.value.kind, 'Atan');
});

test('parses ln calls with optional branch shift', () => {
  const result = parseFormulaInput('ln(z, x + 1)');
  assert.equal(result.ok, true);
  const node = result.value;
  assert.equal(node.kind, 'Ln');
  assert.equal(node.value.kind, 'Var');
  assert.equal(node.branch.kind, 'Add');
  assert.equal(node.branch.left.kind, 'VarX');
});

test('parses sqrt calls via ln desugaring', () => {
  const result = parseFormulaInput('sqrt(z)');
  assert.equal(result.ok, true);
  const expNode = result.value;
  assert.equal(expNode.kind, 'Exp');
  assert.equal(expNode.value.kind, 'Mul');
  assert.equal(expNode.value.left.kind, 'Const');
  assert.equal(expNode.value.left.re, 0.5);
  assert.equal(expNode.value.right.kind, 'Ln');
});

test('sqrt forwards optional branch arguments into ln', () => {
  const result = parseFormulaInput('sqrt(z, x + 1)');
  assert.equal(result.ok, true);
  const lnNode = result.value.value.right;
  assert.equal(lnNode.kind, 'Ln');
  assert.equal(lnNode.branch.kind, 'Add');
});

test('heav desugars to a conditional step function', () => {
  const result = parseFormulaInput('heav(z)');
  assert.equal(result.ok, true);
  const node = result.value;
  assert.equal(node.kind, 'If');
  assert.equal(node.condition.kind, 'GreaterThan');
  assert.equal(node.thenBranch.kind, 'Const');
  assert.equal(node.thenBranch.re, 1);
  assert.equal(node.elseBranch.kind, 'Const');
  assert.equal(node.elseBranch.re, 0);
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

test('parses non-consecutive finger primitives (any F*/D*)', () => {
  const result = parseFormulaInput('F7 + D12');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Add');
  assert.equal(result.value.left.kind, 'FingerOffset');
  assert.equal(result.value.left.slot, 'F7');
  assert.equal(result.value.right.kind, 'FingerOffset');
  assert.equal(result.value.right.slot, 'D12');
});

test('parses F0 and D0 finger primitives', () => {
  const result = parseFormulaInput('F0 + D0');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Add');
  assert.equal(result.value.left.kind, 'FingerOffset');
  assert.equal(result.value.left.slot, 'F0');
  assert.equal(result.value.right.kind, 'FingerOffset');
  assert.equal(result.value.right.slot, 'D0');
});

test('rejects binding finger names with set', () => {
  const result = parseFormulaInput('set F7 = 1 in F7');
  assert.equal(result.ok, false);
  assert.match(result.message, /reserved identifier/i);
});

test('parses W finger primitives', () => {
  const result = parseFormulaInput('W1 + W2');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Add');
  assert.equal(result.value.left.kind, 'FingerOffset');
  assert.equal(result.value.left.slot, 'W1');
  assert.equal(result.value.right.kind, 'FingerOffset');
  assert.equal(result.value.right.slot, 'W2');
});

test('parses W0 as a workspace finger primitive', () => {
  const result = parseFormulaInput('W0 + W1');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Add');
  assert.equal(result.value.left.kind, 'FingerOffset');
  assert.equal(result.value.left.slot, 'W0');
  assert.equal(result.value.right.kind, 'FingerOffset');
  assert.equal(result.value.right.slot, 'W1');
});

test('parses SU(2) rotation primitives (QA/QB/RA/RB)', () => {
  const result = parseFormulaInput('QA + QB + RA + RB');
  assert.equal(result.ok, true);
  const seen = [];
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.kind === 'DeviceRotation' || node.kind === 'TrackballRotation') {
      seen.push(`${node.kind}:${node.slot}`);
      return;
    }
    if (node.left) walk(node.left);
    if (node.right) walk(node.right);
  })(result.value);
  assert.deepEqual(
    seen.sort(),
    ['DeviceRotation:A', 'DeviceRotation:B', 'TrackballRotation:A', 'TrackballRotation:B'].sort(),
  );
});

test('rejects binding SU(2) rotation names with set', () => {
  const result = parseFormulaInput('set QA = 1 in QA');
  assert.equal(result.ok, false);
  assert.match(result.message, /reserved identifier/i);
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
  assert.equal(result.value.f.kind, 'ComposeMultiple');
  assert.equal(result.value.f.resolvedCount, 2);
});

test('$$ resolves inside top-level let bindings', () => {
  const result = parseFormulaInput('let g = z^2 - D1 in g $$ 8');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'LetBinding');
  assert.equal(result.value.name, 'g');
  assert.equal(result.value.body.kind, 'ComposeMultiple');
  assert.equal(result.value.body.resolvedCount, 8);
  assert.equal(result.value.body.base.kind, 'Identifier');
  assert.equal(result.value.body.base.name, 'g');
});

test('$$ accepts zero counts as identity', () => {
  const result = parseFormulaInput('z $$ 0');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'ComposeMultiple');
  assert.equal(result.value.resolvedCount, 0);
  assert.equal(result.value.base.kind, 'Var');
});

test('$$ rejects negative counts', () => {
  const result = parseFormulaInput('z $$ -1');
  assert.equal(result.ok, false);
  assert.match(result.message, /non-negative/i);
});

test('$$ accepts parenthesized expressions with constant propagation', () => {
  const result = parseFormulaInput('z $$ (2 + 3)');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'ComposeMultiple');
  assert.equal(result.value.resolvedCount, 5);
  assert.equal(result.value.base.kind, 'Var');
});

test('$$ accepts bare additive expressions on the right-hand side', () => {
  const result = parseFormulaInput('z $$ 2 + 3');
  assert.equal(result.ok, true);
  // `$$` binds tighter than `+`, and the parser keeps a compact `ComposeMultiple`
  // node (later materialized by the engine when building the shader).
  assert.equal(result.value.kind, 'ComposeMultiple');
  assert.equal(result.value.resolvedCount, 5);
  assert.equal(result.value.base.kind, 'Var');
});

test('$$ can derive counts from finger values', () => {
  const result = parseFormulaInput('sin $$ (10 * D12.x).floor', {
    fingerValues: {
      D12: { x: 0.5, y: 0 },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'ComposeMultiple');
  assert.equal(result.value.resolvedCount, 5);
  assert.equal(result.value.base.kind, 'Sin');
  let fingerSeen = false;
  visitAst(result.value.countExpression, (node) => {
    if (node.kind === 'FingerOffset' && node.slot === 'D12') {
      fingerSeen = true;
    }
  });
  assert.equal(fingerSeen, true);
});

test('$$ count expressions must be constant', () => {
  const result = parseFormulaInput('z $$ x');
  assert.equal(result.ok, false);
  assert.match(result.message, /constant/i);
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

test('parses modulus() as a synonym of abs()', () => {
  const result = parseFormulaInput('modulus(z)');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Abs');
  assert.equal(result.value.value.kind, 'Var');
});

test('parses floor() calls as unary functions', () => {
  const result = parseFormulaInput('floor(z)');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Floor');
  assert.equal(result.value.value.kind, 'Var');
});

test('parses abs2() calls as unary functions', () => {
  const result = parseFormulaInput('abs2(z)');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Abs2');
  assert.equal(result.value.value.kind, 'Var');
});

test('parses isnan() calls as an error predicate', () => {
  const result = parseFormulaInput('isnan(z)');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'IsNaN');
  assert.equal(result.value.value.kind, 'Var');
});

test('parses ifnan(value, fallback) as a single-evaluation error guard', () => {
  const result = parseFormulaInput('ifnan(z/0, 7)');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'IfNaN');
  assert.equal(result.value.value.kind, 'Div');
  assert.equal(result.value.fallback.kind, 'Const');
});

test('parses iferror as a synonym for ifnan', () => {
  const result = parseFormulaInput('iferror(z/0, 7)');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'IfNaN');
});

test('allows isnan to be referenced as a built-in function value', () => {
  const result = parseFormulaInput('isnan $ z');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Compose');
  assert.equal(result.value.f.kind, 'IsNaN');
  assert.equal(result.value.g.kind, 'Var');
});

test('allows built-in functions to be referenced as values', () => {
  const result = parseFormulaInput('abs $ z');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Compose');
  assert.equal(result.value.f.kind, 'Abs');
  assert.equal(result.value.g.kind, 'Var');
});

test('allows modulus to be referenced as a built-in function value', () => {
  const result = parseFormulaInput('modulus $ z');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Compose');
  assert.equal(result.value.f.kind, 'Abs');
  assert.equal(result.value.g.kind, 'Var');
});

test('tracks syntax labels for axis primitives', () => {
  const realResult = parseFormulaInput('real');
  assert.equal(realResult.ok, true);
  assert.equal(realResult.value.kind, 'VarX');
  assert.equal(realResult.value.syntaxLabel, 'real');

  const xResult = parseFormulaInput('x');
  assert.equal(xResult.ok, true);
  assert.equal(xResult.value.kind, 'VarX');
  assert.equal(xResult.value.syntaxLabel, 'x');

  const imagResult = parseFormulaInput('imag');
  assert.equal(imagResult.ok, true);
  assert.equal(imagResult.value.kind, 'VarY');
  assert.equal(imagResult.value.syntaxLabel, 'imag');
});

test('explicit composition accepts built-in literals', () => {
  const result = parseFormulaInput('o(abs, z)');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Compose');
  assert.equal(result.value.f.kind, 'Abs');
  assert.equal(result.value.g.kind, 'Var');
});

test('built-in literals work with repeat composition suffix', () => {
  const result = parseFormulaInput('abs $$ 2');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'ComposeMultiple');
  assert.equal(result.value.base.kind, 'Abs');
  assert.equal(result.value.resolvedCount, 2);
});

test('dot composition syntax treats a.b as (b $ a)', () => {
  const result = parseFormulaInput('D1.x');
  assert.equal(result.ok, true);
  const node = result.value;
  assert.equal(node.kind, 'Compose');
  assert.equal(node.g.kind, 'FingerOffset');
  assert.equal(node.g.slot, 'D1');
  assert.equal(node.f.kind, 'VarX');
});

test('dot composition chains associate left-to-right', () => {
  const result = parseFormulaInput('D1.x.abs');
  assert.equal(result.ok, true);
  const node = result.value;
  assert.equal(node.kind, 'Compose');
  assert.equal(node.f.kind, 'Abs');
  assert.equal(node.g.kind, 'Compose');
  assert.equal(node.g.f.kind, 'VarX');
  assert.equal(node.g.g.kind, 'FingerOffset');
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

test('user-defined functions support call syntax f(z)', () => {
  const result = parseFormulaInput('let f = z + 1 in f(z)');
  assert.equal(result.ok, true);
  const ast = result.value;
  assert.equal(ast.kind, 'LetBinding');
  assert.equal(ast.name, 'f');
  assert.equal(ast.value.kind, 'Add');
  assert.equal(ast.body.kind, 'Compose');
  assert.equal(ast.body.g.kind, 'Var');
  assert.equal(ast.body.f.kind, 'Identifier');
  assert.equal(ast.body.f.name, 'f');
  assert.equal(Boolean(ast.body.f.__letBinding), true);
});

test('missing "in" after let binding does not backtrack', () => {
  const result = parseFormulaInput('let foo = z + 1 foo(z)');
  assert.equal(result.ok, false);
  assert.equal(result.ctor, 'SetInKeyword');
  assert.equal(result.expected, 'in');
});

test('set bindings associate weaker than $$ and $', () => {
  const result = parseFormulaInput('set f = z $$ 2 in f $ f');
  assert.equal(result.ok, true);
  const ast = result.value;
  assert.equal(ast.kind, 'SetBinding');
  assert.equal(ast.value.kind, 'ComposeMultiple');
  assert.equal(ast.value.resolvedCount, 2);
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

test('top-level let is preserved for rendering and lowered for GPU compilation', () => {
  const result = parseFormulaInput('let f = z + 1 in f $ f');
  assert.equal(result.ok, true);
  const ast = result.value;
  assert.equal(ast.kind, 'LetBinding');
  const latex = formulaAstToLatex(ast);
  assert.match(latex, /\\mathrm\{let\}/);
  // GPU compilation must still succeed.
  assert.doesNotThrow(() => {
    const fragment = buildFragmentSourceFromAST(ast);
    assert.match(fragment, /vec2 node\d+\(vec2 z\)/);
  });
});

test('let m = abs in m does not render as just abs', () => {
  const result = parseFormulaInput('let m = abs in m');
  assert.equal(result.ok, true);
  const latex = formulaAstToLatex(result.value);
  assert.match(latex, /\\mathrm\{let\}\\;m/);
  assert.match(latex, /&m\\end\{aligned\}/);
});

test('_i renders as a Huge letter while keeping imaginary-unit semantics', () => {
  const result = parseFormulaInput('_i');
  assert.equal(result.ok, true);
  const latex = formulaAstToLatex(result.value);
  assert.match(latex, /\{\\Huge I\}/);
});

test('_abs(z) renders as a function call (not |z|) so the highlighted name shows', () => {
  const result = parseFormulaInput('_abs(z)');
  assert.equal(result.ok, true);
  const latex = formulaAstToLatex(result.value);
  assert.match(latex, /\{\\Huge A\}/);
  assert.match(latex, /\\operatorname\{/);
  assert.match(latex, /\\left\(/);
});

test('_modulus(z) renders as a function call (not |z|) so the highlighted name shows', () => {
  const result = parseFormulaInput('_modulus(z)');
  assert.equal(result.ok, true);
  const latex = formulaAstToLatex(result.value);
  assert.match(latex, /\{\\Huge M\}/);
  assert.match(latex, /\\operatorname\{/);
  assert.match(latex, /\\left\(/);
});

test('_modulus (function literal) renders as a function call so the highlighted name shows', () => {
  const result = parseFormulaInput('_modulus');
  assert.equal(result.ok, true);
  const latex = formulaAstToLatex(result.value);
  assert.match(latex, /\{\\Huge M\}/);
  assert.match(latex, /\\operatorname\{/);
  // Should render as a call on z for display (same semantics).
  assert.match(latex, /\\left\(z\\right\)/);
});

test('nested let bindings are allowed (let lifting happens in GPU lowering)', () => {
  const result = parseFormulaInput('set d = 3 in let f = d * z in f');
  assert.equal(result.ok, true);
  const ast = result.value;
  assert.equal(ast.kind, 'SetBinding');
  assert.equal(ast.name, 'd');
  assert.equal(ast.value.kind, 'Const');
  assert.equal(ast.value.re, 3);
  assert.equal(ast.value.im, 0);
  assert.equal(ast.body.kind, 'LetBinding');
  assert.equal(ast.body.name, 'f');
  assert.equal(ast.body.value.kind, 'Mul');
  assert.equal(ast.body.value.left.kind, 'SetRef');
  assert.strictEqual(ast.body.value.left.binding, ast);
  assert.equal(ast.body.value.right.kind, 'Var');
  assert.equal(ast.body.body.kind, 'Identifier');
  assert.equal(ast.body.body.name, 'f');
  // GPU compilation must still succeed.
  assert.doesNotThrow(() => {
    const fragment = buildFragmentSourceFromAST(ast);
    assert.match(fragment, /vec2 node\d+\(vec2 z\)/);
  });
});

test('top-level let can be followed by another let (sequential lets)', () => {
  const source = `let zeroline = heav $ 0.05-z $ abs in
let f = y - 3*sin(3*x) in
zeroline $ f`;
  const result = parseFormulaInput(source);
  assert.equal(result.ok, true);
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

test('underscore-marked identifiers record highlight metadata and render as Huge letters (LEON)', () => {
  const source = '_ln(_exp(_o(si_n, z*z)-3)-1)';
  const result = parseFormulaInput(source);
  assert.equal(result.ok, true);
  const latex = formulaAstToLatex(result.value);
  assert.match(latex, /\{\\Huge L\}/);
  assert.match(latex, /\{\\Huge E\}/);
  assert.match(latex, /\{\\Huge O\}/);
  assert.match(latex, /\{\\Huge N\}/);
  assert.ok(latex.indexOf('{\\Huge L}') < latex.indexOf('{\\Huge E}'));
  assert.ok(latex.indexOf('{\\Huge E}') < latex.indexOf('{\\Huge O}'));
  assert.ok(latex.indexOf('{\\Huge O}') < latex.indexOf('{\\Huge N}'));
});

test('comp(...) can clone floor(...) nodes (cloneAst supports Floor)', () => {
  assert.doesNotThrow(() => {
    const result = parseFormulaInput('comp(v+1, v, floor(z), 0)');
    assert.equal(result.ok, true);
    assert.equal(result.value.kind, 'Floor');
  });
});
