import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFormulaInput,
  parseFormulaToAST,
} from './arithmetic-parser.mjs';
import { visitAst } from './ast-utils.mjs';
import { formulaAstToLatex } from './formula-renderer.mjs';
import { buildFragmentSourceFromAST, lowerHighLevelSugar } from './core-engine.mjs';

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

test('supports # single-line comments anywhere whitespace is allowed', () => {
  const source = `# leading comment
z# inline comment
+ 1 # trailing comment`;
  const result = parseFormulaInput(source);
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Add');
  assert.equal(result.value.left.kind, 'Var');
  assert.equal(result.value.right.kind, 'Const');
  assert.equal(result.value.right.re, 1);
  assert.equal(result.value.right.im, 0);
});

test('treats comment-only input as empty', () => {
  const result = parseFormulaInput(`# just a comment
# another comment`);
  assert.equal(result.ok, false);
  assert.equal(result.message, 'Formula cannot be empty');
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

test('renders signed bases in exponentiation with parentheses', () => {
  const result = parseFormulaInput('(-1)^z');
  assert.equal(result.ok, true);
  const latex = formulaAstToLatex(result.value);
  assert.equal(latex, '\\left(-1\\right)^{z}');
});

test('renders additive complex literals as compact constants', () => {
  const result = parseFormulaInput('1 + 2i');
  assert.equal(result.ok, true);
  const latex = formulaAstToLatex(result.value);
  assert.equal(latex, '\\left(\\substack{1\\,+\\\\2\\,i}\\right)');
});

test('renders subtractive complex literals as compact constants', () => {
  const result = parseFormulaInput('1 - 2i');
  assert.equal(result.ok, true);
  const latex = formulaAstToLatex(result.value);
  assert.equal(latex, '\\left(\\substack{1\\,-\\\\2\\,i}\\right)');
});

test('renders negative literal in multiplication with parentheses', () => {
  const result = parseFormulaInput('-1 * 2');
  assert.equal(result.ok, true);
  const latex = formulaAstToLatex(result.value);
  assert.equal(latex, '\\left(-1\\right)\\,2');
});

test('renders negative literal on right multiplication with parentheses', () => {
  const result = parseFormulaInput('2 * -1');
  assert.equal(result.ok, true);
  const latex = formulaAstToLatex(result.value);
  assert.equal(latex, '2\\,\\left(-1\\right)');
});

test('renders additive bases in exponentiation with parentheses', () => {
  const result = parseFormulaInput('(1 + 2)^z');
  assert.equal(result.ok, true);
  const latex = formulaAstToLatex(result.value);
  assert.equal(latex, '\\left(1 + 2\\right)^{z}');
});

test('renders multiplicative bases in exponentiation with parentheses', () => {
  const result = parseFormulaInput('(2 * 3)^z');
  assert.equal(result.ok, true);
  const latex = formulaAstToLatex(result.value);
  assert.equal(latex, '\\left(2\\,3\\right)^{z}');
});

test('non-integer exponents preserve power surface syntax', () => {
  const result = parseFormulaInput('z ^ 1.5');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'PowExpr');
  const latex = formulaAstToLatex(result.value);
  assert.doesNotMatch(latex, /\\exp|\\ln/);
});

test('power expressions preserve power surface syntax (even if exponent is constant-foldable)', () => {
  const result = parseFormulaInput('z ^ (1 + 1)');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'PowExpr');
});

test('set-bound integer exponent remains a power expression (optimized later)', () => {
  const result = parseFormulaInput('set n = 3 in z ^ n');
  assert.equal(result.ok, true);
  const binding = result.value;
  assert.equal(binding.kind, 'SetBinding');
  assert.equal(binding.body.kind, 'PowExpr');
  assert.equal(binding.body.__resolvedIntExp, 3);
});

test('symbolic non-integer exponents preserve power surface syntax', () => {
  const result = parseFormulaInput('z ^ x');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'PowExpr');
});

test('power exponents beyond Pow threshold remain power expressions', () => {
  const result = parseFormulaInput('z ^ 11');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'PowExpr');
});

test('power exponents from finger-based constants remain power expressions (optimized later)', () => {
  const result = parseFormulaInput('z ^ (F1.x + 1)', {
    fingerValues: {
      F1: { x: 2, y: 0 },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'PowExpr');
  assert.equal(result.value.__resolvedIntExp, 3);
});

test('parses exp/sin/cos/ln calls', () => {
  const result = parseFormulaInput('exp(sin(cos(ln(z))))');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Exp');
  assert.equal(result.value.value.kind, 'Sin');
});

test('renders exp(x) as e^{x} (unless underscore-highlight syntax is used)', () => {
  const plain = parseFormulaInput('exp(z)');
  assert.equal(plain.ok, true);
  const plainLatex = formulaAstToLatex(plain.value);
  assert.match(plainLatex, /^e\^\{z\}$/);

  const highlighted = parseFormulaInput('_exp(z)');
  assert.equal(highlighted.ok, true);
  const highlightedLatex = formulaAstToLatex(highlighted.value);
  assert.match(highlightedLatex, /\\operatorname\{/);
  assert.match(highlightedLatex, /\{\\Huge/);
  assert.match(highlightedLatex, /\\left\(z\\right\)/);
});

test('renders exp_(x) as plain exp(x)', () => {
  const result = parseFormulaInput('exp_(z)');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Exp');
  const latex = formulaAstToLatex(result.value);
  assert.match(latex, /\\operatorname\{exp\}/);
  assert.match(latex, /\\left\(z\\right\)/);
  assert.doesNotMatch(latex, /^e\^\{z\}$/);
});

test('renders greek-letter identifiers as symbols (unless underscores are present)', () => {
  const result = parseFormulaInput('set pi = 0 in set tau = 0 in set delta = 0 in set phi = 0 in pi + tau + delta + phi');
  assert.equal(result.ok, true);
  const latex = formulaAstToLatex(result.value);
  assert.match(latex, /\\pi/);
  assert.match(latex, /\\tau/);
  assert.match(latex, /\\delta/);
  assert.match(latex, /\\phi/);

  // Underscore is a highlight marker, not part of the identifier:
  // `pi_1` becomes identifier `pi1` with a highlighted "1".
  const highlighted = parseFormulaInput('set pi_1 = 0 in pi_1');
  assert.equal(highlighted.ok, true);
  const highlightedLatex = formulaAstToLatex(highlighted.value);
  // Binding name is rendered without highlight metadata, so it becomes \pi_{1}.
  assert.match(highlightedLatex, /\\pi_\{1\}/);
  // The reference keeps the digit highlight, so the 1 is rendered Huge (in the subscript).
  assert.match(highlightedLatex, /\{\\Huge 1\}/);
});

test('renders gamma_1 as "gamma" followed by a big 1', () => {
  const result = parseFormulaInput('set gamma_1 = 0 in gamma_1');
  assert.equal(result.ok, true);
  const latex = formulaAstToLatex(result.value);
  assert.match(latex, /\\mathrm\{gamma\}/);
  assert.match(latex, /\{\\Huge 1\}/);
});

test('renders identifier trailing digits as subscripts (d1 -> d_{1})', () => {
  const result = parseFormulaInput('set d1 = 0 in d1');
  assert.equal(result.ok, true);
  const latex = formulaAstToLatex(result.value);
  assert.match(latex, /d_\{1\}/);
});

test('renders greek identifiers with digit suffix as subscripts (pi1 -> \\pi_{1})', () => {
  const result = parseFormulaInput('set pi1 = 0 in pi1');
  assert.equal(result.ok, true);
  const latex = formulaAstToLatex(result.value);
  assert.match(latex, /\\pi_\{1\}/);
});

test('renders prime suffix as apostrophe (xprime -> x\')', () => {
  const result = parseFormulaInput('set xprime = 0 in xprime');
  assert.equal(result.ok, true);
  const latex = formulaAstToLatex(result.value);
  assert.match(latex, /x'/);
});

test('parses gamma(...) as a primitive and renders with Γ', () => {
  const result = parseFormulaInput('gamma(z)');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Gamma');
  const latex = formulaAstToLatex(result.value);
  assert.match(latex, /\\Gamma/);
  assert.doesNotThrow(() => buildFragmentSourceFromAST(result.value));
});

test('parses fact(...) as a primitive and renders with postfix ! (no parens for atoms)', () => {
  const atom = parseFormulaInput('fact(z)');
  assert.equal(atom.ok, true);
  assert.equal(atom.value.kind, 'Fact');
  const atomLatex = formulaAstToLatex(atom.value);
  assert.match(atomLatex, /^z!$/);

  const compound = parseFormulaInput('fact(z+1)');
  assert.equal(compound.ok, true);
  assert.equal(compound.value.kind, 'Fact');
  const compoundLatex = formulaAstToLatex(compound.value);
  assert.ok(compoundLatex.includes('\\left(z + 1\\right)!'));
  assert.doesNotThrow(() => buildFragmentSourceFromAST(compound.value));
});

test('_gamma(...) preserves call syntax so underscore-highlight letters render', () => {
  const result = parseFormulaInput('_gamma(z)');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Gamma');
  const latex = formulaAstToLatex(result.value);
  assert.match(latex, /\\operatorname\{/);
  assert.match(latex, /\{\\Huge/);
  assert.match(latex, /\\left\(z\\right\)/);
});

test('_fact(...) preserves call syntax so underscore-highlight letters render', () => {
  const result = parseFormulaInput('_fact(z)');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Fact');
  const latex = formulaAstToLatex(result.value);
  assert.match(latex, /\\operatorname\{/);
  assert.match(latex, /\{\\Huge/);
  assert.match(latex, /\\left\(z\\right\)/);
  // Ensure it is not rendered as postfix factorial when underscore-highlights are present.
  assert.doesNotMatch(latex, /z!/);
});

test('parses tan and atan calls', () => {
  const result = parseFormulaInput('tan(atan(z))');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Tan');
  assert.equal(result.value.value.kind, 'Atan');
});

test('parses arg(z) and argument(z) calls', () => {
  const argResult = parseFormulaInput('arg(z)');
  assert.equal(argResult.ok, true);
  assert.equal(argResult.value.kind, 'Arg');
  assert.equal(argResult.value.value.kind, 'Var');
  assert.equal(argResult.value.branch, null);

  const argumentResult = parseFormulaInput('argument(z)');
  assert.equal(argumentResult.ok, true);
  assert.equal(argumentResult.value.kind, 'Arg');
  assert.equal(argumentResult.value.value.kind, 'Var');
  assert.equal(argumentResult.value.branch, null);
});

test('renders argument literals with full label and highlights', () => {
  const literal = parseFormulaInput('argument');
  assert.equal(literal.ok, true);
  const literalLatex = formulaAstToLatex(literal.value);
  assert.match(literalLatex, /\\operatorname\{argument\}\\left\(z\\right\)/);

  const highlighted = parseFormulaInput('arg_ument');
  assert.equal(highlighted.ok, true);
  const highlightedLatex = formulaAstToLatex(highlighted.value);
  assert.match(highlightedLatex, /\\operatorname\{/);
  assert.match(highlightedLatex, /\{\\Huge U\}/);
  assert.match(highlightedLatex, /arg\{\\Huge U\}ment/);
  assert.match(highlightedLatex, /\\left\(z\\right\)/);
});

test('arg(z, k) forwards the branch argument (like ln)', () => {
  const result = parseFormulaInput('arg(z, x + 1)');
  assert.equal(result.ok, true);
  assert.equal(result.value.kind, 'Arg');
  assert.equal(result.value.value.kind, 'Var');
  assert.equal(result.value.branch.kind, 'Add');
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

  const reResult = parseFormulaInput('re');
  assert.equal(reResult.ok, true);
  assert.equal(reResult.value.kind, 'VarX');
  assert.equal(reResult.value.syntaxLabel, 're');

  const imResult = parseFormulaInput('im');
  assert.equal(imResult.ok, true);
  assert.equal(imResult.value.kind, 'VarY');
  assert.equal(imResult.value.syntaxLabel, 'im');
});

test('re(z) and im(z) behave like real(z) and imag(z)', () => {
  const reCall = parseFormulaInput('re(z)');
  assert.equal(reCall.ok, true);
  assert.equal(reCall.value.kind, 'Call');
  assert.equal(reCall.value.callee.kind, 'VarX');
  assert.equal(reCall.value.args.length, 1);
  assert.equal(reCall.value.args[0].kind, 'Var');

  const imCall = parseFormulaInput('im(z)');
  assert.equal(imCall.ok, true);
  assert.equal(imCall.value.kind, 'Call');
  assert.equal(imCall.value.callee.kind, 'VarY');
  assert.equal(imCall.value.args.length, 1);
  assert.equal(imCall.value.args[0].kind, 'Var');
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
  // Dot syntax should be preserved for rendering decisions.
  assert.equal(node.composeSyntax, 'dot');
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

test('parses if/then/else expressions', () => {
  const result = parseFormulaInput('if x < y then x + 1 else y + 2');
  assert.equal(result.ok, true);
  const node = result.value;
  assert.equal(node.kind, 'If');
  assert.equal(node.condition.kind, 'LessThan');
  assert.equal(node.thenBranch.kind, 'Add');
  assert.equal(node.elseBranch.kind, 'Add');
  assert.equal(node.ifSyntax, 'then');
});

test('parses parenthesized if/then/else conditions', () => {
  const result = parseFormulaInput('if (x < y) then x else y');
  assert.equal(result.ok, true);
  const node = result.value;
  assert.equal(node.kind, 'If');
  assert.equal(node.condition.kind, 'LessThan');
  assert.equal(node.thenBranch.kind, 'VarX');
  assert.equal(node.elseBranch.kind, 'VarY');
  assert.equal(node.ifSyntax, 'then');
});

test('parses nested if/then/else without trailing parentheses', () => {
  const result = parseFormulaInput('if x < y then if y < 0 then x else y else 0');
  assert.equal(result.ok, true);
  const node = result.value;
  assert.equal(node.kind, 'If');
  assert.equal(node.thenBranch.kind, 'If');
  assert.equal(node.thenBranch.ifSyntax, 'then');
  assert.equal(node.elseBranch.kind, 'Const');
});

test('renders if syntax based on input form', () => {
  const keywordResult = parseFormulaInput('if x < y then x else y');
  assert.equal(keywordResult.ok, true);
  const keywordLatex = formulaAstToLatex(keywordResult.value);
  assert.match(keywordLatex, /\\mathrm\{if\}/);
  assert.match(keywordLatex, /\\mathrm\{then\}/);
  assert.match(keywordLatex, /\\mathrm\{else\}/);
  assert.doesNotMatch(keywordLatex, /\\operatorname\{if\}\\left/);

  const callResult = parseFormulaInput('if(x < y, x, y)');
  assert.equal(callResult.ok, true);
  const callLatex = formulaAstToLatex(callResult.value);
  assert.match(callLatex, /\\operatorname\{if\}\\left/);
});

test('missing "then" after if is reported inside let bindings', () => {
  const result = parseFormulaInput('let c = if 1 else 0 in z');
  assert.equal(result.ok, false);
  assert.equal(result.ctor, 'IfThenKeyword');
  assert.equal(result.expected, 'then');
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
  assert.equal(ast.body.kind, 'Call');
  assert.equal(ast.body.callee.kind, 'Identifier');
  assert.equal(ast.body.callee.name, 'f');
  assert.equal(Boolean(ast.body.callee.__letBinding), true);
  assert.equal(Array.isArray(ast.body.args), true);
  assert.equal(ast.body.args.length, 1);
  assert.equal(ast.body.args[0].kind, 'Var');
});

test('missing "in" after let binding does not backtrack', () => {
  const result = parseFormulaInput('let foo = z + 1 foo(z)');
  assert.equal(result.ok, false);
  assert.equal(result.ctor, 'SetInKeyword');
  assert.equal(result.expected, 'in');
});

test('multi-argument let bindings parse and call with extra args (z remains ambient)', () => {
  const source = `
let customif(set thn, set els) = if(z, thn, els) in
customif(sin, cos)
`.trim();
  const result = parseFormulaInput(source);
  assert.equal(result.ok, true);
  const ast = result.value;
  assert.equal(ast.kind, 'LetBinding');
  assert.equal(ast.name, 'customif');
  assert.deepEqual(ast.params, ['thn', 'els']);
  assert.equal(ast.paramSpecs[0].prefix, 'set');
  assert.equal(ast.paramSpecs[1].prefix, 'set');
  assert.equal(ast.body.kind, 'Call');
  assert.equal(ast.body.callee.kind, 'Identifier');
  assert.equal(ast.body.callee.name, 'customif');
  assert.equal(ast.body.args.length, 2);
  assert.equal(ast.body.args[0].kind, 'Sin');
  assert.equal(ast.body.args[1].kind, 'Cos');
});

test('multi-argument let calls can override z with a final argument (z-last)', () => {
  const source = `
let customif(set thn, set els) = if(z, thn, els) in
customif(sin, cos, z)
`.trim();
  const result = parseFormulaInput(source);
  assert.equal(result.ok, true);
  const ast = result.value;
  assert.equal(ast.kind, 'LetBinding');
  assert.equal(ast.body.kind, 'Call');
  assert.equal(ast.body.args.length, 3);
  assert.equal(ast.body.args[2].kind, 'Var');
});

test('multi-argument let functions are not first-class values (must be called)', () => {
  const result = parseFormulaInput('let max(set w) = if(z < w, w, z) in max');
  assert.equal(result.ok, false);
  assert.match(result.message, /must be called or passed as a function argument/i);
});

test('function-typed let params accept expression arguments', () => {
  const source = `
let min(set w) = if(w < z, w, z) in
let apply1(let filter) = z - 3 $ filter $ z + 3 in
apply1(min(0))
`.trim();
  const result = parseFormulaInput(source);
  assert.equal(result.ok, true);
  const ast = result.value;
  assert.equal(ast.kind, 'LetBinding');
  assert.equal(ast.body.kind, 'LetBinding');
  const apply1 = ast.body;
  assert.equal(apply1.paramSpecs[0].kind, 'fn');
  assert.equal(apply1.paramSpecs[0].name, 'filter');
  assert.equal(apply1.paramSpecs[0].args.length, 0);
});

test('function-typed let params accept matching signatures', () => {
  const source = `
let min(set w) = if(w < z, w, z) in
let apply1(let filter(set w), set w0) = z - 3 $ filter(w0 + 1) $ z + 3 in
apply1(min, 0.2)
`.trim();
  const result = parseFormulaInput(source);
  assert.equal(result.ok, true);
  const ast = result.value;
  assert.equal(ast.kind, 'LetBinding');
  const apply1 = ast.body;
  assert.equal(apply1.kind, 'LetBinding');
  assert.equal(apply1.paramSpecs[0].kind, 'fn');
  assert.equal(apply1.paramSpecs[0].args.length, 1);
});

test('nested function-typed param signatures parse', () => {
  const source = `
let apply1(let f) = f $ (z + 1) in
let apply2(let apply1(let apply0), let apply0, set c) = apply1(apply0) + c in
apply2(apply1, sin, 2)
`.trim();
  const result = parseFormulaInput(source);
  assert.equal(result.ok, true);
  const apply2 = result.value.body;
  assert.equal(apply2.kind, 'LetBinding');
  const firstParam = apply2.paramSpecs[0];
  assert.equal(firstParam.kind, 'fn');
  assert.equal(firstParam.args.length, 1);
  assert.equal(firstParam.args[0].kind, 'fn');
});

test('function-typed params reject mismatched signatures', () => {
  const source = `
let min(set w) = if(w < z, w, z) in
let apply1(let filter(set w), set w0) = filter(w0 + 1) in
apply1(min(0), 2)
`.trim();
  const result = parseFormulaInput(source);
  assert.equal(result.ok, false);
  assert.match(result.message, /signature/i);
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
    assert.match(fragment, /vec2 f\(vec2 z\)/);
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
    assert.match(fragment, /vec2 f\(vec2 z\)/);
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

test('v is available as a normal identifier (bindable via set)', () => {
  const result = parseFormulaInput('set v = 1 in v + 2');
  assert.equal(result.ok, true);
  const ast = result.value;
  assert.equal(ast.kind, 'SetBinding');
  assert.equal(ast.name, 'v');
  assert.equal(ast.body.kind, 'Add');
});

test('unbound v behaves like any unknown identifier', () => {
  const result = parseFormulaInput('v + 1');
  assert.equal(result.ok, false);
  assert.match(result.message, /Unknown variable "v"/);
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

function complexAdd(a, b) {
  return { re: a.re + b.re, im: a.im + b.im };
}
function complexSub(a, b) {
  return { re: a.re - b.re, im: a.im - b.im };
}
function complexMul(a, b) {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}
function complexDiv(a, b) {
  const denom = b.re * b.re + b.im * b.im;
  if (denom < 1e-12) {
    return { re: NaN, im: NaN };
  }
  return { re: (a.re * b.re + a.im * b.im) / denom, im: (a.im * b.re - a.re * b.im) / denom };
}

function evaluateAstComplex(root, { z = { re: 0, im: 0 } } = {}) {
  const setEnv = new Map(); // SetBinding node -> complex value
  const letEnv = []; // stack of { name, params, expr, capturedSetEnv, capturedLetEnv }
  const paramEnv = new Map(); // param name -> complex value

  function lookupLet(name, envStack) {
    for (let i = envStack.length - 1; i >= 0; i -= 1) {
      if (envStack[i].name === name) return envStack[i];
    }
    return null;
  }

  function evalNode(node, zLocal, localParamEnv, localSetEnv, localLetEnv) {
    if (!node || typeof node !== 'object') return { re: 0, im: 0 };
    switch (node.kind) {
      case 'Const':
        return { re: node.re, im: node.im };
      case 'Var':
        return { re: zLocal.re, im: zLocal.im };
      case 'VarX':
        return { re: zLocal.re, im: 0 };
      case 'VarY':
        return { re: zLocal.im, im: 0 };
      case 'ParamRef': {
        const v = localParamEnv.get(node.name);
        if (!v) throw new Error(`Unbound ParamRef: ${node.name}`);
        return v;
      }
      case 'SetRef': {
        const v = localSetEnv.get(node.binding);
        if (!v) throw new Error(`Unbound SetRef: ${node.name}`);
        return v;
      }
      case 'Add':
        return complexAdd(evalNode(node.left, zLocal, localParamEnv, localSetEnv, localLetEnv), evalNode(node.right, zLocal, localParamEnv, localSetEnv, localLetEnv));
      case 'Sub':
        return complexSub(evalNode(node.left, zLocal, localParamEnv, localSetEnv, localLetEnv), evalNode(node.right, zLocal, localParamEnv, localSetEnv, localLetEnv));
      case 'Mul':
        return complexMul(evalNode(node.left, zLocal, localParamEnv, localSetEnv, localLetEnv), evalNode(node.right, zLocal, localParamEnv, localSetEnv, localLetEnv));
      case 'Div':
        return complexDiv(evalNode(node.left, zLocal, localParamEnv, localSetEnv, localLetEnv), evalNode(node.right, zLocal, localParamEnv, localSetEnv, localLetEnv));
      case 'Floor': {
        const v = evalNode(node.value, zLocal, localParamEnv, localSetEnv, localLetEnv);
        return { re: Math.floor(v.re), im: 0 };
      }
      case 'SetBinding': {
        const value = evalNode(node.value, zLocal, localParamEnv, localSetEnv, localLetEnv);
        const nextSetEnv = new Map(localSetEnv);
        nextSetEnv.set(node, value);
        return evalNode(node.body, zLocal, localParamEnv, nextSetEnv, localLetEnv);
      }
      case 'LetBinding': {
        const params = Array.isArray(node.params) ? node.params : [];
        const closure = {
          name: node.name,
          params,
          expr: node.value,
          capturedSetEnv: new Map(localSetEnv),
          capturedLetEnv: localLetEnv.slice(),
        };
        const nextLetEnv = localLetEnv.slice();
        nextLetEnv.push(closure);
        return evalNode(node.body, zLocal, localParamEnv, localSetEnv, nextLetEnv);
      }
      case 'Call': {
        // Only implement the multi-arg let call path (enough for repeat tests).
        if (!node.callee || node.callee.kind !== 'Identifier') {
          throw new Error('Unsupported Call form in test interpreter');
        }
        const callee = lookupLet(node.callee.name, localLetEnv);
        if (!callee) {
          throw new Error(`Unknown function: ${node.callee.name}`);
        }
        const params = Array.isArray(callee.params) ? callee.params : [];
        const args = Array.isArray(node.args) ? node.args : [];
        if (!(args.length === params.length || args.length === params.length + 1)) {
          throw new Error(`Arity mismatch for ${callee.name}: got ${args.length}`);
        }
        const argValues = [];
        for (let i = 0; i < params.length; i += 1) {
          argValues.push(evalNode(args[i], zLocal, localParamEnv, localSetEnv, localLetEnv));
        }
        const zForBody =
          args.length === params.length + 1
            ? evalNode(args[args.length - 1], zLocal, localParamEnv, localSetEnv, localLetEnv)
            : zLocal;
        const nextParamEnv = new Map();
        for (let i = 0; i < params.length; i += 1) {
          nextParamEnv.set(params[i], argValues[i]);
        }
        return evalNode(callee.expr, zForBody, nextParamEnv, callee.capturedSetEnv, callee.capturedLetEnv);
      }
      case 'Repeat': {
        const n = typeof node.resolvedCount === 'number' ? node.resolvedCount : null;
        if (n === null) {
          throw new Error('Repeat must have resolvedCount in tests');
        }
        const initExprs = Array.isArray(node.fromExpressions) ? node.fromExpressions : [];
        if (initExprs.length < 1) {
          return { re: 0, im: 0 };
        }
        const byNames = Array.isArray(node.byIdentifiers) ? node.byIdentifiers : [];
        const kRegs = initExprs.length;
        if (byNames.length !== kRegs) {
          throw new Error('Repeat by/from length mismatch in tests');
        }
        if (n <= 0) {
          return evalNode(initExprs[0], zLocal, localParamEnv, localSetEnv, localLetEnv);
        }

        // Evaluate initial registers (all of them) once to start the loop.
        let regs = initExprs.map((expr) => evalNode(expr, zLocal, localParamEnv, localSetEnv, localLetEnv));

        for (let i = 0; i < n; i += 1) {
          const nextRegs = new Array(kRegs);
          for (let j = 0; j < kRegs; j += 1) {
            const step = lookupLet(byNames[j], localLetEnv);
            if (!step) throw new Error(`Unknown repeat step: ${byNames[j]}`);
            const params = Array.isArray(step.params) ? step.params : [];
            if (params.length !== kRegs + 1) throw new Error(`Bad arity for repeat step: ${byNames[j]}`);
            const stepParamEnv = new Map();
            stepParamEnv.set(params[0], { re: i, im: 0 });
            for (let r = 0; r < kRegs; r += 1) {
              stepParamEnv.set(params[r + 1], regs[r]);
            }
            nextRegs[j] = evalNode(step.expr, zLocal, stepParamEnv, step.capturedSetEnv, step.capturedLetEnv);
          }
          regs = nextRegs;
        }
        return regs[0];
      }
      default:
        throw new Error(`Unsupported node kind in test interpreter: ${node.kind}`);
    }
  }

  return evalNode(root, z, paramEnv, setEnv, letEnv);
}

function evalLowered(source) {
  const ast = parseFormulaToAST(source);
  const lowered = lowerHighLevelSugar(ast);
  return evaluateAstComplex(lowered);
}

test('repeat: single register increments', () => {
  const source = `
let step(k, r) = r + 1 in
repeat 3 from 0 by step
`.trim();
  const ast = parseFormulaToAST(source);
  const value = evaluateAstComplex(ast);
  assert.equal(value.re, 3);
  assert.equal(value.im, 0);
});

test('repeat: loop index is zero-based', () => {
  const source = `
let step(k, r) = r + k in
repeat 5 from 0 by step
`.trim();
  const ast = parseFormulaToAST(source);
  const value = evaluateAstComplex(ast);
  assert.equal(value.re, 10);
  assert.equal(value.im, 0);
});

test('repeat: multiple registers (Fibonacci)', () => {
  const source = `
let fa(k, a, b) = b in
let fb(k, a, b) = a + b in
repeat 10 from 0, 1 by fa, fb
`.trim();
  const ast = parseFormulaToAST(source);
  const value = evaluateAstComplex(ast);
  assert.equal(value.re, 55);
  assert.equal(value.im, 0);
});

test('repeat: zero iterations returns a1', () => {
  const source = `
let step(k, r) = r + 1 in
repeat 0 from 7 by step
`.trim();
  const ast = parseFormulaToAST(source);
  const value = evaluateAstComplex(ast);
  assert.equal(value.re, 7);
  assert.equal(value.im, 0);
});

test('repeat: n can be a compile-time expression (floor)', () => {
  const source = `
let step(k, r) = r + 1 in
repeat floor(3.9) from 0 by step
`.trim();
  const ast = parseFormulaToAST(source);
  const value = evaluateAstComplex(ast);
  assert.equal(value.re, 3);
  assert.equal(value.im, 0);
});

test('repeat: rejects mismatched lengths between from and by', () => {
  const result = parseFormulaInput(`
let step(k, r) = r + 1 in
repeat 3 from 0, 1 by step
`.trim());
  assert.equal(result.ok, false);
  assert.match(result.message, /requires exactly 2/i);
});

test('repeat: rejects unresolved step function identifiers', () => {
  const result = parseFormulaInput('repeat 3 from 0 by missing');
  assert.equal(result.ok, false);
  assert.match(result.message, /not a user-defined function in scope/i);
});

test('repeat: rejects incorrect step function arity', () => {
  const result = parseFormulaInput(`
let step(k) = k in
repeat 3 from 0 by step
`.trim());
  assert.equal(result.ok, false);
  assert.match(result.message, /must have exactly 2 parameter/i);
});

test('repeat: rejects n that is not compile-time evaluable', () => {
  const result = parseFormulaInput(`
let step(k, r) = r + 1 in
repeat x from 0 by step
`.trim());
  assert.equal(result.ok, false);
  assert.match(result.message, /compile time/i);
});

test('repeat: rejects non-integer n', () => {
  const result = parseFormulaInput(`
let step(k, r) = r + 1 in
repeat 1.5 from 0 by step
`.trim());
  assert.equal(result.ok, false);
  assert.match(result.message, /integer iteration count/i);
});

test('repeat keyword commits (repeat is not treated as an identifier)', () => {
  const result = parseFormulaInput('repeat');
  assert.equal(result.ok, false);
  assert.match(result.message, /iteration count/i);
});

test('sum/prod: display preserves sum/prod surface syntax', () => {
  const sumResult = parseFormulaInput('sum(k, k, 0, 10)');
  assert.equal(sumResult.ok, true);
  assert.equal(sumResult.value.kind, 'Sum');
  const sumLatex = formulaAstToLatex(sumResult.value);
  assert.match(sumLatex, /\\sum/);
  assert.doesNotMatch(sumLatex, /\\mathrm\{repeat\}/);

  const prodResult = parseFormulaInput('prod(k, k, 0, 10)');
  assert.equal(prodResult.ok, true);
  assert.equal(prodResult.value.kind, 'Prod');
  const prodLatex = formulaAstToLatex(prodResult.value);
  assert.match(prodLatex, /\\prod/);
  assert.doesNotMatch(prodLatex, /\\mathrm\{repeat\}/);
});

test('sum/prod: optional step is preserved in display', () => {
  const result = parseFormulaInput('sum(k, k, 0, 10, 2)');
  assert.equal(result.ok, true);
  const latex = formulaAstToLatex(result.value);
  assert.match(latex, /\\operatorname\{sum\}/);
  assert.match(latex, /, 2\\right\)/);
});

test('fractional powers stay as powers in display (including inside sum)', () => {
  const result = parseFormulaInput('sum(z^0.5, n, 1, 2)');
  assert.equal(result.ok, true);
  const latex = formulaAstToLatex(result.value);
  assert.match(latex, /z\^\{0\.5\}/);
  assert.doesNotMatch(latex, /\\exp|\\ln/);
});

test('sum/prod: semantic correctness via repeat lowering', () => {
  const sum14 = evalLowered('sum(k, k, 1, 4)');
  assert.equal(sum14.re, 10);
  assert.equal(sum14.im, 0);

  const prod14 = evalLowered('prod(k, k, 1, 4)');
  assert.equal(prod14.re, 24);
  assert.equal(prod14.im, 0);

  const sumStep = evalLowered('sum(k, k, 1, 5, 2)');
  assert.equal(sumStep.re, 9);
  assert.equal(sumStep.im, 0);

  const sumNeg = evalLowered('sum(k, k, 5, 1, -2)');
  assert.equal(sumNeg.re, 9);
  assert.equal(sumNeg.im, 0);
});

test('sum/prod: bound variable can be named acc/iter (no conflicts with lowering helpers)', () => {
  const sumAcc = evalLowered('sum(acc, acc, 1, 3)');
  assert.equal(sumAcc.re, 6);
  assert.equal(sumAcc.im, 0);

  const sumIter = evalLowered('sum(iter, iter, 1, 3)');
  assert.equal(sumIter.re, 6);
  assert.equal(sumIter.im, 0);
});

test('sum/prod: complex-valued body works (without using i as a variable)', () => {
  const value = evalLowered('sum(k + i, k, 1, 2)');
  assert.equal(value.re, 3);
  assert.equal(value.im, 2);
});

test('sum/prod: scope/capture (bound var shadows outer set binding)', () => {
  const value = evalLowered('set k = 999 in sum(k, k, 1, 3)');
  assert.equal(value.re, 6);
  assert.equal(value.im, 0);
});

test('sum/prod: nested sums reuse same bound name without capture', () => {
  const value = evalLowered('sum(sum(k, k, 1, 2), k, 1, 2)');
  assert.equal(value.re, 6);
  assert.equal(value.im, 0);
});

test('sum/prod: rejects non-compile-time bounds (repeat-count rule)', () => {
  const result = parseFormulaInput('sum(k, k, 1, x)');
  assert.equal(result.ok, false);
  assert.match(result.message, /compile time/i);
});
