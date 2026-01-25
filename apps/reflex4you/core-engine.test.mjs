import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  lowerFunctionParamsForGpu,
  buildFragmentSourceFromAST,
  prepareAstForGpu,
} from './core-engine.mjs';
import { visitAst } from './ast-utils.mjs';

const EPSILON = 1e-9;

function approxEqual(a, b) {
  return Math.abs(a - b) < EPSILON;
}

function approxComplex(a, b) {
  return approxEqual(a.re, b.re) && approxEqual(a.im, b.im);
}

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

function normalizeParamSpecsForTest(paramSpecs, legacyParams = null) {
  if (Array.isArray(paramSpecs)) {
    if (paramSpecs.length === 0) return [];
    const first = paramSpecs[0];
    if (first && typeof first === 'object' && typeof first.kind === 'string') {
      return paramSpecs;
    }
  }
  const params = Array.isArray(legacyParams)
    ? legacyParams
    : (Array.isArray(paramSpecs) ? paramSpecs : []);
  return params.map((name) => ({ name, kind: 'value', args: [] }));
}

function evaluateAstComplex(root, { z = { re: 0, im: 0 } } = {}) {
  const setEnv = new Map(); // SetBinding node -> complex value
  const letEnv = []; // stack of closures
  const paramEnv = new Map(); // param name -> complex value or function value

  function lookupLet(name, envStack) {
    for (let i = envStack.length - 1; i >= 0; i -= 1) {
      if (envStack[i].name === name) return envStack[i];
    }
    return null;
  }

  function asFunctionValue(node, zLocal, localParamEnv, localSetEnv, localLetEnv) {
    if (node && typeof node === 'object') {
      if (node.kind === 'Identifier') {
        const closure = lookupLet(node.name, localLetEnv);
        if (closure) return closure;
      }
      if (node.kind === 'ParamRef') {
        const v = localParamEnv.get(node.name);
        if (v && v.kind === 'closure') return v;
      }
    }
    return {
      kind: 'closure',
      name: '<expr>',
      paramSpecs: [],
      expr: node,
      capturedSetEnv: new Map(localSetEnv),
      capturedLetEnv: localLetEnv.slice(),
      capturedParamEnv: new Map(localParamEnv),
    };
  }

  function applyFunctionValue(fnValue, argValues, zOverride) {
    const specs = Array.isArray(fnValue.paramSpecs) ? fnValue.paramSpecs : [];
    if (argValues.length !== specs.length) {
      throw new Error(`Function arity mismatch: expected ${specs.length}, got ${argValues.length}`);
    }
    const nextParamEnv = new Map(fnValue.capturedParamEnv || []);
    for (let i = 0; i < specs.length; i += 1) {
      const spec = specs[i];
      nextParamEnv.set(spec.name, argValues[i]);
    }
    const zLocal = zOverride ?? { re: 0, im: 0 };
    return evalNode(fnValue.expr, zLocal, nextParamEnv, fnValue.capturedSetEnv, fnValue.capturedLetEnv);
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
        if (node.paramKind === 'fn' || (v && v.kind === 'closure')) {
          const specLen = Array.isArray(v.paramSpecs) ? v.paramSpecs.length : 0;
          if (specLen > 0) {
            throw new Error(`ParamRef "${node.name}" with ${specLen} args must be called`);
          }
          return applyFunctionValue(v, [], zLocal);
        }
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
      case 'LessThan': {
        const left = evalNode(node.left, zLocal, localParamEnv, localSetEnv, localLetEnv);
        const right = evalNode(node.right, zLocal, localParamEnv, localSetEnv, localLetEnv);
        return { re: left.re < right.re ? 1 : 0, im: 0 };
      }
      case 'If': {
        const cond = evalNode(node.condition, zLocal, localParamEnv, localSetEnv, localLetEnv);
        const flag = cond.re !== 0 || cond.im !== 0;
        return flag
          ? evalNode(node.thenBranch, zLocal, localParamEnv, localSetEnv, localLetEnv)
          : evalNode(node.elseBranch, zLocal, localParamEnv, localSetEnv, localLetEnv);
      }
      case 'Sin': {
        const v = evalNode(node.value, zLocal, localParamEnv, localSetEnv, localLetEnv);
        return { re: Math.sin(v.re), im: 0 };
      }
      case 'Cos': {
        const v = evalNode(node.value, zLocal, localParamEnv, localSetEnv, localLetEnv);
        return { re: Math.cos(v.re), im: 0 };
      }
      case 'Sum':
      case 'Prod': {
        const n = typeof node.resolvedCount === 'number' ? node.resolvedCount : null;
        if (n === null) throw new Error('Sum/Prod requires resolvedCount');
        const minNode = node.min;
        const stepNode = node.step;
        const minValue = evalNode(minNode, zLocal, localParamEnv, localSetEnv, localLetEnv);
        const stepValue = stepNode
          ? evalNode(stepNode, zLocal, localParamEnv, localSetEnv, localLetEnv)
          : { re: 1, im: 0 };
        const min = minValue.re;
        const step = stepValue.re;
        let acc = node.kind === 'Sum' ? { re: 0, im: 0 } : { re: 1, im: 0 };
        if (n <= 0) return acc;
        const varName = String(node.varName || 'n');
        for (let i = 0; i < n; i += 1) {
          const nextParamEnv = new Map(localParamEnv);
          nextParamEnv.set(varName, { re: min + i * step, im: 0 });
          const term = evalNode(node.body, zLocal, nextParamEnv, localSetEnv, localLetEnv);
          acc = node.kind === 'Sum' ? complexAdd(acc, term) : complexMul(acc, term);
        }
        return acc;
      }
      case 'Compose': {
        const inner = evalNode(node.g, zLocal, localParamEnv, localSetEnv, localLetEnv);
        return evalNode(node.f, inner, localParamEnv, localSetEnv, localLetEnv);
      }
      case 'SetBinding': {
        const value = evalNode(node.value, zLocal, localParamEnv, localSetEnv, localLetEnv);
        const nextSetEnv = new Map(localSetEnv);
        nextSetEnv.set(node, value);
        return evalNode(node.body, zLocal, localParamEnv, nextSetEnv, localLetEnv);
      }
      case 'LetBinding': {
        const paramSpecs = normalizeParamSpecsForTest(node.paramSpecs, node.params);
        const closure = {
          kind: 'closure',
          name: node.name,
          paramSpecs,
          expr: node.value,
          capturedSetEnv: new Map(localSetEnv),
          capturedLetEnv: localLetEnv.slice(),
          capturedParamEnv: new Map(localParamEnv),
        };
        const nextLetEnv = localLetEnv.slice();
        nextLetEnv.push(closure);
        return evalNode(node.body, zLocal, localParamEnv, localSetEnv, nextLetEnv);
      }
      case 'Call': {
        const args = Array.isArray(node.args) ? node.args : [];
        const fnValue = asFunctionValue(node.callee, zLocal, localParamEnv, localSetEnv, localLetEnv);
        const paramSpecs = Array.isArray(fnValue.paramSpecs) ? fnValue.paramSpecs : [];
        if (!(args.length === paramSpecs.length || args.length === paramSpecs.length + 1)) {
          throw new Error(`Arity mismatch for call: got ${args.length}`);
        }
        const argValues = [];
        for (let i = 0; i < paramSpecs.length; i += 1) {
          const spec = paramSpecs[i];
          if (spec.kind === 'fn') {
            argValues.push(asFunctionValue(args[i], zLocal, localParamEnv, localSetEnv, localLetEnv));
          } else {
            argValues.push(evalNode(args[i], zLocal, localParamEnv, localSetEnv, localLetEnv));
          }
        }
        const zForBody =
          args.length === paramSpecs.length + 1
            ? evalNode(args[args.length - 1], zLocal, localParamEnv, localSetEnv, localLetEnv)
            : zLocal;
        return applyFunctionValue(fnValue, argValues, zForBody);
      }
      default:
        throw new Error(`Unsupported node kind in test interpreter: ${node.kind}`);
    }
  }

  return evalNode(root, z, paramEnv, setEnv, letEnv);
}

function assertNoHigherOrderParams(ast) {
  const violations = [];
  visitAst(ast, (node) => {
    if (node.kind === 'LetBinding') {
      const specs = normalizeParamSpecsForTest(node.paramSpecs, node.params);
      if (specs.some((spec) => spec && spec.kind === 'fn')) {
        violations.push(`let ${node.name || '?'} has function params`);
      }
    }
    if (node.kind === 'ParamRef') {
      if (node.paramKind === 'fn' || node.paramSpec?.kind === 'fn') {
        violations.push(`param ${node.name || '?'} remains function-typed`);
      }
    }
  });
  assert.equal(violations.length, 0, `Expected no higher-order params, found: ${violations.join('; ')}`);
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

test('repeat composition inside let bindings compiles (let fn = z $$ 2 in fn)', () => {
  const parsed = parseFormulaInput('let fn = z $$ 2 in fn');
  assert.equal(parsed.ok, true);
  const fragment = buildFragmentSourceFromAST(parsed.value);
  // Regression: materializeComposeMultiples must traverse into LetBinding.value.
  // If it doesn't, SSA compilation will see an unhandled ComposeMultiple and emit 0.
  assert.match(fragment, /vec2 let_fn_0\(vec2 z\)\s*\{\s*return z;\s*\}/);
});

test('identifier resolution traverses all parsed function-call nodes (regression guard)', () => {
  // This test is designed to fail if a new AST node kind is added (and exposed via
  // a callable function like `fact(...)`) but the identifier-resolution pass forgets
  // to traverse into it. That exact bug yields:
  //   "Unresolved Identifier during GPU compilation: n"
  // because `n` remains an `Identifier` (never visited) instead of becoming `ParamRef`.
  const parserSource = fs.readFileSync(new URL('./arithmetic-parser.mjs', import.meta.url), 'utf8');
  const start = parserSource.indexOf('const elementaryFunctionParser = Choice([');
  assert.ok(start >= 0, 'Expected elementaryFunctionParser in arithmetic-parser.mjs');
  const end = parserSource.indexOf('], { ctor: \'ElementaryFunction\' });', start);
  assert.ok(end > start, 'Expected end of elementaryFunctionParser Choice([...])');
  const section = parserSource.slice(start, end);

  const unary = new Set();
  const binary = new Set();

  // createUnaryFunctionParsers(['atan', 'arctan'], Atan)
  const unaryListRe = /createUnaryFunctionParsers\(\s*\[([^\]]+)\]/g;
  for (let m = unaryListRe.exec(section); m; m = unaryListRe.exec(section)) {
    const list = m[1] || '';
    const strRe = /'([^']+)'/g;
    for (let s = strRe.exec(list); s; s = strRe.exec(list)) {
      unary.add(s[1]);
    }
  }

  // createBinaryFunctionParser('ifnan', ...)
  const binaryRe = /createBinaryFunctionParser\(\s*'([^']+)'/g;
  for (let m = binaryRe.exec(section); m; m = binaryRe.exec(section)) {
    binary.add(m[1]);
  }

  // createArgParser('arg') / createArgParser('argument')
  const argRe = /createArgParser\(\s*'([^']+)'/g;
  for (let m = argRe.exec(section); m; m = argRe.exec(section)) {
    unary.add(m[1]);
  }

  // lnParser / sqrtParser are explicitly listed by identifier.
  if (section.includes('lnParser')) unary.add('ln');
  if (section.includes('sqrtParser')) unary.add('sqrt');

  // sum/prod are special syntax forms, not needed for this test.
  unary.delete('sum');
  unary.delete('prod');
  binary.delete('sum');
  binary.delete('prod');

  const all = Array.from(new Set([...unary, ...binary])).sort();
  assert.ok(all.length > 0, 'Expected at least one parsed function call to test');

  for (const fn of all) {
    const callExpr = binary.has(fn) ? `${fn}(n, 0)` : `${fn}(n)`;
    const parsed = parseFormulaInput(`let f(n) = ${callExpr} in f(1)`);
    assert.equal(parsed.ok, true, `Expected parse ok for "${fn}"`);
    assert.doesNotThrow(
      () => buildFragmentSourceFromAST(parsed.value),
      `Expected GPU compile ok for "${fn}"`,
    );
  }
});

test('let alias preserves captured set bindings (set d = 1 in let f = z + d in let g = f in g)', () => {
  const parsed = parseFormulaInput('set d = 1 in let f = z + d in let g = f in g');
  assert.equal(parsed.ok, true);
  let fragment = '';
  assert.doesNotThrow(() => {
    fragment = buildFragmentSourceFromAST(parsed.value);
  });
  // At least one let-bound function should capture a set binding.
  assert.match(fragment, /cap_s_/);
  assert.doesNotMatch(fragment, /undefined/);
});

test('function-param lowering preserves evaluation and removes higher-order params', () => {
  const cases = [
    {
      name: 'arity-0 function param with expression argument',
      source: `
let min(w) = if(w < z, w, z) in
let apply1(let filter) = z - 3 $ filter $ z + 3 in
apply1(min(0))
`.trim(),
      zValues: [{ re: -2, im: 0 }, { re: 0.5, im: 0 }, { re: 3, im: 0 }],
    },
    {
      name: 'arity-1 function param with function identifier',
      source: `
let min(w) = if(w < z, w, z) in
let apply1(let filter(w), w0) = z - 3 $ filter(w0 + 1) $ z + 3 in
apply1(min, 0.2)
`.trim(),
      zValues: [{ re: -1, im: 0 }, { re: 1.5, im: 0 }],
    },
    {
      name: 'nested function-param signatures',
      source: `
let apply0 = z + 2 in
let apply1(let f) = f $ (z + 1) in
let apply2(let apply1(let apply0), let apply0, c) = apply1(apply0) + c in
apply2(apply1, apply0, 2)
`.trim(),
      zValues: [{ re: -1, im: 0 }, { re: 2, im: 0 }],
    },
    {
      name: 'derivative higher-order function',
      source: `
let derivative(let f) = (f(z + 0.001) - f(z)) / 0.001 in
derivative(sin)
`.trim(),
      zValues: [{ re: -1, im: 0 }, { re: 0.5, im: 0 }],
      expect: (zVal, result) => {
        const expected = Math.cos(zVal.re);
        assert.ok(
          Math.abs(result.re - expected) < 5e-3,
          `Expected derivative approx cos(${zVal.re}), got ${result.re}`,
        );
      },
    },
    {
      name: 'derivative along parameter function',
      source: `
let derivativeX(let f(w), w) = (f(w + 0.001) - f(w)) / 0.001 in
let derivativeY(let f(w), w) = (f(w, z + 0.001) - f(w, z)) / 0.001 in
let s(w) = sin(w) * z in
derivativeX(s, 0) + derivativeY(s, z, 0)
`.trim(),
      zValues: [{ re: -0.4, im: 0 }, { re: 0.7, im: 0 }],
    },
    {
      name: 'integral of sin (finite sum)',
      source: `
let integral(let f, start) =
  set N = 100 in
  set w = (z - start) / N in
  sum(set x0 = f(start + n * w) in x0 * w, n, 0, N)
in
integral(sin, 0) - 1
`.trim(),
      zValues: [{ re: 0.5, im: 0 }, { re: 1.0, im: 0 }],
      expect: (zVal, result) => {
        const expected = -Math.cos(zVal.re);
        assert.ok(
          Math.abs(result.re - expected) < 0.02,
          `Expected integral approx -cos(${zVal.re}), got ${result.re}`,
        );
      },
    },
  ];

  for (const testCase of cases) {
    const parsed = parseFormulaInput(testCase.source);
    assert.equal(parsed.ok, true, `Expected parse ok for ${testCase.name}`);
    const original = parsed.value;
    const lowered = lowerFunctionParamsForGpu(original);
    for (const zValue of testCase.zValues) {
      const expected = evaluateAstComplex(original, { z: zValue });
      const actual = evaluateAstComplex(lowered, { z: zValue });
      assert.ok(
        approxComplex(expected, actual),
        `Mismatch for ${testCase.name} at z=${JSON.stringify(zValue)}: ${JSON.stringify(expected)} vs ${JSON.stringify(actual)}`,
      );
      if (typeof testCase.expect === 'function') {
        testCase.expect(zValue, expected);
      }
    }
    const prepared = prepareAstForGpu(original);
    assertNoHigherOrderParams(prepared);
    assert.doesNotThrow(
      () => buildFragmentSourceFromAST(original),
      `Expected GPU compilation to succeed for ${testCase.name}`,
    );
  }
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
