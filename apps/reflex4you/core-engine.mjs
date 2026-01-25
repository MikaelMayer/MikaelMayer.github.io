// Core engine for Reflex4You: AST helpers, GLSL generation, and renderer

import { cloneAst } from './ast-utils.mjs';

// =========================
// AST constructors
// =========================

export function VarX() {
  return { kind: "VarX" };
}

export function VarY() {
  return { kind: "VarY" };
}

export function VarZ() {
  return { kind: "Var", name: "z" };
}

export function Pow(base, exponent) {
  if (!Number.isFinite(exponent) || !Number.isInteger(exponent)) {
    throw new Error("Pow expects an integer exponent");
  }
  return { kind: "Pow", base, exponent };
}

// Workspace frame labels.
// `W0` enables the intuitive default-normalization `(z - W0)/(W1 - W0)` with W0=0 and W1=1.
const W_FINGER_LABELS = Object.freeze(["W0", "W1", "W2"]);

function parseFingerLabel(label) {
  if (!label || typeof label !== "string") {
    return null;
  }
  // W0 is the "zero" end of the workspace pair (W0/W1).
  // It shares the same uniform slot index as W2, but is NOT kept in sync with W2.
  if (label === "W0") {
    return { family: "w", index: 1 };
  }
  if (label === "W1") {
    return { family: "w", index: 0 };
  }
  if (label === "W2") {
    return { family: "w", index: 1 };
  }
  const match = /^([FD])(\d+)$/.exec(label);
  if (!match) {
    return null;
  }
  const prefix = match[1];
  const rawIndex = Number(match[2]);
  if (!Number.isInteger(rawIndex) || rawIndex < 0) {
    return null;
  }
  // Support `F0`/`D0` as 0-based aliases of the first slot (same as `F1`/`D1`).
  // This avoids breaking legacy formulas that already use `F1`/`D1`.
  const index = rawIndex === 0 ? 0 : rawIndex - 1;
  return {
    family: prefix === "F" ? "fixed" : "dynamic",
    index,
  };
}

function validateFingerLabel(slot) {
  const parsed = parseFingerLabel(slot);
  if (!parsed) {
    throw new Error(`Unknown finger slot: ${slot}`);
  }
  return slot;
}

export function FingerOffset(slot) {
  return { kind: "FingerOffset", slot: validateFingerLabel(slot) };
}

const SU2_SLOTS = Object.freeze(['A', 'B']);

function validateSu2Slot(slot) {
  const normalized = String(slot || '');
  if (!SU2_SLOTS.includes(normalized)) {
    throw new Error(`Unknown SU(2) slot: ${slot}`);
  }
  return normalized;
}

// SU(2) rotations are represented as a pair of complex numbers (A, B) with |A|^2 + |B|^2 = 1.
// - `DeviceRotation('A'|'B')` exposes the device orientation as a *relative* SU(2) element.
// - `TrackballRotation('A'|'B')` exposes a draggable SU(2) element (trackball UI).
export function DeviceRotation(slot) {
  return { kind: 'DeviceRotation', slot: validateSu2Slot(slot) };
}

export function TrackballRotation(slot) {
  return { kind: 'TrackballRotation', slot: validateSu2Slot(slot) };
}

export function Offset() {
  return FingerOffset("F1");
}

export function Offset2() {
  return FingerOffset("F2");
}

export function Sub(left, right) {
  return { kind: "Sub", left, right };
}

export function Mul(left, right) {
  return { kind: "Mul", left, right };
}

export function Op(left, right, op) {
  return { kind: "Op", left, right, op };
}

export function Add(left, right) {
  return { kind: "Add", left, right };
}

export function Div(left, right) {
  return { kind: "Div", left, right };
}
export function LessThan(left, right) {
  return { kind: "LessThan", left, right };
}

export function GreaterThan(left, right) {
  return { kind: "GreaterThan", left, right };
}

export function LessThanOrEqual(left, right) {
  return { kind: "LessThanOrEqual", left, right };
}

export function GreaterThanOrEqual(left, right) {
  return { kind: "GreaterThanOrEqual", left, right };
}

export function Equal(left, right) {
  return { kind: "Equal", left, right };
}

export function LogicalAnd(left, right) {
  return { kind: "LogicalAnd", left, right };
}

export function LogicalOr(left, right) {
  return { kind: "LogicalOr", left, right };
}

export function If(condition, thenBranch, elseBranch) {
  return { kind: "If", condition, thenBranch, elseBranch };
}

// IfNaN(value, fallback):
// - evaluates `value` once
// - if that value is an "error" (NaN/Inf/overflow sentinel), returns `fallback`
// - otherwise returns the original `value`
export function IfNaN(value, fallback) {
  return { kind: "IfNaN", value, fallback };
}

export function Const(re, im) {
  return { kind: "Const", re, im };
}

export function Compose(f, g) {
  return { kind: "Compose", f, g };
}

export function Exp(value) {
  return { kind: "Exp", value };
}

export function Sin(value) {
  return { kind: "Sin", value };
}

export function Cos(value) {
  return { kind: "Cos", value };
}

export function Tan(value) {
  return { kind: "Tan", value };
}

export function Atan(value) {
  return { kind: "Atan", value };
}

// arg(z, [k]): argument/phase of a complex number (returns a real angle as a complex with imag=0).
// If k is provided, it is forwarded to ln(z, k) to control the branch cut (Arg = imag(ln)).
export function Arg(value, branch = null) {
  return { kind: "Arg", value, branch };
}

export function Asin(value) {
  return { kind: "Asin", value };
}

export function Acos(value) {
  return { kind: "Acos", value };
}

export function Ln(value, branch = null) {
  return { kind: "Ln", value, branch };
}

// Euler's Gamma function Γ(z) for complex z.
export function Gamma(value) {
  return { kind: 'Gamma', value };
}

// Factorial for complex z: fact(z) = Γ(z + 1).
export function Fact(value) {
  return { kind: 'Fact', value };
}

export function Abs(value) {
  return { kind: "Abs", value };
}

export function Abs2(value) {
  return { kind: "Abs2", value };
}

export function Floor(value) {
  return { kind: "Floor", value };
}

export function Conjugate(value) {
  return { kind: "Conjugate", value };
}

// Formula language: `isnan(expr)` -> returns 1+0i when `expr` is an error value, else 0+0i.
// "Error" matches the renderer's handling: non-finite values or overflow-sentinel magnitude.
export function IsNaN(value) {
  return { kind: "IsNaN", value };
}

// Cap repeat/compose unrolling to keep compile times bounded.
export const MAX_REPEAT_UNROLL = 512;

export function oo(f, n) {
  const count = Number(n);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("oo expects a positive integer repeat count");
  }
  let node = f;
  for (let i = 1; i < count; i += 1) {
    node = Compose(node, f);
  }
  return node;
}

function analyzeFingerUniformCounts(ast) {
  let maxFixed = -1;
  let maxDynamic = -1;
  function visit(node) {
    if (!node || typeof node !== "object") {
      return;
    }
    if (node.kind === "FingerOffset") {
      const parsed = parseFingerLabel(node.slot);
      if (parsed) {
        if (parsed.family === "fixed") {
          maxFixed = Math.max(maxFixed, parsed.index);
        } else if (parsed.family === "dynamic") {
          maxDynamic = Math.max(maxDynamic, parsed.index);
        }
      }
      return;
    }
    switch (node.kind) {
      case "Call":
        visit(node.callee);
        if (Array.isArray(node.args)) {
          node.args.forEach((arg) => visit(arg));
        }
        return;
      case "LetBinding":
        visit(node.value);
        visit(node.body);
        return;
      case "Pow":
        visit(node.base);
        return;
      case "Exp":
      case "Sin":
      case "Cos":
      case "Tan":
      case "Atan":
      case "Asin":
      case "Acos":
      case "Abs":
      case "Abs2":
      case "Floor":
      case "Conjugate":
      case "IsNaN":
        visit(node.value);
        return;
      case "Arg":
        visit(node.value);
        if (node.branch) {
          visit(node.branch);
        }
        return;
      case "Ln":
        visit(node.value);
        if (node.branch) {
          visit(node.branch);
        }
        return;
      case "ComposeMultiple":
        // Produced by the parser for the `$$` operator (repeat composition).
        // Even though we later materialize this node before generating GLSL,
        // we must count finger usage here so uniform arrays are sized large
        // enough on the first render (before any formula edit).
        visit(node.base);
        if (node.countExpression) {
          visit(node.countExpression);
        }
        return;
      case "RepeatComposePlaceholder":
        // Should not reach the renderer (placeholders are resolved during parse),
        // but handle defensively so uniform sizing never under-allocates.
        visit(node.base);
        if (node.countExpression) {
          visit(node.countExpression);
        }
        return;
      case "Sub":
      case "Mul":
      case "Op":
      case "Add":
      case "Div":
      case "LessThan":
      case "GreaterThan":
      case "LessThanOrEqual":
      case "GreaterThanOrEqual":
      case "Equal":
      case "LogicalAnd":
      case "LogicalOr":
        visit(node.left);
        visit(node.right);
        return;
      case "If":
        visit(node.condition);
        visit(node.thenBranch);
        visit(node.elseBranch);
        return;
      case "IfNaN":
        visit(node.value);
        visit(node.fallback);
        return;
      case "Compose":
        visit(node.f);
        visit(node.g);
        return;
      case "SetBinding":
        visit(node.value);
        visit(node.body);
        return;
      case "SetRef":
      case "ParamRef":
      case "Identifier":
      case "Var":
      case "VarX":
      case "VarY":
      case "Const":
        return;
      default:
        return;
    }
  }
  visit(ast);
  return {
    fixedCount: Math.max(1, maxFixed + 1),
    dynamicCount: Math.max(1, maxDynamic + 1),
    wCount: 2,
  };
}

function materializeComposeMultiples(ast) {
  // IMPORTANT: materialization is for shader code generation only. It must not
  // mutate the original AST, because the UI formula display should keep
  // `ComposeMultiple` compact (e.g. render as "^{\\circ 40}" instead of 40 chained
  // compositions).
  let root = cloneAst(ast, { preserveBindings: true });

  function tryResolveStaticRepeatCount(expr) {
    // Best-effort fallback for legacy/unresolved `RepeatComposePlaceholder`.
    // Full resolution (including finger-dependent constant folding) is handled
    // during parsing in arithmetic-parser.mjs; this is only to avoid silently
    // dropping `$$ n` when `n` is a plain literal.
    if (!expr || typeof expr !== 'object') {
      return null;
    }
    if (expr.kind !== 'Const') {
      return null;
    }
    const re = Number(expr.re);
    const im = Number(expr.im);
    if (!Number.isFinite(re) || !Number.isFinite(im)) {
      return null;
    }
    // Require a real integer within a tiny tolerance.
    if (Math.abs(im) > 1e-9) {
      return null;
    }
    const rounded = Math.round(re);
    if (Math.abs(re - rounded) > 1e-9) {
      return null;
    }
    if (rounded < 0) {
      return null;
    }
    return rounded;
  }

  function visit(node, parent, key) {
    if (!node || typeof node !== "object") {
      return;
    }
    if (node.kind === "RepeatComposePlaceholder") {
      // This is an intermediate parser node (used while resolving `$$` repeat
      // counts). It should not reach GPU code generation, but handle it
      // defensively to avoid crashes if it leaks through (e.g. older links).
      if (node.base) {
        visit(node.base, node, "base");
      }
      if (node.countExpression) {
        visit(node.countExpression, node, "countExpression");
      }
      const count = tryResolveStaticRepeatCount(node.countExpression);
      if (count !== null && count > MAX_REPEAT_UNROLL) {
        throw new Error(`Repeat composition count must be <= ${MAX_REPEAT_UNROLL} (got ${count})`);
      }
      let replacement;
      if (count === null) {
        replacement = node.base || VarZ();
      } else if (count <= 0) {
        replacement = VarZ();
      } else if (count === 1) {
        replacement = node.base || VarZ();
      } else {
        replacement = oo(node.base || VarZ(), count);
      }
      if (node.span && replacement && typeof replacement === "object") {
        replacement.span = node.span;
        replacement.input = node.input;
      }
      if (parent && key) {
        parent[key] = replacement;
        visit(parent[key], parent, key);
      } else {
        root = replacement;
        visit(root, null, null);
      }
      return;
    }
    if (node.kind === "ComposeMultiple") {
      if (node.base) {
        visit(node.base, node, "base");
      }
      const count = typeof node.resolvedCount === "number" ? node.resolvedCount : null;
      if (count !== null && count > MAX_REPEAT_UNROLL) {
        throw new Error(`Repeat composition count must be <= ${MAX_REPEAT_UNROLL} (got ${count})`);
      }
      let replacement;
      if (count === null) {
        replacement = node.base || VarZ();
      } else if (count <= 0) {
        replacement = VarZ();
      } else if (count === 1) {
        replacement = node.base;
      } else {
        replacement = oo(node.base, count);
      }
      if (node.span && replacement && typeof replacement === "object") {
        replacement.span = node.span;
        replacement.input = node.input;
      }
      if (parent && key) {
        parent[key] = replacement;
        visit(parent[key], parent, key);
      } else {
        root = replacement;
        visit(root, null, null);
      }
      return;
    }
    switch (node.kind) {
      case "LetBinding":
        visit(node.value, node, "value");
        visit(node.body, node, "body");
        return;
      case "Pow":
        visit(node.base, node, "base");
        return;
      case "Exp":
      case "Sin":
      case "Cos":
      case "Tan":
      case "Atan":
      case "Asin":
      case "Acos":
      case "Abs":
      case "Abs2":
      case "Floor":
      case "Conjugate":
      case "IsNaN":
        visit(node.value, node, "value");
        return;
      case "Arg":
        visit(node.value, node, "value");
        if (node.branch) {
          visit(node.branch, node, "branch");
        }
        return;
      case "Ln":
        visit(node.value, node, "value");
        if (node.branch) {
          visit(node.branch, node, "branch");
        }
        return;
      case "Sub":
      case "Mul":
      case "Op":
      case "Add":
      case "Div":
      case "LessThan":
      case "GreaterThan":
      case "LessThanOrEqual":
      case "GreaterThanOrEqual":
      case "Equal":
      case "LogicalAnd":
      case "LogicalOr":
        visit(node.left, node, "left");
        visit(node.right, node, "right");
        return;
      case "Compose":
        visit(node.f, node, "f");
        visit(node.g, node, "g");
        return;
      case "If":
        visit(node.condition, node, "condition");
        visit(node.thenBranch, node, "thenBranch");
        visit(node.elseBranch, node, "elseBranch");
        return;
      case "IfNaN":
        visit(node.value, node, "value");
        visit(node.fallback, node, "fallback");
        return;
      case "SetBinding":
        visit(node.value, node, "value");
        visit(node.body, node, "body");
        return;
      default:
        return;
    }
  }
  visit(root, null, null);
  return root;
}

function materializeRepeatLoops(ast) {
  // Like materializeComposeMultiples: GPU-only lowering that must not mutate the
  // original AST (UI rendering should keep `Repeat` intact).
  let root = cloneAst(ast, { preserveBindings: true });

  let nextRepeatId = 0;
  const nextPrefix = () => `r4y_repeat_${nextRepeatId++}`;

  function resolveLetBindingByName(name, letStack) {
    const target = String(name || '');
    for (let i = (letStack?.length || 0) - 1; i >= 0; i -= 1) {
      const entry = letStack[i];
      if (entry && typeof entry === 'object' && entry.kind === 'LetBinding' && entry.name === target) {
        return entry;
      }
    }
    return null;
  }

  function visit(node, parent, key, letStack = []) {
    if (!node || typeof node !== 'object') {
      return;
    }

    if (node.kind === 'Repeat') {
      const span = node.span ?? null;
      const n = typeof node.resolvedCount === 'number' ? node.resolvedCount : null;
      if (n === null || !Number.isInteger(n)) {
        throw new Error('Repeat iteration count must be resolved to an integer at compile time');
      }
      if (n > MAX_REPEAT_UNROLL) {
        throw new Error(`Repeat iteration count must be <= ${MAX_REPEAT_UNROLL} (got ${n})`);
      }

      const fromExprs = Array.isArray(node.fromExpressions) ? node.fromExpressions : [];
      const k = fromExprs.length;
      if (k < 1) {
        throw new Error('Repeat requires at least one initial register value');
      }
      const byNames = Array.isArray(node.byIdentifiers) ? node.byIdentifiers : [];
      if (byNames.length !== k) {
        throw new Error(`Repeat requires ${k} step functions (got ${byNames.length})`);
      }

      // Validate step function existence/arity defensively (parser should have done this).
      for (let j = 0; j < k; j += 1) {
        const binding = resolveLetBindingByName(byNames[j], letStack);
        if (!binding) {
          throw new Error(`Repeat step function "${byNames[j]}" is not in scope`);
        }
        const arity = Array.isArray(binding.params) ? binding.params.length : 0;
        if (arity !== k + 1) {
          throw new Error(`Repeat step function "${byNames[j]}" must have arity ${k + 1} (got ${arity})`);
        }
      }

      // n <= 0 => zero iterations => return a1 (and do not evaluate a2..ak)
      if (n <= 0) {
        const replacement = fromExprs[0] ?? Const(0, 0);
        if (span && replacement && typeof replacement === 'object') {
          replacement.span = span;
          replacement.input = node.input;
        }
        if (parent && key) {
          parent[key] = replacement;
          visit(parent[key], parent, key, letStack);
        } else {
          root = replacement;
          visit(root, null, null, letStack);
        }
        return;
      }

      const prefix = nextPrefix();
      const bindings = [];

      function makeBinding(name, valueExpr) {
        const b = SetBindingNode(name, valueExpr, null);
        if (span) {
          b.span = span;
          b.input = node.input;
        }
        bindings.push(b);
        return b;
      }

      const regBindingByJI = Array.from({ length: k }, () => []);
      const tempBindingByJI = Array.from({ length: k }, () => []);

      // Initial registers r_j,0 = a_j (a_j not evaluated unless used)
      for (let j = 0; j < k; j += 1) {
        const name = `${prefix}_r${j + 1}_i0`;
        const b = makeBinding(name, fromExprs[j]);
        regBindingByJI[j][0] = b;
      }

      for (let i = 0; i < n; i += 1) {
        const iConst = Const(i, 0);
        if (span) {
          iConst.span = span;
          iConst.input = node.input;
        }

        // Temporaries from previous iteration's registers
        for (let j = 0; j < k; j += 1) {
          const tName = `${prefix}_t${j + 1}_i${i}`;
          const args = [iConst];
          for (let r = 0; r < k; r += 1) {
            const rBinding = regBindingByJI[r][i];
            args.push(SetRef(rBinding.name, rBinding));
          }
          const callNode = { kind: 'Call', callee: { kind: 'Identifier', name: byNames[j] }, args };
          if (span) {
            callNode.span = span;
            callNode.input = node.input;
            callNode.callee.span = span;
            callNode.callee.input = node.input;
          }
          const tBinding = makeBinding(tName, callNode);
          tempBindingByJI[j][i] = tBinding;
        }

        // Next registers from temporaries
        for (let j = 0; j < k; j += 1) {
          const rName = `${prefix}_r${j + 1}_i${i + 1}`;
          const tBinding = tempBindingByJI[j][i];
          const rValue = SetRef(tBinding.name, tBinding);
          const rBinding = makeBinding(rName, rValue);
          regBindingByJI[j][i + 1] = rBinding;
        }
      }

      const finalBinding = regBindingByJI[0][n];
      const finalExpr = SetRef(finalBinding.name, finalBinding);
      if (span) {
        finalExpr.span = span;
        finalExpr.input = node.input;
      }

      for (let idx = 0; idx < bindings.length; idx += 1) {
        bindings[idx].body = idx + 1 < bindings.length ? bindings[idx + 1] : finalExpr;
      }

      const replacement = bindings[0] ?? finalExpr;
      if (parent && key) {
        parent[key] = replacement;
        visit(parent[key], parent, key, letStack);
      } else {
        root = replacement;
        visit(root, null, null, letStack);
      }
      return;
    }

    switch (node.kind) {
      case 'LetBinding': {
        // value sees current letStack; body sees the binding in scope
        visit(node.value, node, 'value', letStack);
        const nextStack = Array.isArray(letStack) ? [...letStack, node] : [node];
        visit(node.body, node, 'body', nextStack);
        return;
      }
      case 'SetBinding':
        visit(node.value, node, 'value', letStack);
        visit(node.body, node, 'body', letStack);
        return;
      case 'Pow':
        visit(node.base, node, 'base', letStack);
        return;
      case 'Exp':
      case 'Sin':
      case 'Cos':
      case 'Tan':
      case 'Atan':
      case 'Asin':
      case 'Acos':
      case 'Arg':
      case 'Gamma':
      case 'Fact':
      case 'Abs':
      case 'Abs2':
      case 'Floor':
      case 'Conjugate':
      case 'IsNaN':
        visit(node.value, node, 'value', letStack);
        return;
      case 'Ln':
        visit(node.value, node, 'value', letStack);
        if (node.branch) visit(node.branch, node, 'branch', letStack);
        return;
      case 'Sub':
      case 'Mul':
      case 'Op':
      case 'Add':
      case 'Div':
      case 'LessThan':
      case 'GreaterThan':
      case 'LessThanOrEqual':
      case 'GreaterThanOrEqual':
      case 'Equal':
      case 'LogicalAnd':
      case 'LogicalOr':
        visit(node.left, node, 'left', letStack);
        visit(node.right, node, 'right', letStack);
        return;
      case 'Compose':
        visit(node.f, node, 'f', letStack);
        visit(node.g, node, 'g', letStack);
        return;
      case 'If':
        visit(node.condition, node, 'condition', letStack);
        visit(node.thenBranch, node, 'thenBranch', letStack);
        visit(node.elseBranch, node, 'elseBranch', letStack);
        return;
      case 'IfNaN':
        visit(node.value, node, 'value', letStack);
        visit(node.fallback, node, 'fallback', letStack);
        return;
      case 'ComposeMultiple':
        visit(node.base, node, 'base', letStack);
        if (node.countExpression) visit(node.countExpression, node, 'countExpression', letStack);
        return;
      case 'RepeatComposePlaceholder':
        visit(node.base, node, 'base', letStack);
        if (node.countExpression) visit(node.countExpression, node, 'countExpression', letStack);
        return;
      default:
        return;
    }
  }

  visit(root, null, null, []);
  return root;
}

function prepareAstForGpu(ast) {
  // GPU compilation now does explicit environment passing (no global slots),
  // but we also need a stable, non-mutating clone that preserves SetRef graphs
  // AND a late lowering phase for high-level surface sugar (sum/prod, PowExpr).
  const cloned = cloneAst(ast, { preserveBindings: true });
  return lowerHighLevelSugar(cloned);
}

// =========================
// Late lowering (GPU-only)
// =========================
//
// IMPORTANT:
// - This pass runs on the GPU AST only (a clone). The UI keeps the original AST
//   so the formula renderer can preserve user-entered syntax like `sum(...)` and `z^0.5`.
// - `Repeat` nodes must have `resolvedCount` populated (parser responsibility).
export function lowerHighLevelSugar(ast) {
  let root = ast;
  let nextId = 0;

  function collectLetNames(letStack) {
    const out = new Set();
    (Array.isArray(letStack) ? letStack : []).forEach((n) => {
      if (n && typeof n.name === 'string' && n.name) {
        out.add(n.name);
      }
    });
    return out;
  }

  function freshName(prefix, letStack) {
    const taken = collectLetNames(letStack);
    while (true) {
      const candidate = `${prefix}_${nextId++}`;
      if (!taken.has(candidate)) {
        return candidate;
      }
    }
  }

  function freshParam(prefix, avoidNames = new Set()) {
    const avoid = avoidNames instanceof Set ? avoidNames : new Set(avoidNames || []);
    while (true) {
      const candidate = `${prefix}_${nextId++}`;
      if (!avoid.has(candidate)) {
        return candidate;
      }
    }
  }

  function replace(parent, key, replacement) {
    if (parent && key != null) {
      parent[key] = replacement;
    } else {
      root = replacement;
    }
  }

  function visit(node, parent, key, letStack = []) {
    if (!node || typeof node !== 'object') {
      return;
    }

    switch (node.kind) {
      case 'LetBinding': {
        // Name is not in scope for value; is in scope for body.
        visit(node.value, node, 'value', letStack);
        const nextLetStack = Array.isArray(letStack) ? [...letStack, node] : [node];
        visit(node.body, node, 'body', nextLetStack);
        return;
      }
      case 'SetBinding': {
        visit(node.value, node, 'value', letStack);
        visit(node.body, node, 'body', letStack);
        return;
      }
      case 'Repeat': {
        if (node.countExpression) visit(node.countExpression, node, 'countExpression', letStack);
        const fromExprs = Array.isArray(node.fromExpressions) ? node.fromExpressions : [];
        for (let i = 0; i < fromExprs.length; i += 1) {
          visit(fromExprs[i], fromExprs, i, letStack);
        }
        return;
      }
      case 'Call': {
        visit(node.callee, node, 'callee', letStack);
        const args = Array.isArray(node.args) ? node.args : [];
        for (let i = 0; i < args.length; i += 1) {
          visit(args[i], args, i, letStack);
        }
        return;
      }
      case 'Pow': {
        visit(node.base, node, 'base', letStack);
        return;
      }
      case 'PowExpr': {
        visit(node.base, node, 'base', letStack);
        visit(node.exponent, node, 'exponent', letStack);
        const base = node.base;
        const exponent = node.exponent;
        const resolvedInt = typeof node.__resolvedIntExp === 'number' ? node.__resolvedIntExp : null;
        const replacement = (resolvedInt !== null && Number.isInteger(resolvedInt))
          ? Pow(base, resolvedInt)
          : Exp(Mul(exponent, Ln(base, null)));
        replace(parent, key, replacement);
        // Recurse into the replacement to catch nested sugar introduced by children.
        visit(replacement, parent, key, letStack);
        return;
      }
      case 'Sum':
      case 'Prod': {
        const resolvedCount = typeof node.resolvedCount === 'number' ? node.resolvedCount : null;
        if (resolvedCount === null || !Number.isInteger(resolvedCount)) {
          throw new Error(`${node.kind} requires resolvedCount (compile-time validation should have run)`);
        }

        visit(node.body, node, 'body', letStack);
        visit(node.min, node, 'min', letStack);
        visit(node.max, node, 'max', letStack);
        visit(node.step, node, 'step', letStack);

        const bodyExpr = node.body;
        const minExpr = node.min;
        const maxExpr = node.max;
        const stepExpr = node.step;

        const nName = freshName(`r4y_${node.kind.toLowerCase()}_N`, letStack);
        const accFnName = freshName(`r4y_${node.kind.toLowerCase()}_acc`, letStack);
        const vFnName = freshName(`r4y_${node.kind.toLowerCase()}_v`, letStack);

        const nValue = Add(Floor(Div(Sub(maxExpr, minExpr), stepExpr)), Const(1, 0));
        const nBinding = SetBindingNode(nName, nValue, null);
        const nRef = SetRef(nName, nBinding);

        const vParam = String(node.varName || 'v');
        const avoidParams = new Set([vParam]);
        const iterParam = freshParam(`r4y_${node.kind.toLowerCase()}_iter`, avoidParams);
        avoidParams.add(iterParam);
        const accParam = freshParam(`r4y_${node.kind.toLowerCase()}_acc`, avoidParams);
        avoidParams.add(accParam);

        const accUpdate =
          node.kind === 'Sum'
            ? Add({ kind: 'ParamRef', name: accParam }, bodyExpr)
            : Mul({ kind: 'ParamRef', name: accParam }, bodyExpr);
        const vUpdate = Add({ kind: 'ParamRef', name: vParam }, stepExpr);

        const initAcc = node.kind === 'Sum' ? Const(0, 0) : Const(1, 0);
        const repeatNode = {
          kind: 'Repeat',
          countExpression: nRef,
          fromExpressions: [initAcc, minExpr],
          byIdentifiers: [accFnName, vFnName],
          resolvedCount,
        };

        const vStepLet = {
          kind: 'LetBinding',
          name: vFnName,
          params: [iterParam, accParam, vParam],
          value: vUpdate,
          body: repeatNode,
        };
        const accStepLet = {
          kind: 'LetBinding',
          name: accFnName,
          params: [iterParam, accParam, vParam],
          value: accUpdate,
          body: vStepLet,
        };
        nBinding.body = accStepLet;

        replace(parent, key, nBinding);
        visit(nBinding, parent, key, letStack);
        return;
      }
      case 'Exp':
      case 'Sin':
      case 'Cos':
      case 'Tan':
      case 'Atan':
      case 'Asin':
      case 'Acos':
      case 'Gamma':
      case 'Fact':
      case 'Abs':
      case 'Abs2':
      case 'Floor':
      case 'Conjugate':
      case 'IsNaN': {
        visit(node.value, node, 'value', letStack);
        return;
      }
      case 'Ln':
      case 'Arg': {
        visit(node.value, node, 'value', letStack);
        if (node.branch) visit(node.branch, node, 'branch', letStack);
        return;
      }
      case 'Add':
      case 'Sub':
      case 'Mul':
      case 'Div':
      case 'LessThan':
      case 'GreaterThan':
      case 'LessThanOrEqual':
      case 'GreaterThanOrEqual':
      case 'Equal':
      case 'LogicalAnd':
      case 'LogicalOr': {
        visit(node.left, node, 'left', letStack);
        visit(node.right, node, 'right', letStack);
        return;
      }
      case 'Compose': {
        visit(node.f, node, 'f', letStack);
        visit(node.g, node, 'g', letStack);
        return;
      }
      case 'ComposeMultiple':
      case 'RepeatComposePlaceholder': {
        visit(node.base, node, 'base', letStack);
        if (node.countExpression) visit(node.countExpression, node, 'countExpression', letStack);
        return;
      }
      case 'If': {
        visit(node.condition, node, 'condition', letStack);
        visit(node.thenBranch, node, 'thenBranch', letStack);
        visit(node.elseBranch, node, 'elseBranch', letStack);
        return;
      }
      case 'IfNaN': {
        visit(node.value, node, 'value', letStack);
        visit(node.fallback, node, 'fallback', letStack);
        return;
      }
      default:
        return;
    }
  }

  visit(root, null, null, []);
  return root;
}

export function SetBindingNode(name, value, body) {
  return { kind: "SetBinding", name, value, body };
}

export function SetRef(name, binding = null) {
  return { kind: "SetRef", name, binding };
}

function fingerIndexFromLabel(label) {
  const parsed = parseFingerLabel(label);
  return parsed ? parsed.index : -1;
}

function fingerFamilyFromLabel(label) {
  const parsed = parseFingerLabel(label);
  return parsed ? parsed.family : null;
}

export const defaultFormulaSource = 'VarZ()';

const formulaGlobals = Object.freeze({
  VarX,
  VarY,
  VarZ,
  Pow,
  Offset,
  Offset2,
  FingerOffset,
  DeviceRotation,
  TrackballRotation,
  Sub,
  Mul,
  Op,
  Add,
  Div,
  LessThan,
  GreaterThan,
  LessThanOrEqual,
  GreaterThanOrEqual,
  Equal,
  LogicalAnd,
  LogicalOr,
  If,
  IfNaN,
  Const,
  Compose,
  Exp,
  Sin,
  Cos,
  Tan,
  Atan,
  Arg,
  Asin,
  Acos,
  Ln,
  Abs,
  Abs2,
  Floor,
  Conjugate,
  IsNaN,
  oo,
});

const FINGER_SWITCH_PIXEL_THRESHOLD = 6;

// Finger values are serialized into the URL (and displayed) at a fixed decimal
// precision. Keep the internal state quantized to the same representation so
// that reloads are deterministic and GPU uniforms always match the URL display.
export const FINGER_DECIMAL_PLACES = 4;
const FINGER_DECIMAL_FACTOR = 10 ** FINGER_DECIMAL_PLACES;

function roundFingerComponent(value) {
  if (!Number.isFinite(value)) {
    return NaN;
  }
  const rounded = Math.round(value * FINGER_DECIMAL_FACTOR) / FINGER_DECIMAL_FACTOR;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function evaluateFormulaSource(source, extraGlobals = {}) {
  const scope = Object.assign({}, formulaGlobals, extraGlobals);
  const argNames = Object.keys(scope);
  const argValues = Object.values(scope);
  const fn = new Function(...argNames, `return (${source});`);
  return fn(...argValues);
}

export function createDefaultFormulaAST() {
  return evaluateFormulaSource(defaultFormulaSource);
}

// =========================
// GLSL code generation helpers
// =========================

let nextNodeId = 0;

function assignNodeIds(ast) {
  if (ast._id !== undefined) return;
  ast._id = nextNodeId++;
  switch (ast.kind) {
    case "Var":
    case "VarX":
    case "VarY":
    case "FingerOffset":
    case "Const":
      return;
    case "Pow":
      assignNodeIds(ast.base);
      return;
    case "Exp":
    case "Sin":
    case "Cos":
    case "Tan":
    case "Atan":
    case "Asin":
    case "Acos":
    case "Gamma":
    case "Fact":
    case "Abs":
    case "Abs2":
    case "Floor":
    case "Conjugate":
    case "IsNaN":
      assignNodeIds(ast.value);
      return;
    case "Arg":
      assignNodeIds(ast.value);
      if (ast.branch) {
        assignNodeIds(ast.branch);
      }
      return;
    case "Ln":
      assignNodeIds(ast.value);
      if (ast.branch) {
        assignNodeIds(ast.branch);
      }
      return;
    case "Sub":
    case "Mul":
    case "Op":
    case "Add":
    case "Div":
    case "LessThan":
    case "GreaterThan":
    case "LessThanOrEqual":
    case "GreaterThanOrEqual":
    case "Equal":
    case "LogicalAnd":
    case "LogicalOr":
      assignNodeIds(ast.left);
      assignNodeIds(ast.right);
      return;
    case "If":
      assignNodeIds(ast.condition);
      assignNodeIds(ast.thenBranch);
      assignNodeIds(ast.elseBranch);
      return;
    case "IfNaN":
      assignNodeIds(ast.value);
      assignNodeIds(ast.fallback);
      return;
    case "SetBinding":
      assignNodeIds(ast.value);
      assignNodeIds(ast.body);
      return;
    case "SetRef":
    case "DeviceRotation":
    case "TrackballRotation":
      return;
    case "Compose":
      assignNodeIds(ast.f);
      assignNodeIds(ast.g);
      return;
    case "ComposeMultiple":
      // Should have been materialized away before GLSL generation, but handle
      // defensively so unexpected ASTs don't crash traversal.
      assignNodeIds(ast.base);
      if (ast.countExpression) {
        assignNodeIds(ast.countExpression);
      }
      return;
    case "Repeat":
      // Should be materialized away before GLSL generation.
      if (ast.countExpression) {
        assignNodeIds(ast.countExpression);
      }
      if (Array.isArray(ast.fromExpressions)) {
        ast.fromExpressions.forEach((expr) => assignNodeIds(expr));
      }
      return;
    case "RepeatComposePlaceholder":
      // Intermediate node kind that should be resolved during parsing. Keep the
      // traversal robust in case it leaks through.
      assignNodeIds(ast.base);
      if (ast.countExpression) {
        assignNodeIds(ast.countExpression);
      }
      return;
    default:
      throw new Error("Unknown AST kind in assignNodeIds: " + ast.kind);
  }
}

function collectNodesPostOrder(ast, out) {
  switch (ast.kind) {
    case "Pow":
      collectNodesPostOrder(ast.base, out);
      break;
    case "Exp":
    case "Sin":
    case "Cos":
    case "Tan":
    case "Atan":
    case "Asin":
    case "Acos":
    case "Gamma":
    case "Fact":
    case "Abs":
    case "Abs2":
    case "Floor":
    case "Conjugate":
    case "IsNaN":
      collectNodesPostOrder(ast.value, out);
      break;
    case "Arg":
      collectNodesPostOrder(ast.value, out);
      if (ast.branch) {
        collectNodesPostOrder(ast.branch, out);
      }
      break;
    case "Ln":
      collectNodesPostOrder(ast.value, out);
      if (ast.branch) {
        collectNodesPostOrder(ast.branch, out);
      }
      break;
    case "Sub":
    case "Mul":
    case "Op":
    case "Add":
    case "Div":
    case "LessThan":
    case "GreaterThan":
    case "LessThanOrEqual":
    case "GreaterThanOrEqual":
    case "Equal":
    case "LogicalAnd":
    case "LogicalOr":
      collectNodesPostOrder(ast.left, out);
      collectNodesPostOrder(ast.right, out);
      break;
    case "If":
      collectNodesPostOrder(ast.condition, out);
      collectNodesPostOrder(ast.thenBranch, out);
      collectNodesPostOrder(ast.elseBranch, out);
      break;
    case "IfNaN":
      collectNodesPostOrder(ast.value, out);
      collectNodesPostOrder(ast.fallback, out);
      break;
    case "SetBinding":
      collectNodesPostOrder(ast.value, out);
      collectNodesPostOrder(ast.body, out);
      break;
    case "SetRef":
      break;
    case "Compose":
      collectNodesPostOrder(ast.f, out);
      collectNodesPostOrder(ast.g, out);
      break;
    case "ComposeMultiple":
      collectNodesPostOrder(ast.base, out);
      if (ast.countExpression) {
        collectNodesPostOrder(ast.countExpression, out);
      }
      break;
    case "Repeat":
      if (ast.countExpression) {
        collectNodesPostOrder(ast.countExpression, out);
      }
      if (Array.isArray(ast.fromExpressions)) {
        ast.fromExpressions.forEach((expr) => collectNodesPostOrder(expr, out));
      }
      break;
    case "RepeatComposePlaceholder":
      collectNodesPostOrder(ast.base, out);
      if (ast.countExpression) {
        collectNodesPostOrder(ast.countExpression, out);
      }
      break;
    case "Var":
    case "VarX":
    case "VarY":
    case "FingerOffset":
    case "DeviceRotation":
    case "TrackballRotation":
    case "Const":
      break;
    default:
      throw new Error("Unknown AST kind in collectNodesPostOrder: " + ast.kind);
  }

  if (!out.includes(ast)) {
    out.push(ast);
  }
}

function functionName(ast) {
  return "node" + ast._id;
}

function setBindingSlotName(binding) {
  return `set_binding_slot_${binding._id}`;
}

function buildExponentiationSteps(absExponent) {
  const lines = [];
  let exp = absExponent;
  let currentVar = "base";
  let step = 0;
  while (exp > 0) {
    if (exp % 2 === 1) {
      lines.push(`    acc = c_mul(acc, ${currentVar});`);
    }
    exp = Math.floor(exp / 2);
    if (exp > 0) {
      const nextVar = `pow_step_${step}`;
      lines.push(`    vec2 ${nextVar} = c_mul(${currentVar}, ${currentVar});`);
      currentVar = nextVar;
      step += 1;
    }
  }
  return lines;
}

function generateNodeFunction(ast) {
  const name = functionName(ast);

  if (ast.kind === "Var" && ast.name === "z") {
    return `
vec2 ${name}(vec2 z) {
    return z;
}`.trim();
  }

  if (ast.kind === "VarX") {
    return `
vec2 ${name}(vec2 z) {
    return vec2(z.x, 0.0);
}`.trim();
  }

  if (ast.kind === "VarY") {
    return `
vec2 ${name}(vec2 z) {
    return vec2(z.y, 0.0);
}`.trim();
  }

  if (ast.kind === "FingerOffset") {
    const slot = ast.slot;
    const index = fingerIndexFromLabel(slot);
    let uniform;
    if (slot[0] === "F") {
      uniform = `u_fixedOffsets[${index}]`;
    } else if (slot[0] === "D") {
      uniform = `u_dynamicOffsets[${index}]`;
    } else {
      uniform = `u_wOffsets[${index}]`;
    }
    return `
vec2 ${name}(vec2 z) {
    return ${uniform};
}`.trim();
  }

  if (ast.kind === 'DeviceRotation') {
    const uniform = ast.slot === 'A' ? 'u_qA' : 'u_qB';
    return `
vec2 ${name}(vec2 z) {
    return ${uniform};
}`.trim();
  }

  if (ast.kind === 'TrackballRotation') {
    const uniform = ast.slot === 'A' ? 'u_rA' : 'u_rB';
    return `
vec2 ${name}(vec2 z) {
    return ${uniform};
}`.trim();
  }

  if (ast.kind === "Const") {
    return `
vec2 ${name}(vec2 z) {
    return vec2(${ast.re}, ${ast.im});
}`.trim();
  }

  if (ast.kind === "Conjugate") {
    const valueName = functionName(ast.value);
    return `
vec2 ${name}(vec2 z) {
    vec2 inner = ${valueName}(z);
    return vec2(inner.x, -inner.y);
}`.trim();
  }

  if (ast.kind === "IsNaN") {
    const valueName = functionName(ast.value);
    return `
vec2 ${name}(vec2 z) {
    vec2 inner = ${valueName}(z);
    float flag = c_is_error(inner);
    return vec2(flag, 0.0);
}`.trim();
  }

  if (ast.kind === "SetRef") {
    const slotName = setBindingSlotName(ast.binding);
    return `
vec2 ${name}(vec2 z) {
    return ${slotName};
}`.trim();
  }

  if (ast.kind === "SetBinding") {
    const slotName = setBindingSlotName(ast);
    const valueName = functionName(ast.value);
    const bodyName = functionName(ast.body);
    return `
vec2 ${name}(vec2 z) {
    ${slotName} = ${valueName}(z);
    return ${bodyName}(z);
}`.trim();
  }

  if (ast.kind === "Pow") {
    const baseName = functionName(ast.base);
    const n = ast.exponent;
    if (n === 0) {
      return `
vec2 ${name}(vec2 z) {
    return vec2(1.0, 0.0);
}`.trim();
    }
    if (n === 1) {
      return `
vec2 ${name}(vec2 z) {
    return ${baseName}(z);
}`.trim();
    }
    const absExponent = Math.abs(n);
    const lines = [];
    lines.push(`vec2 ${name}(vec2 z) {`);
    lines.push(`    vec2 base = ${baseName}(z);`);
    lines.push(`    vec2 acc = vec2(1.0, 0.0);`);
    buildExponentiationSteps(absExponent).forEach((line) => lines.push(line));
    if (n < 0) {
      lines.push(`    return c_inv(acc);`);
    } else {
      lines.push(`    return acc;`);
    }
    lines.push(`}`);
    return lines.join("\n");
  }

  if (ast.kind === "Sub") {
    const leftName = functionName(ast.left);
    const rightName = functionName(ast.right);
    return `
vec2 ${name}(vec2 z) {
    vec2 a = ${leftName}(z);
    vec2 b = ${rightName}(z);
    return a - b;
}`.trim();
  }

  if (ast.kind === "Mul") {
    const leftName = functionName(ast.left);
    const rightName = functionName(ast.right);
    return `
vec2 ${name}(vec2 z) {
    vec2 a = ${leftName}(z);
    vec2 b = ${rightName}(z);
    return c_mul(a, b);
}`.trim();
  }

  if (ast.kind === "Add") {
    const leftName = functionName(ast.left);
    const rightName = functionName(ast.right);
    return `
vec2 ${name}(vec2 z) {
    vec2 a = ${leftName}(z);
    vec2 b = ${rightName}(z);
    return a + b;
}`.trim();
  }

  if (ast.kind === "Div") {
    const leftName = functionName(ast.left);
    const rightName = functionName(ast.right);
    return `
vec2 ${name}(vec2 z) {
    vec2 a = ${leftName}(z);
    vec2 b = ${rightName}(z);
    return c_div(a, b);
}`.trim();
  }

  if (ast.kind === "LessThan") {
    const leftName = functionName(ast.left);
    const rightName = functionName(ast.right);
    return `
vec2 ${name}(vec2 z) {
    vec2 a = ${leftName}(z);
    vec2 b = ${rightName}(z);
    float flag = a.x < b.x ? 1.0 : 0.0;
    return vec2(flag, 0.0);
}`.trim();
  }

  if (ast.kind === "GreaterThan") {
    const leftName = functionName(ast.left);
    const rightName = functionName(ast.right);
    return `
vec2 ${name}(vec2 z) {
    vec2 a = ${leftName}(z);
    vec2 b = ${rightName}(z);
    float flag = a.x > b.x ? 1.0 : 0.0;
    return vec2(flag, 0.0);
}`.trim();
  }

  if (ast.kind === "LessThanOrEqual") {
    const leftName = functionName(ast.left);
    const rightName = functionName(ast.right);
    return `
vec2 ${name}(vec2 z) {
    vec2 a = ${leftName}(z);
    vec2 b = ${rightName}(z);
    float flag = a.x <= b.x ? 1.0 : 0.0;
    return vec2(flag, 0.0);
}`.trim();
  }

  if (ast.kind === "GreaterThanOrEqual") {
    const leftName = functionName(ast.left);
    const rightName = functionName(ast.right);
    return `
vec2 ${name}(vec2 z) {
    vec2 a = ${leftName}(z);
    vec2 b = ${rightName}(z);
    float flag = a.x >= b.x ? 1.0 : 0.0;
    return vec2(flag, 0.0);
}`.trim();
  }

  if (ast.kind === "Equal") {
    const leftName = functionName(ast.left);
    const rightName = functionName(ast.right);
    return `
vec2 ${name}(vec2 z) {
    vec2 a = ${leftName}(z);
    vec2 b = ${rightName}(z);
    float flag = a.x == b.x ? 1.0 : 0.0;
    return vec2(flag, 0.0);
}`.trim();
  }

  if (ast.kind === "LogicalAnd") {
    const leftName = functionName(ast.left);
    const rightName = functionName(ast.right);
    return `
vec2 ${name}(vec2 z) {
    vec2 a = ${leftName}(z);
    vec2 b = ${rightName}(z);
    float leftTruthy = (a.x != 0.0 || a.y != 0.0) ? 1.0 : 0.0;
    float rightTruthy = (b.x != 0.0 || b.y != 0.0) ? 1.0 : 0.0;
    float flag = (leftTruthy > 0.5 && rightTruthy > 0.5) ? 1.0 : 0.0;
    return vec2(flag, 0.0);
}`.trim();
  }

  if (ast.kind === "LogicalOr") {
    const leftName = functionName(ast.left);
    const rightName = functionName(ast.right);
    return `
vec2 ${name}(vec2 z) {
    vec2 a = ${leftName}(z);
    vec2 b = ${rightName}(z);
    float leftTruthy = (a.x != 0.0 || a.y != 0.0) ? 1.0 : 0.0;
    float rightTruthy = (b.x != 0.0 || b.y != 0.0) ? 1.0 : 0.0;
    float flag = (leftTruthy > 0.5 || rightTruthy > 0.5) ? 1.0 : 0.0;
    return vec2(flag, 0.0);
}`.trim();
  }

  if (ast.kind === "Exp") {
    const valueName = functionName(ast.value);
    return `
vec2 ${name}(vec2 z) {
    vec2 v = ${valueName}(z);
    return c_exp(v);
}`.trim();
  }

  if (ast.kind === "Sin") {
    const valueName = functionName(ast.value);
    return `
vec2 ${name}(vec2 z) {
    vec2 v = ${valueName}(z);
    return c_sin(v);
}`.trim();
  }

  if (ast.kind === "Cos") {
    const valueName = functionName(ast.value);
    return `
vec2 ${name}(vec2 z) {
    vec2 v = ${valueName}(z);
    return c_cos(v);
}`.trim();
  }

  if (ast.kind === "Tan") {
    const valueName = functionName(ast.value);
    return `
vec2 ${name}(vec2 z) {
    vec2 v = ${valueName}(z);
    return c_tan(v);
}`.trim();
  }

  if (ast.kind === "Ln") {
    const valueName = functionName(ast.value);
    if (ast.branch) {
      const branchName = functionName(ast.branch);
      return `
vec2 ${name}(vec2 z) {
    vec2 v = ${valueName}(z);
    vec2 branchShift = ${branchName}(z);
    return c_ln_branch(v, branchShift.x);
}`.trim();
    }
    return `
vec2 ${name}(vec2 z) {
    vec2 v = ${valueName}(z);
    return c_ln(v);
}`.trim();
  }

  if (ast.kind === "Gamma") {
    const valueName = functionName(ast.value);
    return `
vec2 ${name}(vec2 z) {
    vec2 v = ${valueName}(z);
    return c_gamma(v);
}`.trim();
  }

  if (ast.kind === "Fact") {
    const valueName = functionName(ast.value);
    return `
vec2 ${name}(vec2 z) {
    vec2 v = ${valueName}(z);
    return c_fact(v);
}`.trim();
  }

  if (ast.kind === "Atan") {
    const valueName = functionName(ast.value);
    return `
vec2 ${name}(vec2 z) {
    vec2 v = ${valueName}(z);
    return c_atan(v);
}`.trim();
  }

  if (ast.kind === "Arg") {
    const valueName = functionName(ast.value);
    if (ast.branch) {
      const branchName = functionName(ast.branch);
      return `
vec2 ${name}(vec2 z) {
    vec2 v = ${valueName}(z);
    vec2 branchShift = ${branchName}(z);
    vec2 lv = c_ln_branch(v, branchShift.x);
    return vec2(lv.y, 0.0);
}`.trim();
    }
    return `
vec2 ${name}(vec2 z) {
    vec2 v = ${valueName}(z);
    vec2 lv = c_ln(v);
    return vec2(lv.y, 0.0);
}`.trim();
  }

  if (ast.kind === "Asin") {
    const valueName = functionName(ast.value);
    return `
vec2 ${name}(vec2 z) {
    vec2 v = ${valueName}(z);
    return c_asin(v);
}`.trim();
  }

  if (ast.kind === "Acos") {
    const valueName = functionName(ast.value);
    return `
vec2 ${name}(vec2 z) {
    vec2 v = ${valueName}(z);
    return c_acos(v);
}`.trim();
  }

  if (ast.kind === "Abs") {
    const valueName = functionName(ast.value);
    return `
vec2 ${name}(vec2 z) {
    vec2 v = ${valueName}(z);
    float magnitude = length(v);
    return vec2(magnitude, 0.0);
}`.trim();
  }

  if (ast.kind === "Abs2") {
    const valueName = functionName(ast.value);
    return `
vec2 ${name}(vec2 z) {
    vec2 v = ${valueName}(z);
    float magnitudeSquared = dot(v, v);
    return vec2(magnitudeSquared, 0.0);
}`.trim();
  }

  if (ast.kind === "Floor") {
    const valueName = functionName(ast.value);
    return `
vec2 ${name}(vec2 z) {
    vec2 v = ${valueName}(z);
    return floor(v);
}`.trim();
  }

  if (ast.kind === "If") {
    const condName = functionName(ast.condition);
    const thenName = functionName(ast.thenBranch);
    const elseName = functionName(ast.elseBranch);
    return `
vec2 ${name}(vec2 z) {
    vec2 cond = ${condName}(z);
    bool selector = (cond.x != 0.0 || cond.y != 0.0);
    if (selector) {
        return ${thenName}(z);
    }
    return ${elseName}(z);
}`.trim();
  }

  if (ast.kind === "IfNaN") {
    const valueName = functionName(ast.value);
    const fallbackName = functionName(ast.fallback);
    return `
vec2 ${name}(vec2 z) {
    vec2 inner = ${valueName}(z);
    float flag = c_is_error(inner);
    if (flag > 0.5) {
        return ${fallbackName}(z);
    }
    return inner;
}`.trim();
  }

  if (ast.kind === "Op") {
    const leftName = functionName(ast.left);
    const rightName = functionName(ast.right);
    let expr;
    switch (ast.op) {
      case "add":
        expr = "a + b";
        break;
      case "sub":
        expr = "a - b";
        break;
      case "mul":
        expr = "c_mul(a, b)";
        break;
      case "mod":
        expr = "vec2(mod(a.x, b.x), mod(a.y, b.y))";
        break;
      default:
        throw new Error("Unknown Op kind: " + ast.op);
    }
    return `
vec2 ${name}(vec2 z) {
    vec2 a = ${leftName}(z);
    vec2 b = ${rightName}(z);
    return ${expr};
}`.trim();
  }

  if (ast.kind === "Compose") {
    const fName = functionName(ast.f);
    const gName = functionName(ast.g);
    return `
vec2 ${name}(vec2 z) {
    return ${fName}(${gName}(z));
}`.trim();
  }

  throw new Error("Unknown AST node kind in generateNodeFunction: " + ast.kind);
}

function buildNodeFunctionsAndTop(ast) {
  nextNodeId = 0;
  assignNodeIds(ast);
  const nodes = [];
  collectNodesPostOrder(ast, nodes);
  const slotDecls = nodes
    .filter((node) => node.kind === "SetBinding")
    .map((node) => `vec2 ${setBindingSlotName(node)};`)
    .join("\n");
  const funcBodies = nodes.map(generateNodeFunction).join("\n\n");
  const funcs = slotDecls ? `${slotDecls}\n\n${funcBodies}` : funcBodies;
  const topName = functionName(ast);
  return { funcs, topName };
}

const vertexSource = `#version 300 es
precision highp float;

const vec2 POSITIONS[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0)
);

void main() {
  gl_Position = vec4(POSITIONS[gl_VertexID], 0.0, 1.0);
}`;

const fragmentTemplate = `#version 300 es
precision highp float;

uniform vec2 u_min;
uniform vec2 u_max;
uniform vec2 u_resolution;
uniform vec2 u_qA;
uniform vec2 u_qB;
uniform vec2 u_rA;
uniform vec2 u_rB;
uniform vec2 u_fixedOffsets[/*FIXED_OFFSETS_COUNT*/];
uniform vec2 u_dynamicOffsets[/*DYNAMIC_OFFSETS_COUNT*/];
uniform vec2 u_wOffsets[2];

out vec4 outColor;

const float SQ3 = 1.7320508075688772;
const float COLOR_MIN_MAG = 1.0e-6;
const float COLOR_MIN_DEN = 1.0e-12;
const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

vec2 c_mul(vec2 a, vec2 b) {
  return vec2(
    a.x * b.x - a.y * b.y,
    a.x * b.y + a.y * b.x
  );
}

vec2 c_inv(vec2 z) {
  float denom = dot(z, z);
  if (denom < 1e-12) {
    return vec2(1e10, 1e10);
  }
  return vec2(z.x / denom, -z.y / denom);
}

vec2 c_div(vec2 a, vec2 b) {
  float denom = dot(b, b);
  if (denom < 1e-12) {
    return vec2(1e10, 1e10);
  }
  return vec2(
    (a.x * b.x + a.y * b.y) / denom,
    (a.y * b.x - a.x * b.y) / denom
  );
}

vec2 c_exp(vec2 z) {
  float expReal = exp(z.x);
  return vec2(
    expReal * cos(z.y),
    expReal * sin(z.y)
  );
}

vec2 c_sin(vec2 z) {
  float sinX = sin(z.x);
  float cosX = cos(z.x);
  float expY = exp(z.y);
  float expNegY = exp(-z.y);
  float sinhY = 0.5 * (expY - expNegY);
  float coshY = 0.5 * (expY + expNegY);
  return vec2(
    sinX * coshY,
    cosX * sinhY
  );
}

vec2 c_cos(vec2 z) {
  float sinX = sin(z.x);
  float cosX = cos(z.x);
  float expY = exp(z.y);
  float expNegY = exp(-z.y);
  float sinhY = 0.5 * (expY - expNegY);
  float coshY = 0.5 * (expY + expNegY);
  return vec2(
    cosX * coshY,
    -sinX * sinhY
  );
}

vec2 c_tan(vec2 z) {
  vec2 s = c_sin(z);
  vec2 c = c_cos(z);
  return c_div(s, c);
}

vec2 c_sqrt(vec2 z) {
  float magnitude = length(z);
  if (magnitude == 0.0) {
    return vec2(0.0, 0.0);
  }
  float realPart = sqrt(0.5 * (magnitude + z.x));
  float imagPart = sqrt(max(0.0, 0.5 * (magnitude - z.x)));
  if (z.y < 0.0) {
    imagPart = -imagPart;
  }
  return vec2(realPart, imagPart);
}

float wrapAngleToRange(float angle, float center) {
  float shifted = angle - center;
  float normalized = shifted - TAU * floor((shifted + PI) / TAU);
  return normalized + center;
}

vec2 c_ln_branch(vec2 z, float center) {
  float magnitude = length(z);
  if (magnitude < 1e-12) {
    return vec2(-1e10, 0.0);
  }
  float angle = atan(z.y, z.x);
  float adjusted = wrapAngleToRange(angle, center);
  return vec2(log(magnitude), adjusted);
}

vec2 c_ln(vec2 z) {
  return c_ln_branch(z, 0.0);
}

vec2 c_asin(vec2 z) {
  vec2 iz = vec2(-z.y, z.x);
  vec2 one = vec2(1.0, 0.0);
  vec2 zSquared = c_mul(z, z);
  vec2 underSqrt = one - zSquared;
  vec2 sqrtTerm = c_sqrt(underSqrt);
  vec2 inside = iz + sqrtTerm;
  vec2 lnInside = c_ln(inside);
  return vec2(lnInside.y, -lnInside.x);
}

vec2 c_acos(vec2 z) {
  vec2 asinValue = c_asin(z);
  return vec2(0.5 * PI - asinValue.x, -asinValue.y);
}

vec2 c_atan(vec2 z) {
  vec2 iz = vec2(-z.y, z.x);
  vec2 one = vec2(1.0, 0.0);
  vec2 term1 = c_ln(one - iz);
  vec2 term2 = c_ln(one + iz);
  vec2 diff = term1 - term2;
  return c_mul(vec2(0.0, 0.5), diff);
}

// Reflex4You "error" predicate used by the 'isnan(...)' formula function.
// Treat as error when:
// - magnitude is above the overflow sentinel threshold, or
// - magnitude is NaN / non-finite (covers NaN and Inf).
float c_is_error(vec2 z) {
  float m = length(z);
  // For NaN, comparisons are false; !(m <= threshold) reliably detects NaN as well.
  return (m > 1.0e10 || !(m <= 1.0e10)) ? 1.0 : 0.0;
}

// Integer power helper used by Pow nodes.
vec2 c_pow_pos_int(vec2 base, int exp) {
  // exp must be in [0..10]
  switch (exp) {
    case 0: return vec2(1.0, 0.0);
    case 1: return base;
    case 2: return c_mul(base, base);
    case 3: return c_mul(c_mul(base, base), base);
    case 4: { vec2 b2 = c_mul(base, base); return c_mul(b2, b2); }
    case 5: { vec2 b2 = c_mul(base, base); vec2 b4 = c_mul(b2, b2); return c_mul(b4, base); }
    case 6: { vec2 b2 = c_mul(base, base); vec2 b4 = c_mul(b2, b2); return c_mul(b4, b2); }
    case 7: { vec2 b2 = c_mul(base, base); vec2 b4 = c_mul(b2, b2); vec2 b6 = c_mul(b4, b2); return c_mul(b6, base); }
    case 8: { vec2 b2 = c_mul(base, base); vec2 b4 = c_mul(b2, b2); return c_mul(b4, b4); }
    case 9: { vec2 b2 = c_mul(base, base); vec2 b4 = c_mul(b2, b2); vec2 b8 = c_mul(b4, b4); return c_mul(b8, base); }
    case 10:{ vec2 b2 = c_mul(base, base); vec2 b4 = c_mul(b2, b2); vec2 b8 = c_mul(b4, b4); return c_mul(b8, b2); }
    default: return vec2(1e10, 1e10);
  }
}

vec2 c_pow_int(vec2 base, int exp) {
  // Reflex4You uses Pow only for small integer exponents (|exp| <= 10),
  // so implement this without loops/bitwise ops/recursion for maximum WebGL2 driver compatibility.
  if (exp < 0) {
    int e = -exp; // safe for our exp range
    return c_inv(c_pow_pos_int(base, e));
  }
  return c_pow_pos_int(base, exp);
}

// General complex exponentiation: a^b = exp(b * ln(a))
vec2 c_pow(vec2 a, vec2 b) {
  return c_exp(c_mul(b, c_ln(a)));
}

// Complex Gamma function Γ(z), using Lanczos approximation + reflection formula.
// IMPORTANT: GLSL ES forbids recursion, so reflection must not call c_gamma(1-z).
// Returns the Reflex4You overflow sentinel (1e10,1e10) on severe numeric issues.
vec2 c_gamma_lanczos(vec2 z) {
  // Lanczos parameters (g=7, n=9) tuned for good accuracy in float.
  const float g = 7.0;
  const float SQRT_2PI = 2.5066282746310007;

  // Shift: z -> z - 1
  vec2 z1 = z - vec2(1.0, 0.0);

  // Coefficients (double-derived, used as float constants).
  // See: https://en.wikipedia.org/wiki/Lanczos_approximation
  const float p0 = 0.9999999999998099;
  const float p1 = 676.5203681218851;
  const float p2 = -1259.1392167224028;
  const float p3 = 771.3234287776531;
  const float p4 = -176.6150291621406;
  const float p5 = 12.507343278686905;
  const float p6 = -0.13857109526572012;
  const float p7 = 9.984369578019572e-6;
  const float p8 = 1.5056327351493116e-7;

  vec2 x = vec2(p0, 0.0);
  x += c_div(vec2(p1, 0.0), z1 + vec2(1.0, 0.0));
  x += c_div(vec2(p2, 0.0), z1 + vec2(2.0, 0.0));
  x += c_div(vec2(p3, 0.0), z1 + vec2(3.0, 0.0));
  x += c_div(vec2(p4, 0.0), z1 + vec2(4.0, 0.0));
  x += c_div(vec2(p5, 0.0), z1 + vec2(5.0, 0.0));
  x += c_div(vec2(p6, 0.0), z1 + vec2(6.0, 0.0));
  x += c_div(vec2(p7, 0.0), z1 + vec2(7.0, 0.0));
  x += c_div(vec2(p8, 0.0), z1 + vec2(8.0, 0.0));

  vec2 t = z1 + vec2(g + 0.5, 0.0);
  vec2 zPow = z1 + vec2(0.5, 0.0);
  vec2 term = c_pow(t, zPow);
  vec2 eTerm = c_exp(-t);
  vec2 y = c_mul(vec2(SQRT_2PI, 0.0), c_mul(term, c_mul(eTerm, x)));

  if (c_is_error(y) > 0.5) {
    return vec2(1.0e10, 1.0e10);
  }
  return y;
}

vec2 c_gamma(vec2 z) {
  // Reflection for Re(z) < 0.5 improves accuracy/stability.
  // Use Γ(z) = π / (sin(πz) Γ(1-z)), but compute Γ(1-z) via Lanczos directly (no recursion).
  if (z.x < 0.5) {
    vec2 oneMinusZ = vec2(1.0, 0.0) - z;
    vec2 sinPiZ = c_sin(c_mul(vec2(PI, 0.0), z));
    vec2 denom = c_mul(sinPiZ, c_gamma_lanczos(oneMinusZ));
    return c_div(vec2(PI, 0.0), denom);
  }
  return c_gamma_lanczos(z);
}

// Complex factorial: fact(z) = Γ(z + 1).
vec2 c_fact(vec2 z) {
  return c_gamma(z + vec2(1.0, 0.0));
}

/*FORMULA_FUNCS*/

vec3 reflexColor(vec2 w) {
  float re = w.x;
  float im = w.y;
  float m  = length(w);

  if (m <= COLOR_MIN_MAG) {
    return vec3(0.0);
  }

  if (m > 1.0e10 || isnan(m)) {
    return vec3(1.0);
  }

  float rpm  = re + m;
  float rpm2 = rpm * rpm;
  float i2   = im * im;
  float denRaw = rpm2 + i2;

  // The only place the denominator can legitimately collapse toward 0 is on
  // the negative real axis (re < 0, im ≈ 0) where rpm = re + |re| → 0 and i2 → 0.
  // In some WebGL/PWA configurations (notably on mobile GPUs where precision is
  // effectively lower), denRaw and/or COLOR_MIN_DEN can underflow to 0.0 and
  // lead to NaNs. Detect that singular case by the denominator itself, rather
  // than relying on exact im == 0.0 pixel alignment.
  if (re < 0.0 && denRaw <= COLOR_MIN_DEN) {
    float r = 0.0;
    float g = 190.0;
    float b = 190.0;

    float luminosite = 240.0 * m / (m + 1.0);
    luminosite = clamp(luminosite, 0.0, 240.0);

    if (luminosite <= 120.0) {
      float scale = luminosite / 120.0;
      r *= scale;
      g *= scale;
      b *= scale;
    } else {
      float k1 = 2.0 - luminosite / 120.0;
      float k2 = luminosite / 120.0 - 1.0;
      r = r * k1 + 255.0 * k2;
      g = g * k1 + 255.0 * k2;
      b = b * k1 + 255.0 * k2;
    }

    return vec3(r / 255.0, g / 255.0, b / 255.0);
  }

  float r = 0.0;
  float g = 0.0;
  float b = 0.0;

  float den  = max(denRaw, COLOR_MIN_DEN);

  r = 255.0 * (1.0 - i2 / den);
  g = 255.0 * (0.25 + 0.5 * im * (SQ3 * rpm + im) / den);
  b = 255.0 * (0.25 - 0.5 * im * (SQ3 * rpm - im) / den);

  float luminosite = 240.0 * m / (m + 1.0);
  luminosite = clamp(luminosite, 0.0, 240.0);

  if (luminosite <= 120.0) {
    float scale = luminosite / 120.0;
    r *= scale;
    g *= scale;
    b *= scale;
  } else {
    float k1 = 2.0 - luminosite / 120.0;
    float k2 = luminosite / 120.0 - 1.0;
    r = r * k1 + 255.0 * k2;
    g = g * k1 + 255.0 * k2;
    b = b * k1 + 255.0 * k2;
  }

  float red   = r / 255.0;
  float green = g / 255.0;
  float blue  = b / 255.0;
  return vec3(red, green, blue);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;

  vec2 z = vec2(
    mix(u_min.x, u_max.x, uv.x),
    mix(u_min.y, u_max.y, uv.y)
  );

  vec2 w = f(z);
  vec3 rgb = reflexColor(w);
  outColor = vec4(rgb, 1.0);
}`;

export function buildFragmentSourceFromAST(ast) {
  return compileFormulaForGpu(ast).fragmentSource;
}

function formatFloatLiteral(value) {
  if (!Number.isFinite(value)) {
    return '0.0';
  }
  // Ensure we always print a decimal to avoid GLSL interpreting as int.
  const normalized = Object.is(value, -0) ? 0 : value;
  const text = String(normalized);
  return text.includes('.') || text.includes('e') || text.includes('E') ? text : `${text}.0`;
}

function formatVec2Literal(re, im) {
  return `vec2(${formatFloatLiteral(re)}, ${formatFloatLiteral(im)})`;
}

function compileFormulaFunctionsSSA(rootAst) {
  const letInfoByBinding = new Map(); // LetBinding node -> { glslName, params, captures, compiled, source }
  let nextLetId = 0;

  function nextLetGlslName() {
    const id = nextLetId++;
    return `let_fn_${id}`;
  }

  function resolveLetBindingByName(name, letStack) {
    const target = String(name || '');
    for (let i = (letStack?.length || 0) - 1; i >= 0; i -= 1) {
      const entry = letStack[i];
      if (entry && typeof entry === 'object' && entry.kind === 'LetBinding' && entry.name === target) {
        return entry;
      }
    }
    return null;
  }

  function collectFreeValueVars(
    expr,
    boundParamNames = new Set(),
    boundSetBindings = new Set(),
    letStack = [],
  ) {
    const freeParams = new Set();
    const freeSets = new Set();

    function walk(node, localParamNames, localSetBindings, localLetStack) {
      if (!node || typeof node !== 'object') {
        return;
      }
      switch (node.kind) {
        case 'Identifier': {
          // Identifiers are compiled as calls to let-bound functions (with no extra args),
          // so if we reference a let-bound function that itself captures values, we must
          // also capture those values here in order to be able to pass them through.
          const binding = resolveLetBindingByName(node.name, localLetStack);
          if (!binding) {
            return;
          }

          // Ensure the referenced let is compiled so we know its captures.
          // Use a stack that excludes the binding itself to approximate its defining scope.
          const bindingStack =
            Array.isArray(localLetStack) && localLetStack.length > 0
              ? localLetStack.filter((entry) => entry !== binding)
              : [];
          const calleeInfo = ensureLetCompiled(binding, { paramValues: new Map(), setValues: new Map() }, bindingStack);

          calleeInfo.captures.forEach((cap) => {
            if (cap.kind === 'param') {
              if (!localParamNames.has(cap.name)) {
                freeParams.add(cap.name);
              }
            } else if (cap.binding && !localSetBindings.has(cap.binding)) {
              freeSets.add(cap.binding);
            }
          });
          return;
        }
        case 'ParamRef':
          if (!localParamNames.has(node.name)) {
            freeParams.add(node.name);
          }
          return;
        case 'SetRef':
          if (node.binding && !localSetBindings.has(node.binding)) {
            freeSets.add(node.binding);
          }
          return;
        case 'SetBinding': {
          // value sees the current bindings, body sees the binding as in-scope
          walk(node.value, localParamNames, localSetBindings, localLetStack);
          const nextSetBindings = new Set(localSetBindings);
          nextSetBindings.add(node);
          walk(node.body, localParamNames, nextSetBindings, localLetStack);
          return;
        }
        case 'LetBinding': {
          // Only traverse the value and body; nested lets will be compiled separately,
          // but their free variables must still be discovered.
          const ownParams = Array.isArray(node.params) ? node.params : [];
          const nextParamNames = new Set(localParamNames);
          ownParams.forEach((p) => nextParamNames.add(p));
          walk(node.value, nextParamNames, localSetBindings, localLetStack);
          const nextLetStack = Array.isArray(localLetStack) ? [...localLetStack, node] : [node];
          walk(node.body, localParamNames, localSetBindings, nextLetStack);
          return;
        }
        case 'Call':
          walk(node.callee, localParamNames, localSetBindings, localLetStack);
          if (Array.isArray(node.args)) {
            node.args.forEach((arg) => walk(arg, localParamNames, localSetBindings, localLetStack));
          }
          return;
        case 'Pow':
          walk(node.base, localParamNames, localSetBindings, localLetStack);
          return;
        case 'Exp':
        case 'Sin':
        case 'Cos':
        case 'Tan':
        case 'Atan':
        case 'Asin':
        case 'Acos':
        case 'Gamma':
        case 'Fact':
        case 'Abs':
        case 'Abs2':
        case 'Floor':
        case 'Conjugate':
        case 'IsNaN':
          walk(node.value, localParamNames, localSetBindings, localLetStack);
          return;
        case 'Ln':
        case 'Arg':
          walk(node.value, localParamNames, localSetBindings, localLetStack);
          if (node.branch) {
            walk(node.branch, localParamNames, localSetBindings, localLetStack);
          }
          return;
        case 'Sub':
        case 'Mul':
        case 'Op':
        case 'Add':
        case 'Div':
        case 'LessThan':
        case 'GreaterThan':
        case 'LessThanOrEqual':
        case 'GreaterThanOrEqual':
        case 'Equal':
        case 'LogicalAnd':
        case 'LogicalOr':
        case 'Compose':
          walk(node.left ?? node.f, localParamNames, localSetBindings, localLetStack);
          walk(node.right ?? node.g, localParamNames, localSetBindings, localLetStack);
          return;
        case 'If':
          walk(node.condition, localParamNames, localSetBindings, localLetStack);
          walk(node.thenBranch, localParamNames, localSetBindings, localLetStack);
          walk(node.elseBranch, localParamNames, localSetBindings, localLetStack);
          return;
        case 'IfNaN':
          walk(node.value, localParamNames, localSetBindings, localLetStack);
          walk(node.fallback, localParamNames, localSetBindings, localLetStack);
          return;
        case 'ComposeMultiple':
          walk(node.base, localParamNames, localSetBindings, localLetStack);
          if (node.countExpression) {
            walk(node.countExpression, localParamNames, localSetBindings, localLetStack);
          }
          return;
        case 'RepeatComposePlaceholder':
          walk(node.base, localParamNames, localSetBindings, localLetStack);
          if (node.countExpression) {
            walk(node.countExpression, localParamNames, localSetBindings, localLetStack);
          }
          return;
        default:
          return;
      }
    }

    const initialParamNames = new Set(boundParamNames);
    const initialSetBindings = new Set(boundSetBindings);
    walk(expr, initialParamNames, initialSetBindings, Array.isArray(letStack) ? letStack : []);
    return { freeParams, freeSets };
  }

  function createEmitter({ indent = '  ' } = {}) {
    return {
      indent,
      tempIndex: 0,
      lines: [],
      push(line) {
        this.lines.push(line);
      },
      freshTemp(prefix = 't') {
        const name = `_${prefix}${this.tempIndex++}`;
        return name;
      },
    };
  }

  function uniformExprForFinger(slot) {
    const label = String(slot || '');
    const index = fingerIndexFromLabel(label);
    if (label[0] === 'F') {
      return `u_fixedOffsets[${index}]`;
    }
    if (label[0] === 'D') {
      return `u_dynamicOffsets[${index}]`;
    }
    // W0 maps to the W2 uniform slot (index 1).
    return `u_wOffsets[${index}]`;
  }

  function ensureLetCompiled(letNode, definingEnv, definingLetStack) {
    if (!letNode || typeof letNode !== 'object' || letNode.kind !== 'LetBinding') {
      throw new Error('ensureLetCompiled expects a LetBinding node');
    }
    let info = letInfoByBinding.get(letNode);
    if (!info) {
      info = {
        glslName: nextLetGlslName(),
        params: Array.isArray(letNode.params) ? letNode.params : [],
        captures: [],
        compiled: false,
        source: '',
      };
      letInfoByBinding.set(letNode, info);
    }
    if (info.compiled) {
      return info;
    }

    const boundParams = new Set(info.params);
    const { freeParams, freeSets } = collectFreeValueVars(
      letNode.value,
      boundParams,
      new Set(),
      Array.isArray(definingLetStack) ? definingLetStack : [],
    );

    // Deterministic capture ordering:
    // - captured params (sorted)
    // - captured set bindings (stable by insertion order in the Set of objects -> sort by name as best-effort)
    const capturedParams = Array.from(freeParams).sort();
    const capturedSets = Array.from(freeSets).sort((a, b) => {
      const an = String(a?.name || '');
      const bn = String(b?.name || '');
      return an.localeCompare(bn);
    });

    info.captures = [
      ...capturedParams.map((name) => ({ kind: 'param', name })),
      ...capturedSets.map((binding) => ({ kind: 'set', binding })),
    ];

    const emitter = createEmitter();
    const glslParams = [];
    glslParams.push('vec2 z');
    const paramNameToVar = new Map();
    info.params.forEach((p) => {
      const v = `p_${p}`;
      glslParams.push(`vec2 ${v}`);
      paramNameToVar.set(p, v);
    });
    const captureKeyToVar = new Map();
    info.captures.forEach((cap, idx) => {
      if (cap.kind === 'param') {
        const v = `cap_p_${cap.name}`;
        glslParams.push(`vec2 ${v}`);
        captureKeyToVar.set(`param:${cap.name}`, v);
        return;
      }
      const v = `cap_s_${idx}`;
      glslParams.push(`vec2 ${v}`);
      captureKeyToVar.set(`set:${idx}`, v);
    });
    info.glslParams = glslParams.slice();

    const fnEnv = {
      paramValues: new Map(),
      setValues: new Map(),
    };
    // Own params.
    paramNameToVar.forEach((v, k) => fnEnv.paramValues.set(k, v));
    // Captured params.
    info.captures.forEach((cap, idx) => {
      if (cap.kind === 'param') {
        fnEnv.paramValues.set(cap.name, captureKeyToVar.get(`param:${cap.name}`));
      } else {
        fnEnv.setValues.set(cap.binding, captureKeyToVar.get(`set:${idx}`));
      }
    });

    function emitExpr(node, zVar, env, letStack, indentLevel = 1) {
      const ind = emitter.indent.repeat(indentLevel);
      if (!node || typeof node !== 'object') {
        const t = emitter.freshTemp('c');
        emitter.push(`${ind}vec2 ${t} = vec2(0.0, 0.0);`);
        return t;
      }

      switch (node.kind) {
        case 'Const': {
          const t = emitter.freshTemp('c');
          emitter.push(`${ind}vec2 ${t} = ${formatVec2Literal(node.re, node.im)};`);
          return t;
        }
        case 'Var':
          return zVar;
        case 'VarX': {
          const t = emitter.freshTemp('x');
          emitter.push(`${ind}vec2 ${t} = vec2(${zVar}.x, 0.0);`);
          return t;
        }
        case 'VarY': {
          const t = emitter.freshTemp('y');
          emitter.push(`${ind}vec2 ${t} = vec2(${zVar}.y, 0.0);`);
          return t;
        }
        case 'FingerOffset': {
          const t = emitter.freshTemp('f');
          emitter.push(`${ind}vec2 ${t} = ${uniformExprForFinger(node.slot)};`);
          return t;
        }
        case 'DeviceRotation': {
          const uniform = node.slot === 'A' ? 'u_qA' : 'u_qB';
          const t = emitter.freshTemp('q');
          emitter.push(`${ind}vec2 ${t} = ${uniform};`);
          return t;
        }
        case 'TrackballRotation': {
          const uniform = node.slot === 'A' ? 'u_rA' : 'u_rB';
          const t = emitter.freshTemp('r');
          emitter.push(`${ind}vec2 ${t} = ${uniform};`);
          return t;
        }
        case 'ParamRef': {
          const v = env.paramValues.get(node.name);
          if (!v) {
            throw new Error(`Unresolved ParamRef during GPU compilation: ${node.name}`);
          }
          return v;
        }
        case 'SetRef': {
          const v = env.setValues.get(node.binding);
          if (!v) {
            throw new Error(`Unresolved SetRef during GPU compilation: ${node.name}`);
          }
          return v;
        }
        case 'LetBinding': {
          // Nested let inside a function body: compile it with the current env.
          ensureLetCompiled(node, env, letStack);
          const nextLetStack = Array.isArray(letStack) ? [...letStack, node] : [node];
          return emitExpr(node.body, zVar, env, nextLetStack, indentLevel);
        }
        case 'Identifier': {
          const binding = resolveLetBindingByName(node.name, letStack);
          if (!binding) {
            throw new Error(`Unresolved Identifier during GPU compilation: ${node.name}`);
          }
          const calleeInfo = ensureLetCompiled(binding, env, letStack);
          if (calleeInfo.params.length > 0) {
            throw new Error(`Function "${node.name}" requires ${calleeInfo.params.length} extra argument(s)`);
          }
          const argList = [];
          argList.push(zVar);
          calleeInfo.params.forEach(() => {});
          calleeInfo.captures.forEach((cap) => {
            if (cap.kind === 'param') {
              const v = env.paramValues.get(cap.name);
              if (!v) throw new Error(`Missing captured param "${cap.name}" for ${node.name}`);
              argList.push(v);
            } else {
              const v = env.setValues.get(cap.binding);
              if (!v) throw new Error(`Missing captured set "${cap.binding?.name || '?'}" for ${node.name}`);
              argList.push(v);
            }
          });
          const t = emitter.freshTemp('id');
          emitter.push(`${ind}vec2 ${t} = ${calleeInfo.glslName}(${argList.join(', ')});`);
          return t;
        }
        case 'Call': {
          const args = Array.isArray(node.args) ? node.args : [];
          // Multi-arg let call fast path.
          if (node.callee && typeof node.callee === 'object' && node.callee.kind === 'Identifier') {
            const binding = resolveLetBindingByName(node.callee.name, letStack);
            if (binding) {
              const calleeInfo = ensureLetCompiled(binding, env, letStack);
            const k = calleeInfo.params.length;
            if (!(args.length === k || args.length === k + 1)) {
              throw new Error(`Function "${node.callee.name}" expects ${k} or ${k + 1} arguments, got ${args.length}`);
            }
            const argVars = [];
            for (let i = 0; i < k; i += 1) {
              argVars.push(emitExpr(args[i], zVar, env, letStack, indentLevel));
            }
            const zUsed = args.length === k + 1 ? emitExpr(args[args.length - 1], zVar, env, letStack, indentLevel) : zVar;
            const callArgs = [zUsed, ...argVars];
            calleeInfo.captures.forEach((cap) => {
              if (cap.kind === 'param') {
                const v = env.paramValues.get(cap.name);
                if (!v) throw new Error(`Missing captured param "${cap.name}" for ${node.callee.name}`);
                callArgs.push(v);
              } else {
                const v = env.setValues.get(cap.binding);
                if (!v) throw new Error(`Missing captured set "${cap.binding?.name || '?'}" for ${node.callee.name}`);
                callArgs.push(v);
              }
            });
            const t = emitter.freshTemp('call');
            emitter.push(`${ind}vec2 ${t} = ${calleeInfo.glslName}(${callArgs.join(', ')});`);
            return t;
            }
          }
          // Generic unary call: evaluate arg at caller z, then evaluate callee at z=arg.
          if (args.length !== 1) {
            throw new Error(`Only unary calls are supported here (got ${args.length} args)`);
          }
          const argVar = emitExpr(args[0], zVar, env, letStack, indentLevel);
          return emitExpr(node.callee, argVar, env, letStack, indentLevel);
        }
        case 'Compose': {
          const inner = emitExpr(node.g, zVar, env, letStack, indentLevel);
          return emitExpr(node.f, inner, env, letStack, indentLevel);
        }
        case 'SetBinding': {
          const valueVar = emitExpr(node.value, zVar, env, letStack, indentLevel);
          const localName = emitter.freshTemp(`set_${node.name || 'v'}`);
          emitter.push(`${ind}vec2 ${localName} = ${valueVar};`);
          const nextEnv = { paramValues: env.paramValues, setValues: new Map(env.setValues) };
          nextEnv.setValues.set(node, localName);
          return emitExpr(node.body, zVar, nextEnv, letStack, indentLevel);
        }
        case 'Pow': {
          const baseVar = emitExpr(node.base, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('pow');
          emitter.push(`${ind}vec2 ${t} = c_pow_int(${baseVar}, ${Number(node.exponent) | 0});`);
          return t;
        }
        case 'Add':
        case 'Sub':
        case 'Mul':
        case 'Div': {
          const left = emitExpr(node.left, zVar, env, letStack, indentLevel);
          const right = emitExpr(node.right, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp(node.kind.toLowerCase());
          const expr =
            node.kind === 'Add'
              ? `${left} + ${right}`
              : node.kind === 'Sub'
                ? `${left} - ${right}`
                : node.kind === 'Mul'
                  ? `c_mul(${left}, ${right})`
                  : `c_div(${left}, ${right})`;
          emitter.push(`${ind}vec2 ${t} = ${expr};`);
          return t;
        }
        case 'LessThan':
        case 'GreaterThan':
        case 'LessThanOrEqual':
        case 'GreaterThanOrEqual':
        case 'Equal': {
          const left = emitExpr(node.left, zVar, env, letStack, indentLevel);
          const right = emitExpr(node.right, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('cmp');
          const op =
            node.kind === 'LessThan'
              ? '<'
              : node.kind === 'GreaterThan'
                ? '>'
                : node.kind === 'LessThanOrEqual'
                  ? '<='
                  : node.kind === 'GreaterThanOrEqual'
                    ? '>='
                    : '==';
          emitter.push(`${ind}float ${t}_flag = ${left}.x ${op} ${right}.x ? 1.0 : 0.0;`);
          emitter.push(`${ind}vec2 ${t} = vec2(${t}_flag, 0.0);`);
          return t;
        }
        case 'LogicalAnd':
        case 'LogicalOr': {
          const left = emitExpr(node.left, zVar, env, letStack, indentLevel);
          const right = emitExpr(node.right, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('log');
          emitter.push(`${ind}bool ${t}_l = (${left}.x != 0.0 || ${left}.y != 0.0);`);
          emitter.push(`${ind}bool ${t}_r = (${right}.x != 0.0 || ${right}.y != 0.0);`);
          const expr = node.kind === 'LogicalAnd' ? `${t}_l && ${t}_r` : `${t}_l || ${t}_r`;
          emitter.push(`${ind}vec2 ${t} = vec2((${expr}) ? 1.0 : 0.0, 0.0);`);
          return t;
        }
        case 'Exp':
        case 'Sin':
        case 'Cos':
        case 'Tan':
        case 'Atan':
        case 'Asin':
        case 'Acos':
        case 'Gamma':
        case 'Fact': {
          const value = emitExpr(node.value, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp(node.kind.toLowerCase());
          const fn =
            node.kind === 'Exp'
              ? 'c_exp'
              : node.kind === 'Sin'
                ? 'c_sin'
                : node.kind === 'Cos'
                  ? 'c_cos'
                  : node.kind === 'Tan'
                    ? 'c_tan'
                    : node.kind === 'Atan'
                      ? 'c_atan'
                      : node.kind === 'Asin'
                        ? 'c_asin'
                        : node.kind === 'Acos'
                          ? 'c_acos'
                          : node.kind === 'Gamma'
                            ? 'c_gamma'
                            : 'c_fact';
          emitter.push(`${ind}vec2 ${t} = ${fn}(${value});`);
          return t;
        }
        case 'Ln': {
          const value = emitExpr(node.value, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('ln');
          if (node.branch) {
            const branch = emitExpr(node.branch, zVar, env, letStack, indentLevel);
            emitter.push(`${ind}vec2 ${t} = c_ln_branch(${value}, ${branch}.x);`);
            return t;
          }
          emitter.push(`${ind}vec2 ${t} = c_ln(${value});`);
          return t;
        }
        case 'Arg': {
          const value = emitExpr(node.value, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('arg');
          if (node.branch) {
            const branch = emitExpr(node.branch, zVar, env, letStack, indentLevel);
            emitter.push(`${ind}vec2 ${t}_ln = c_ln_branch(${value}, ${branch}.x);`);
          } else {
            emitter.push(`${ind}vec2 ${t}_ln = c_ln(${value});`);
          }
          emitter.push(`${ind}vec2 ${t} = vec2(${t}_ln.y, 0.0);`);
          return t;
        }
        case 'Abs': {
          const value = emitExpr(node.value, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('abs');
          emitter.push(`${ind}vec2 ${t} = vec2(length(${value}), 0.0);`);
          return t;
        }
        case 'Abs2': {
          const value = emitExpr(node.value, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('abs2');
          emitter.push(`${ind}vec2 ${t} = vec2(dot(${value}, ${value}), 0.0);`);
          return t;
        }
        case 'Floor': {
          const value = emitExpr(node.value, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('floor');
          emitter.push(`${ind}vec2 ${t} = floor(${value});`);
          return t;
        }
        case 'Conjugate': {
          const value = emitExpr(node.value, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('conj');
          emitter.push(`${ind}vec2 ${t} = vec2(${value}.x, -${value}.y);`);
          return t;
        }
        case 'IsNaN': {
          const value = emitExpr(node.value, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('isnan');
          emitter.push(`${ind}vec2 ${t} = vec2(c_is_error(${value}), 0.0);`);
          return t;
        }
        case 'If': {
          const cond = emitExpr(node.condition, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('if');
          emitter.push(`${ind}vec2 ${t};`);
          emitter.push(`${ind}bool ${t}_sel = (${cond}.x != 0.0 || ${cond}.y != 0.0);`);
          emitter.push(`${ind}if (${t}_sel) {`);
          const thenEnv = { paramValues: env.paramValues, setValues: new Map(env.setValues) };
          const thenValue = emitExpr(node.thenBranch, zVar, thenEnv, letStack, indentLevel + 1);
          emitter.push(`${ind}${emitter.indent}${t} = ${thenValue};`);
          emitter.push(`${ind}} else {`);
          const elseEnv = { paramValues: env.paramValues, setValues: new Map(env.setValues) };
          const elseValue = emitExpr(node.elseBranch, zVar, elseEnv, letStack, indentLevel + 1);
          emitter.push(`${ind}${emitter.indent}${t} = ${elseValue};`);
          emitter.push(`${ind}}`);
          return t;
        }
        case 'IfNaN': {
          const value = emitExpr(node.value, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('ifnan');
          emitter.push(`${ind}vec2 ${t};`);
          emitter.push(`${ind}float ${t}_flag = c_is_error(${value});`);
          emitter.push(`${ind}if (${t}_flag > 0.5) {`);
          const fbEnv = { paramValues: env.paramValues, setValues: new Map(env.setValues) };
          const fallback = emitExpr(node.fallback, zVar, fbEnv, letStack, indentLevel + 1);
          emitter.push(`${ind}${emitter.indent}${t} = ${fallback};`);
          emitter.push(`${ind}} else {`);
          emitter.push(`${ind}${emitter.indent}${t} = ${value};`);
          emitter.push(`${ind}}`);
          return t;
        }
        default: {
          const t = emitter.freshTemp('u');
          emitter.push(`${ind}vec2 ${t} = vec2(0.0, 0.0);`);
          return t;
        }
      }
    }

    // Compile let body as a function.
    emitter.push(`vec2 ${info.glslName}(${glslParams.join(', ')}) {`);
    const resultVar = emitExpr(letNode.value, 'z', fnEnv, definingLetStack || [], 1);
    emitter.push(`${emitter.indent}return ${resultVar};`);
    emitter.push(`}`);

    info.source = emitter.lines.join('\n');
    info.compiled = true;
    return info;
  }

  // Compile the top-level f(z).
  const mainEmitter = createEmitter();
  const topEnv = { paramValues: new Map(), setValues: new Map() };
  const topLetStack = [];

  // Emit f(z) by reusing the same expression emitter as above (with no params).
  function emitTop(node) {
    // Reuse ensureLetCompiled's internal emitter/emitExpr by compiling a synthetic let wrapper.
    // We'll implement a tiny local emitter for the top-level instead.
    const emitter = mainEmitter;

    function emitExpr(node2, zVar, env, letStack, indentLevel = 1) {
      // Delegate by creating a temporary fake let and using ensureLetCompiled's emitter is too messy;
      // replicate the logic by calling ensureLetCompiled then inlining calls to its glslName.
      const ind = emitter.indent.repeat(indentLevel);
      if (!node2 || typeof node2 !== 'object') {
        const t = emitter.freshTemp('c');
        emitter.push(`${ind}vec2 ${t} = vec2(0.0, 0.0);`);
        return t;
      }

      // The implementation mirrors the inner emitExpr above; keep in sync.
      switch (node2.kind) {
        case 'Const': {
          const t = emitter.freshTemp('c');
          emitter.push(`${ind}vec2 ${t} = ${formatVec2Literal(node2.re, node2.im)};`);
          return t;
        }
        case 'Var':
          return zVar;
        case 'VarX': {
          const t = emitter.freshTemp('x');
          emitter.push(`${ind}vec2 ${t} = vec2(${zVar}.x, 0.0);`);
          return t;
        }
        case 'VarY': {
          const t = emitter.freshTemp('y');
          emitter.push(`${ind}vec2 ${t} = vec2(${zVar}.y, 0.0);`);
          return t;
        }
        case 'FingerOffset': {
          const t = emitter.freshTemp('f');
          emitter.push(`${ind}vec2 ${t} = ${uniformExprForFinger(node2.slot)};`);
          return t;
        }
        case 'DeviceRotation': {
          const uniform = node2.slot === 'A' ? 'u_qA' : 'u_qB';
          const t = emitter.freshTemp('q');
          emitter.push(`${ind}vec2 ${t} = ${uniform};`);
          return t;
        }
        case 'TrackballRotation': {
          const uniform = node2.slot === 'A' ? 'u_rA' : 'u_rB';
          const t = emitter.freshTemp('r');
          emitter.push(`${ind}vec2 ${t} = ${uniform};`);
          return t;
        }
        case 'ParamRef': {
          const v = env.paramValues.get(node2.name);
          if (!v) throw new Error(`Unresolved ParamRef during GPU compilation: ${node2.name}`);
          return v;
        }
        case 'SetRef': {
          const v = env.setValues.get(node2.binding);
          if (!v) throw new Error(`Unresolved SetRef during GPU compilation: ${node2.name}`);
          return v;
        }
        case 'LetBinding': {
          ensureLetCompiled(node2, env, letStack);
          const nextLetStack = Array.isArray(letStack) ? [...letStack, node2] : [node2];
          return emitExpr(node2.body, zVar, env, nextLetStack, indentLevel);
        }
        case 'Identifier': {
          const binding = resolveLetBindingByName(node2.name, letStack);
          if (!binding) throw new Error(`Unresolved Identifier during GPU compilation: ${node2.name}`);
          const calleeInfo = ensureLetCompiled(binding, env, letStack);
          if (calleeInfo.params.length > 0) {
            throw new Error(`Function "${node2.name}" requires ${calleeInfo.params.length} extra argument(s)`);
          }
          const argList = [zVar];
          calleeInfo.captures.forEach((cap) => {
            if (cap.kind === 'param') {
              const v = env.paramValues.get(cap.name);
              if (!v) throw new Error(`Missing captured param "${cap.name}" for ${node2.name}`);
              argList.push(v);
            } else {
              const v = env.setValues.get(cap.binding);
              if (!v) throw new Error(`Missing captured set "${cap.binding?.name || '?'}" for ${node2.name}`);
              argList.push(v);
            }
          });
          const t = emitter.freshTemp('id');
          emitter.push(`${ind}vec2 ${t} = ${calleeInfo.glslName}(${argList.join(', ')});`);
          return t;
        }
        case 'Call': {
          const args = Array.isArray(node2.args) ? node2.args : [];
          if (node2.callee && typeof node2.callee === 'object' && node2.callee.kind === 'Identifier') {
            const binding = resolveLetBindingByName(node2.callee.name, letStack);
            if (binding) {
              const calleeInfo = ensureLetCompiled(binding, env, letStack);
            const k = calleeInfo.params.length;
            if (!(args.length === k || args.length === k + 1)) {
              throw new Error(`Function "${node2.callee.name}" expects ${k} or ${k + 1} arguments, got ${args.length}`);
            }
            const argVars = [];
            for (let i = 0; i < k; i += 1) {
                argVars.push(emitExpr(args[i], zVar, env, letStack, indentLevel));
            }
              const zUsed = args.length === k + 1 ? emitExpr(args[args.length - 1], zVar, env, letStack, indentLevel) : zVar;
            const callArgs = [zUsed, ...argVars];
            calleeInfo.captures.forEach((cap) => {
              if (cap.kind === 'param') {
                const v = env.paramValues.get(cap.name);
                if (!v) throw new Error(`Missing captured param "${cap.name}" for ${node2.callee.name}`);
                callArgs.push(v);
              } else {
                const v = env.setValues.get(cap.binding);
                if (!v) throw new Error(`Missing captured set "${cap.binding?.name || '?'}" for ${node2.callee.name}`);
                callArgs.push(v);
              }
            });
            const t = emitter.freshTemp('call');
            emitter.push(`${ind}vec2 ${t} = ${calleeInfo.glslName}(${callArgs.join(', ')});`);
            return t;
            }
          }
          if (args.length !== 1) throw new Error(`Only unary calls are supported here (got ${args.length} args)`);
          const argVar = emitExpr(args[0], zVar, env, letStack, indentLevel);
          return emitExpr(node2.callee, argVar, env, letStack, indentLevel);
        }
        case 'Compose': {
          const inner = emitExpr(node2.g, zVar, env, letStack, indentLevel);
          return emitExpr(node2.f, inner, env, letStack, indentLevel);
        }
        case 'SetBinding': {
          const valueVar = emitExpr(node2.value, zVar, env, letStack, indentLevel);
          const localName = emitter.freshTemp(`set_${node2.name || 'v'}`);
          emitter.push(`${ind}vec2 ${localName} = ${valueVar};`);
          const nextEnv = { paramValues: env.paramValues, setValues: new Map(env.setValues) };
          nextEnv.setValues.set(node2, localName);
          return emitExpr(node2.body, zVar, nextEnv, letStack, indentLevel);
        }
        case 'Pow': {
          const baseVar = emitExpr(node2.base, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('pow');
          emitter.push(`${ind}vec2 ${t} = c_pow_int(${baseVar}, ${Number(node2.exponent) | 0});`);
          return t;
        }
        case 'Add':
        case 'Sub':
        case 'Mul':
        case 'Div': {
          const left = emitExpr(node2.left, zVar, env, letStack, indentLevel);
          const right = emitExpr(node2.right, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp(node2.kind.toLowerCase());
          const expr =
            node2.kind === 'Add'
              ? `${left} + ${right}`
              : node2.kind === 'Sub'
                ? `${left} - ${right}`
                : node2.kind === 'Mul'
                  ? `c_mul(${left}, ${right})`
                  : `c_div(${left}, ${right})`;
          emitter.push(`${ind}vec2 ${t} = ${expr};`);
          return t;
        }
        case 'LessThan':
        case 'GreaterThan':
        case 'LessThanOrEqual':
        case 'GreaterThanOrEqual':
        case 'Equal': {
          const left = emitExpr(node2.left, zVar, env, letStack, indentLevel);
          const right = emitExpr(node2.right, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('cmp');
          const op =
            node2.kind === 'LessThan'
              ? '<'
              : node2.kind === 'GreaterThan'
                ? '>'
                : node2.kind === 'LessThanOrEqual'
                  ? '<='
                  : node2.kind === 'GreaterThanOrEqual'
                    ? '>='
                    : '==';
          emitter.push(`${ind}float ${t}_flag = ${left}.x ${op} ${right}.x ? 1.0 : 0.0;`);
          emitter.push(`${ind}vec2 ${t} = vec2(${t}_flag, 0.0);`);
          return t;
        }
        case 'LogicalAnd':
        case 'LogicalOr': {
          const left = emitExpr(node2.left, zVar, env, letStack, indentLevel);
          const right = emitExpr(node2.right, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('log');
          emitter.push(`${ind}bool ${t}_l = (${left}.x != 0.0 || ${left}.y != 0.0);`);
          emitter.push(`${ind}bool ${t}_r = (${right}.x != 0.0 || ${right}.y != 0.0);`);
          const expr = node2.kind === 'LogicalAnd' ? `${t}_l && ${t}_r` : `${t}_l || ${t}_r`;
          emitter.push(`${ind}vec2 ${t} = vec2((${expr}) ? 1.0 : 0.0, 0.0);`);
          return t;
        }
        case 'Exp':
        case 'Sin':
        case 'Cos':
        case 'Tan':
        case 'Atan':
        case 'Asin':
        case 'Acos':
        case 'Gamma':
        case 'Fact': {
          const value = emitExpr(node2.value, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp(node2.kind.toLowerCase());
          const fn =
            node2.kind === 'Exp'
              ? 'c_exp'
              : node2.kind === 'Sin'
                ? 'c_sin'
                : node2.kind === 'Cos'
                  ? 'c_cos'
                  : node2.kind === 'Tan'
                    ? 'c_tan'
                    : node2.kind === 'Atan'
                      ? 'c_atan'
                      : node2.kind === 'Asin'
                        ? 'c_asin'
                        : node2.kind === 'Acos'
                          ? 'c_acos'
                          : node2.kind === 'Gamma'
                            ? 'c_gamma'
                            : 'c_fact';
          emitter.push(`${ind}vec2 ${t} = ${fn}(${value});`);
          return t;
        }
        case 'Ln': {
          const value = emitExpr(node2.value, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('ln');
          if (node2.branch) {
            const branch = emitExpr(node2.branch, zVar, env, letStack, indentLevel);
            emitter.push(`${ind}vec2 ${t} = c_ln_branch(${value}, ${branch}.x);`);
            return t;
          }
          emitter.push(`${ind}vec2 ${t} = c_ln(${value});`);
          return t;
        }
        case 'Arg': {
          const value = emitExpr(node2.value, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('arg');
          if (node2.branch) {
            const branch = emitExpr(node2.branch, zVar, env, letStack, indentLevel);
            emitter.push(`${ind}vec2 ${t}_ln = c_ln_branch(${value}, ${branch}.x);`);
          } else {
            emitter.push(`${ind}vec2 ${t}_ln = c_ln(${value});`);
          }
          emitter.push(`${ind}vec2 ${t} = vec2(${t}_ln.y, 0.0);`);
          return t;
        }
        case 'Abs': {
          const value = emitExpr(node2.value, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('abs');
          emitter.push(`${ind}vec2 ${t} = vec2(length(${value}), 0.0);`);
          return t;
        }
        case 'Abs2': {
          const value = emitExpr(node2.value, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('abs2');
          emitter.push(`${ind}vec2 ${t} = vec2(dot(${value}, ${value}), 0.0);`);
          return t;
        }
        case 'Floor': {
          const value = emitExpr(node2.value, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('floor');
          emitter.push(`${ind}vec2 ${t} = floor(${value});`);
          return t;
        }
        case 'Conjugate': {
          const value = emitExpr(node2.value, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('conj');
          emitter.push(`${ind}vec2 ${t} = vec2(${value}.x, -${value}.y);`);
          return t;
        }
        case 'IsNaN': {
          const value = emitExpr(node2.value, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('isnan');
          emitter.push(`${ind}vec2 ${t} = vec2(c_is_error(${value}), 0.0);`);
          return t;
        }
        case 'If': {
          const cond = emitExpr(node2.condition, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('if');
          emitter.push(`${ind}vec2 ${t};`);
          emitter.push(`${ind}bool ${t}_sel = (${cond}.x != 0.0 || ${cond}.y != 0.0);`);
          emitter.push(`${ind}if (${t}_sel) {`);
          const thenEnv = { paramValues: env.paramValues, setValues: new Map(env.setValues) };
          const thenValue = emitExpr(node2.thenBranch, zVar, thenEnv, letStack, indentLevel + 1);
          emitter.push(`${ind}${emitter.indent}${t} = ${thenValue};`);
          emitter.push(`${ind}} else {`);
          const elseEnv = { paramValues: env.paramValues, setValues: new Map(env.setValues) };
          const elseValue = emitExpr(node2.elseBranch, zVar, elseEnv, letStack, indentLevel + 1);
          emitter.push(`${ind}${emitter.indent}${t} = ${elseValue};`);
          emitter.push(`${ind}}`);
          return t;
        }
        case 'IfNaN': {
          const value = emitExpr(node2.value, zVar, env, letStack, indentLevel);
          const t = emitter.freshTemp('ifnan');
          emitter.push(`${ind}vec2 ${t};`);
          emitter.push(`${ind}float ${t}_flag = c_is_error(${value});`);
          emitter.push(`${ind}if (${t}_flag > 0.5) {`);
          const fbEnv = { paramValues: env.paramValues, setValues: new Map(env.setValues) };
          const fallback = emitExpr(node2.fallback, zVar, fbEnv, letStack, indentLevel + 1);
          emitter.push(`${ind}${emitter.indent}${t} = ${fallback};`);
          emitter.push(`${ind}} else {`);
          emitter.push(`${ind}${emitter.indent}${t} = ${value};`);
          emitter.push(`${ind}}`);
          return t;
        }
        default: {
          const t = emitter.freshTemp('u');
          emitter.push(`${ind}vec2 ${t} = vec2(0.0, 0.0);`);
          return t;
        }
      }
    }

    emitter.push('vec2 f(vec2 z) {');
    const out = emitExpr(node, 'z', topEnv, topLetStack, 1);
    emitter.push(`${emitter.indent}return ${out};`);
    emitter.push('}');
  }

  emitTop(rootAst);

  // Emit let functions (in order of creation).
  const letPrototypes = [];
  const letSources = [];
  for (const info of letInfoByBinding.values()) {
    if (info.compiled && info.source && Array.isArray(info.glslParams)) {
      letPrototypes.push(`vec2 ${info.glslName}(${info.glslParams.join(', ')});`);
      letSources.push(info.source);
    }
  }
  const mainSource = mainEmitter.lines.join('\n');
  const protoBlock = letPrototypes.length ? `${letPrototypes.join('\n')}\n\n` : '';
  const bodyBlock = letSources.length ? `${letSources.join('\n\n')}\n\n` : '';
  return `${protoBlock}${bodyBlock}${mainSource}`;
}

export function compileFormulaForGpu(ast) {
  const gpuAst = prepareAstForGpu(ast);
  const loopLowered = materializeRepeatLoops(gpuAst);
  const preparedAst = materializeComposeMultiples(loopLowered);
  // Compute uniform counts on the pre-materialized AST so repeat count expressions
  // still contribute any finger usage to uniform sizing.
  const uniformCounts = analyzeFingerUniformCounts(gpuAst);
  const funcs = compileFormulaFunctionsSSA(preparedAst);
  const fragmentSource = fragmentTemplate
    .replace("/*FIXED_OFFSETS_COUNT*/", String(uniformCounts.fixedCount))
    .replace("/*DYNAMIC_OFFSETS_COUNT*/", String(uniformCounts.dynamicCount))
    .replace("/*FORMULA_FUNCS*/", funcs);
  return { fragmentSource, uniformCounts, gpuAst };
}

// =========================
// Renderer core
// =========================

export class ReflexCore {
  constructor(canvas, initialAST = createDefaultFormulaAST(), options = {}) {
    const {
      autoRender = true,
      installEventListeners = true,
    } = options || {};

    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true }) || canvas.getContext('webgl2');
    if (!this.gl) {
      throw new Error('WebGL2 not supported in this browser');
    }

    this._contextLost = false;
    this._contextLostListener = null;
    this._contextRestoredListener = null;
    this._windowResizeListener = null;

    this.program = null;
    this.vao = null;
    this.uMinLoc = null;
    this.uMaxLoc = null;
    this.uResolutionLoc = null;
    this.uFixedOffsetsLoc = null;
    this.uDynamicOffsetsLoc = null;
    this.uWOffsetsLoc = null;
    this.uQA_Loc = null;
    this.uQB_Loc = null;
    this.uRA_Loc = null;
    this.uRB_Loc = null;

    this.baseHalfSpan = 4.0;
    this.viewXSpan = 8.0;
    this.viewYSpan = 8.0;
    this.viewXMin = -4.0;
    this.viewXMax = 4.0;
    this.viewYMin = -4.0;
    this.viewYMax = 4.0;

    this.fingerValues = new Map();
    this.fingerListeners = new Map();
    this.trackballListeners = new Set();

    this.fixedUniformCount = 1;
    this.dynamicUniformCount = 1;
    this.wUniformCount = 2;

    this.fixedOffsetsBuffer = new Float32Array(this.fixedUniformCount * 2);
    this.dynamicOffsetsBuffer = new Float32Array(this.dynamicUniformCount * 2);
    this.wOffsetsBuffer = new Float32Array(this.wUniformCount * 2);
    this.fixedOffsetsDirty = true;
    this.dynamicOffsetsDirty = true;
    this.wOffsetsDirty = true;

    this.setFingerValue('W0', 0, 0, { triggerRender: false });
    this.setFingerValue('W1', 1, 0, { triggerRender: false });
    this.setFingerValue('W2', 0, 0, { triggerRender: false });

    this.pointerStates = new Map();
    this.pointerSequence = 0;
    this.activeFixedSlots = [];
    this.activeDynamicSlots = [];
    this.activeWSlots = [];
    this.activeFingerFamily = 'none';
    this.fingerAxisConstraints = new Map();
    this.wGestureState = null;
    this.wGestureLatched = false;
    this.trackballEnabled = false;
    this.trackballGestureState = null;
    // If we render before the browser has computed layout, canvas.clientWidth/Height can
    // temporarily report 0–1px (notably on mobile/PWA). Resizing the backing store to
    // that tiny size produces a uniform full-screen color until a later resize/re-render.
    // Track a single scheduled retry render once layout stabilizes.
    this._layoutRetryRaf = null;
    this._resizeObserver = null;
    this._resizeObserverRaf = null;
    this._visibilityListener = null;
    this._pageShowListener = null;

    // SU(2) rotations:
    // - device rotation (QA/QB): relative to the baseline captured on first reading
    // - trackball rotation (RA/RB): user-controlled (UI), default identity
    this._deviceRotationListener = null;
    this._deviceRotationEventName = null;
    this._deviceRotationRaf = null;
    this._deviceRotationPermissionRequested = false;
    this._deviceRotationBaselineQuat = null; // {w,x,y,z}
    this._deviceSU2 = { A: { x: 1, y: 0 }, B: { x: 0, y: 0 } };
    this._trackballSU2 = { A: { x: 1, y: 0 }, B: { x: 0, y: 0 } };
    this._trackballQuat = { w: 1, x: 0, y: 0, z: 0 };

    // Keep the original AST for display/export, but compile a lowered version for the GPU.
    this.formulaAST = initialAST;
    this._gpuAST = prepareAstForGpu(initialAST);

    this.rebuildProgram();
    if (autoRender) {
      this.render();
    }

    if (installEventListeners && typeof window !== 'undefined') {
      this._windowResizeListener = () => this.render();
      window.addEventListener('resize', this._windowResizeListener);
    }

    // Some browsers (notably mobile/PWA shells) can change the CSS pixel size of the
    // canvas without firing a window 'resize' event (address bar collapse/expand,
    // viewport restoration after app switch, etc). Observe the canvas element and
    // re-render whenever its box size changes.
    if (installEventListeners && typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => {
        if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
          this.render();
          return;
        }
        if (this._resizeObserverRaf != null) {
          return;
        }
        this._resizeObserverRaf = window.requestAnimationFrame(() => {
          this._resizeObserverRaf = null;
          this.render();
        });
      });
      try {
        this._resizeObserver.observe(this.canvas);
      } catch (_) {
        // ignore observer failures
      }
    }

    // When returning to a tab/PWA, WebGL canvases can display stale content until the
    // next explicit draw. Ensure we re-render on visibility restoration.
    if (installEventListeners && typeof document !== 'undefined') {
      this._visibilityListener = () => {
        if (document.hidden) {
          return;
        }
        this.render();
      };
      document.addEventListener('visibilitychange', this._visibilityListener);
    }
    if (installEventListeners && typeof window !== 'undefined') {
      this._pageShowListener = () => this.render();
      window.addEventListener('pageshow', this._pageShowListener);
    }

    if (installEventListeners) {
      // Best-effort: starts immediately on most browsers; on iOS it activates after permission.
      this.ensureDeviceRotationListener();
    }

    // Mobile PWAs can lose the WebGL context while backgrounded. Without explicit
    // handling, the canvas often comes back black until a full reload.
    // When a context is restored, all GPU resources must be recreated.
    this._contextLostListener = (event) => {
      try {
        event.preventDefault();
      } catch (_) {
        // ignore
      }
      this._contextLost = true;
    };
    this._contextRestoredListener = () => {
      this._contextLost = false;
      this.handleContextRestored();
    };
    if (installEventListeners) {
      try {
        this.canvas.addEventListener('webglcontextlost', this._contextLostListener, false);
        this.canvas.addEventListener('webglcontextrestored', this._contextRestoredListener, false);
      } catch (_) {
        // ignore listener failures
      }
    }
  }

  dispose() {
    // Best-effort cleanup for offscreen renderers (export, tests, etc.).
    if (typeof window !== 'undefined' && this._windowResizeListener) {
      try {
        window.removeEventListener('resize', this._windowResizeListener);
      } catch (_) {
        // ignore
      }
      this._windowResizeListener = null;
    }
    if (this._resizeObserver) {
      try {
        this._resizeObserver.disconnect();
      } catch (_) {
        // ignore
      }
      this._resizeObserver = null;
    }
    if (this._resizeObserverRaf != null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      try {
        window.cancelAnimationFrame(this._resizeObserverRaf);
      } catch (_) {
        // ignore
      }
      this._resizeObserverRaf = null;
    }
    if (this._layoutRetryRaf != null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      try {
        window.cancelAnimationFrame(this._layoutRetryRaf);
      } catch (_) {
        // ignore
      }
      this._layoutRetryRaf = null;
    }
    if (typeof document !== 'undefined' && this._visibilityListener) {
      try {
        document.removeEventListener('visibilitychange', this._visibilityListener);
      } catch (_) {
        // ignore
      }
      this._visibilityListener = null;
    }
    if (typeof window !== 'undefined' && this._pageShowListener) {
      try {
        window.removeEventListener('pageshow', this._pageShowListener);
      } catch (_) {
        // ignore
      }
      this._pageShowListener = null;
    }
    if (this.canvas && this._contextLostListener) {
      try {
        this.canvas.removeEventListener('webglcontextlost', this._contextLostListener, false);
      } catch (_) {
        // ignore
      }
      this._contextLostListener = null;
    }
    if (this.canvas && this._contextRestoredListener) {
      try {
        this.canvas.removeEventListener('webglcontextrestored', this._contextRestoredListener, false);
      } catch (_) {
        // ignore
      }
      this._contextRestoredListener = null;
    }

    if (typeof window !== 'undefined' && this._deviceRotationListener && this._deviceRotationEventName) {
      try {
        window.removeEventListener(this._deviceRotationEventName, this._deviceRotationListener);
      } catch (_) {
        // ignore
      }
    }
    this._deviceRotationListener = null;
    this._deviceRotationEventName = null;
    if (this._deviceRotationRaf != null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      try {
        window.cancelAnimationFrame(this._deviceRotationRaf);
      } catch (_) {
        // ignore
      }
    }
    this._deviceRotationRaf = null;
  }

  handleContextRestored() {
    // Try to re-acquire the context (some browsers return a "new" object).
    const nextGl =
      this.canvas.getContext('webgl2', { preserveDrawingBuffer: true }) ||
      this.canvas.getContext('webgl2');
    if (nextGl) {
      this.gl = nextGl;
    }
    // Clear references to GL resources created before the loss.
    this.program = null;
    this.vao = null;
    this.uMinLoc = null;
    this.uMaxLoc = null;
    this.uResolutionLoc = null;
    this.uFixedOffsetsLoc = null;
    this.uDynamicOffsetsLoc = null;
    this.uWOffsetsLoc = null;

    try {
      this.rebuildProgram();
      this.render();
    } catch (error) {
      // Keep the app alive; callers can decide how to surface errors.
      console.error('Failed to restore WebGL resources after context restore.', error);
    }
  }

  setFormulaAST(ast) {
    // Keep the original AST for display/export. Shader generation will lower
    // `LetBinding` and materialize `ComposeMultiple` on-demand without mutating it.
    this.formulaAST = ast;
    this._gpuAST = prepareAstForGpu(ast);
    this.rebuildProgram();
    this.render();
  }

  setCompiledFormula({ ast, gpuAst = null, fragmentSource, uniformCounts } = {}) {
    if (!ast || typeof ast !== 'object') {
      throw new Error('setCompiledFormula requires an AST.');
    }
    if (typeof fragmentSource !== 'string' || !fragmentSource.trim()) {
      throw new Error('setCompiledFormula requires a fragmentSource string.');
    }
    if (!uniformCounts || typeof uniformCounts !== 'object') {
      throw new Error('setCompiledFormula requires uniformCounts.');
    }
    // Preserve the display AST. Accept a pre-lowered GPU AST to avoid doing that
    // work on the main thread (useful when compiling in a Web Worker).
    this.formulaAST = ast;
    this._gpuAST = gpuAst && typeof gpuAst === 'object' ? gpuAst : prepareAstForGpu(ast);
    this.rebuildProgramFromCompiled(fragmentSource, uniformCounts);
    this.render();
  }

  getFormulaAST() {
    return this.formulaAST;
  }

  setActiveFingerConfig({
    fixedSlots = [],
    dynamicSlots = [],
    wSlots = [],
    axisConstraints = new Map(),
    trackballEnabled = false,
  } = {}) {
    this.activeFixedSlots = Array.isArray(fixedSlots) ? [...fixedSlots] : [];
    this.activeDynamicSlots = Array.isArray(dynamicSlots) ? [...dynamicSlots] : [];
    this.activeWSlots = Array.isArray(wSlots) ? [...wSlots] : [];
    this.trackballEnabled = Boolean(trackballEnabled);
    this.activeFingerFamily = this.activeFixedSlots.length && this.activeDynamicSlots.length
      ? 'mixed'
      : this.activeFixedSlots.length
        ? 'fixed'
        : this.activeDynamicSlots.length
          ? 'dynamic'
          : 'none';
    this.fingerAxisConstraints = axisConstraints instanceof Map ? new Map(axisConstraints) : new Map();
    this.releaseAllPointerAssignments();
  }

  releaseAllPointerAssignments() {
    if (!this.pointerStates.size) {
      return;
    }
    for (const state of this.pointerStates.values()) {
      try {
        this.canvas.releasePointerCapture(state.pointerId);
      } catch (_) {
        // ignore
      }
    }
    this.pointerStates.clear();
    this.wGestureState = null;
    this.wGestureLatched = false;
    this.trackballGestureState = null;
  }

  getTrackballSU2() {
    return {
      A: { x: this._trackballSU2.A.x, y: this._trackballSU2.A.y },
      B: { x: this._trackballSU2.B.x, y: this._trackballSU2.B.y },
    };
  }

  onTrackballChange(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    this.trackballListeners.add(listener);
    try {
      listener(this.getTrackballSU2());
    } catch (err) {
      console.error('ReflexCore trackball listener threw', err);
    }
    return () => {
      this.trackballListeners.delete(listener);
    };
  }

  notifyTrackballChange() {
    if (!this.trackballListeners.size) {
      return;
    }
    const snapshot = this.getTrackballSU2();
    this.trackballListeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('ReflexCore trackball listener threw', err);
      }
    });
  }

  setTrackballFromQuaternion(quat, { triggerRender = true } = {}) {
    if (!quat || typeof quat !== 'object') {
      return;
    }
    const w = Number(quat.w);
    const x = Number(quat.x);
    const y = Number(quat.y);
    const z = Number(quat.z);
    const n = Math.hypot(w, x, y, z);
    if (!(n > 0) || !Number.isFinite(n)) {
      return;
    }
    // Store trackball rotation in the same "app frame" as the device rotation mapping.
    // This keeps left/right vs up/down consistent between QA/QB and RA/RB.
    const q = { w: w / n, x: x / n, y: y / n, z: z / n };
    this._trackballQuat = q;
    this._trackballSU2 = {
      A: { x: q.w, y: q.z }, // w + i z
      B: { x: q.x, y: q.y }, // x + i y
    };
    this.notifyTrackballChange();
    if (triggerRender) {
      this.render();
    }
  }

  setTrackballFromSU2(A, B, { triggerRender = true } = {}) {
    const a = A && typeof A === 'object' ? { x: Number(A.x), y: Number(A.y) } : null;
    const b = B && typeof B === 'object' ? { x: Number(B.x), y: Number(B.y) } : null;
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
      return;
    }
    // Convert SU(2) complex pair to quaternion: A = w + i z, B = x + i y.
    this.setTrackballFromQuaternion({ w: a.x, x: b.x, y: b.y, z: a.y }, { triggerRender });
  }

  resetTrackball({ triggerRender = true } = {}) {
    this.setTrackballFromQuaternion({ w: 1, x: 0, y: 0, z: 0 }, { triggerRender });
  }

  getFingerValue(label) {
    const slot = validateFingerLabel(label);
    const value = this.fingerValues.get(slot) || this.defaultFingerValue(slot);
    return { x: value.x, y: value.y };
  }

  defaultFingerValue(label) {
    if (label === 'W1') {
      return { x: 1, y: 0 };
    }
    return { x: 0, y: 0 };
  }

  setFingerValue(label, x, y, { triggerRender = true } = {}) {
    const slot = validateFingerLabel(label);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    const qx = roundFingerComponent(x);
    const qy = roundFingerComponent(y);
    if (!Number.isFinite(qx) || !Number.isFinite(qy)) {
      return;
    }
    const current = this.fingerValues.get(slot);
    if (current && current.x === qx && current.y === qy) {
      return;
    }
    this.fingerValues.set(slot, { x: qx, y: qy });
    const index = fingerIndexFromLabel(slot);
    const family = fingerFamilyFromLabel(slot);
    if (family === "fixed") {
      if (index >= 0) {
        this.ensureOffsetsBufferCapacity('fixed', index + 1);
        this.fixedOffsetsBuffer[index * 2] = qx;
        this.fixedOffsetsBuffer[index * 2 + 1] = qy;
        this.fixedOffsetsDirty = true;
      }
    } else if (family === "dynamic") {
      if (index >= 0) {
        this.ensureOffsetsBufferCapacity('dynamic', index + 1);
        this.dynamicOffsetsBuffer[index * 2] = qx;
        this.dynamicOffsetsBuffer[index * 2 + 1] = qy;
        this.dynamicOffsetsDirty = true;
      }
    } else if (family === "w") {
      if (index >= 0) {
        this.wOffsetsBuffer[index * 2] = qx;
        this.wOffsetsBuffer[index * 2 + 1] = qy;
        this.wOffsetsDirty = true;
      }
    }
    this.notifyFingerChange(slot);
    if (triggerRender) {
      this.render();
    }
  }

  ensureOffsetsBufferCapacity(family, neededCount) {
    const count = Math.max(1, Number(neededCount) || 1);
    if (family === 'fixed') {
      const current = this.fixedOffsetsBuffer.length / 2;
      if (count <= current) {
        return;
      }
      const next = new Float32Array(count * 2);
      next.set(this.fixedOffsetsBuffer);
      this.fixedOffsetsBuffer = next;
      return;
    }
    if (family === 'dynamic') {
      const current = this.dynamicOffsetsBuffer.length / 2;
      if (count <= current) {
        return;
      }
      const next = new Float32Array(count * 2);
      next.set(this.dynamicOffsetsBuffer);
      this.dynamicOffsetsBuffer = next;
    }
  }

  onFingerChange(label, listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    const slot = validateFingerLabel(label);
    let bucket = this.fingerListeners.get(slot);
    if (!bucket) {
      bucket = new Set();
      this.fingerListeners.set(slot, bucket);
    }
    bucket.add(listener);
    try {
      listener(this.getFingerValue(slot));
    } catch (err) {
      console.error('ReflexCore finger listener threw', err);
    }
    return () => {
      bucket.delete(listener);
    };
  }

  notifyFingerChange(label) {
    const bucket = this.fingerListeners.get(label);
    if (!bucket || !bucket.size) {
      return;
    }
    const snapshot = this.getFingerValue(label);
    bucket.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('ReflexCore finger listener threw', err);
      }
    });
  }

  getOffset() {
    return this.getFingerValue('F1');
  }

  getOffset2() {
    return this.getFingerValue('F2');
  }

  setOffset(x, y, options) {
    this.setFingerValue('F1', x, y, options);
  }

  setOffset2(x, y, options) {
    this.setFingerValue('F2', x, y, options);
  }

  onOffsetChange(listener) {
    return this.onFingerChange('F1', listener);
  }

  onOffset2Change(listener) {
    return this.onFingerChange('F2', listener);
  }

  createShader(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    const ok = this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS);
    if (!ok) {
      const info = this.gl.getShaderInfoLog(shader) || '(no info log)';
      this.gl.deleteShader(shader);
      throw new Error('Could not compile shader:\n' + info);
    }
    return shader;
  }

  createProgram(vertexSrc, fragmentSrc) {
    const vs = this.createShader(this.gl.VERTEX_SHADER, vertexSrc);
    const fs = this.createShader(this.gl.FRAGMENT_SHADER, fragmentSrc);
    const program = this.gl.createProgram();
    this.gl.attachShader(program, vs);
    this.gl.attachShader(program, fs);
    this.gl.linkProgram(program);
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const info = this.gl.getProgramInfoLog(program) || '(no program log)';
      this.gl.deleteProgram(program);
      throw new Error('Could not link program:\n' + info);
    }
    return program;
  }

  rebuildProgram() {
    const compiled = compileFormulaForGpu(this._gpuAST);
    this.rebuildProgramFromCompiled(compiled.fragmentSource, compiled.uniformCounts);
  }

  rebuildProgramFromCompiled(fragmentSource, uniformCounts) {
    this.fixedUniformCount = uniformCounts.fixedCount;
    this.dynamicUniformCount = uniformCounts.dynamicCount;
    this.wUniformCount = uniformCounts.wCount;
    // Ensure CPU-side buffers exist for the uniforms declared in the shader.
    this.ensureOffsetsBufferCapacity('fixed', this.fixedUniformCount);
    this.ensureOffsetsBufferCapacity('dynamic', this.dynamicUniformCount);
    if (!this.wOffsetsBuffer || this.wOffsetsBuffer.length !== this.wUniformCount * 2) {
      this.wOffsetsBuffer = new Float32Array(this.wUniformCount * 2);
    }
    // Fill buffers from current fingerValues (defaults to 0, with W1 defaulting to 1+0i).
    this.hydrateUniformBuffersFromFingerValues();

    this.lastFragmentSource = fragmentSource;
    const newProgram = this.createProgram(vertexSource, fragmentSource);
    this.program = newProgram;
    this.gl.useProgram(this.program);

    if (!this.vao) {
      this.vao = this.gl.createVertexArray();
    }
    this.gl.bindVertexArray(this.vao);

    this.uMinLoc = this.gl.getUniformLocation(this.program, 'u_min');
    this.uMaxLoc = this.gl.getUniformLocation(this.program, 'u_max');
    this.uResolutionLoc = this.gl.getUniformLocation(this.program, 'u_resolution');
    this.uQA_Loc = this.gl.getUniformLocation(this.program, 'u_qA');
    this.uQB_Loc = this.gl.getUniformLocation(this.program, 'u_qB');
    this.uRA_Loc = this.gl.getUniformLocation(this.program, 'u_rA');
    this.uRB_Loc = this.gl.getUniformLocation(this.program, 'u_rB');
    this.uFixedOffsetsLoc = this.gl.getUniformLocation(this.program, 'u_fixedOffsets[0]');
    this.uDynamicOffsetsLoc = this.gl.getUniformLocation(this.program, 'u_dynamicOffsets[0]');
    this.uWOffsetsLoc = this.gl.getUniformLocation(this.program, 'u_wOffsets[0]');
    this.fixedOffsetsDirty = true;
    this.dynamicOffsetsDirty = true;
    this.wOffsetsDirty = true;
  }

  hydrateUniformBuffersFromFingerValues() {
    // Fixed offsets
    for (let i = 0; i < this.fixedUniformCount; i += 1) {
      const label = `F${i + 1}`;
      const value = this.fingerValues.get(label) || this.defaultFingerValue(label);
      this.fixedOffsetsBuffer[i * 2] = value.x;
      this.fixedOffsetsBuffer[i * 2 + 1] = value.y;
    }
    // Dynamic offsets
    for (let i = 0; i < this.dynamicUniformCount; i += 1) {
      const label = `D${i + 1}`;
      const value = this.fingerValues.get(label) || this.defaultFingerValue(label);
      this.dynamicOffsetsBuffer[i * 2] = value.x;
      this.dynamicOffsetsBuffer[i * 2 + 1] = value.y;
    }
    // Workspace offsets
    for (let i = 0; i < this.wUniformCount; i += 1) {
      // We always expose only 2 W uniforms (`W1` and `W2`) to the shader.
      // When interacting with the W0/W1 pair, we map W0 onto the W2 slot.
      let label = `W${i + 1}`;
      if (label === 'W2' && this.activeWSlots?.includes?.('W0')) {
        label = 'W0';
      }
      const value = this.fingerValues.get(label) || this.defaultFingerValue(label);
      this.wOffsetsBuffer[i * 2] = value.x;
      this.wOffsetsBuffer[i * 2 + 1] = value.y;
    }
  }

  resizeCanvasToDisplaySize() {
    const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
    const cssWidth = this.canvas.clientWidth;
    const cssHeight = this.canvas.clientHeight;

    // If layout isn't ready, avoid shrinking the backing store to 0–1px. Keep the
    // previous canvas size (or a sane fallback) and request a retry on the next frame.
    if (!(cssWidth > 1 && cssHeight > 1)) {
      // If a previous render already shrunk us to 0–1px, restore a reasonable default
      // so the first visible frame isn't a single stretched pixel.
      if (this.canvas.width <= 1 || this.canvas.height <= 1) {
        this.canvas.width = 300;
        this.canvas.height = 150;
      }
      if (this.canvas.width > 0 && this.canvas.height > 0) {
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      }
      return { layoutReady: false, resized: false };
    }

    const displayWidth = Math.floor(cssWidth * dpr);
    const displayHeight = Math.floor(cssHeight * dpr);
    const resized = this.canvas.width !== displayWidth || this.canvas.height !== displayHeight;

    if (resized) {
      this.canvas.width = displayWidth;
      this.canvas.height = displayHeight;
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    return { layoutReady: true, resized };
  }

  updateView() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    if (w >= h) {
      this.viewXSpan = 2.0 * this.baseHalfSpan;
      this.viewYSpan = this.viewXSpan * (h / w);
    } else {
      this.viewYSpan = 2.0 * this.baseHalfSpan;
      this.viewXSpan = this.viewYSpan * (w / h);
    }

    const xCenter = 0.0;
    const yCenter = 0.0;
    this.viewXMin = xCenter - this.viewXSpan / 2.0;
    this.viewXMax = xCenter + this.viewXSpan / 2.0;
    this.viewYMin = yCenter - this.viewYSpan / 2.0;
    this.viewYMax = yCenter + this.viewYSpan / 2.0;

    this.gl.uniform2f(this.uMinLoc, this.viewXMin, this.viewYMin);
    this.gl.uniform2f(this.uMaxLoc, this.viewXMax, this.viewYMax);
  }

  uploadFingerUniforms() {
    if (this.uFixedOffsetsLoc && this.fixedOffsetsDirty) {
      this.gl.uniform2fv(
        this.uFixedOffsetsLoc,
        this.fixedOffsetsBuffer.subarray(0, this.fixedUniformCount * 2),
      );
      this.fixedOffsetsDirty = false;
    }
    if (this.uDynamicOffsetsLoc && this.dynamicOffsetsDirty) {
      this.gl.uniform2fv(
        this.uDynamicOffsetsLoc,
        this.dynamicOffsetsBuffer.subarray(0, this.dynamicUniformCount * 2),
      );
      this.dynamicOffsetsDirty = false;
    }
    if (this.uWOffsetsLoc && this.wOffsetsDirty) {
      this.gl.uniform2fv(
        this.uWOffsetsLoc,
        this.wOffsetsBuffer.subarray(0, this.wUniformCount * 2),
      );
      this.wOffsetsDirty = false;
    }
  }

  uploadSu2Uniforms() {
    // These uniforms may be optimized out if unused by the compiled shader.
    const qA = this._deviceSU2?.A ?? { x: 1, y: 0 };
    const qB = this._deviceSU2?.B ?? { x: 0, y: 0 };
    const rA = this._trackballSU2?.A ?? { x: 1, y: 0 };
    const rB = this._trackballSU2?.B ?? { x: 0, y: 0 };

    if (this.uQA_Loc) this.gl.uniform2f(this.uQA_Loc, qA.x, qA.y);
    if (this.uQB_Loc) this.gl.uniform2f(this.uQB_Loc, qB.x, qB.y);
    if (this.uRA_Loc) this.gl.uniform2f(this.uRA_Loc, rA.x, rA.y);
    if (this.uRB_Loc) this.gl.uniform2f(this.uRB_Loc, rB.x, rB.y);
  }

  render() {
    if (!this.program) return;
    if (
      this._contextLost ||
      (this.gl && typeof this.gl.isContextLost === 'function' && this.gl.isContextLost())
    ) {
      return;
    }
    const { layoutReady } = this.resizeCanvasToDisplaySize();
    if (!layoutReady && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      if (this._layoutRetryRaf == null) {
        this._layoutRetryRaf = window.requestAnimationFrame(() => {
          this._layoutRetryRaf = null;
          this.render();
        });
      }
    }
    this.gl.useProgram(this.program);
    this.uploadFingerUniforms();
    this.uploadSu2Uniforms();
    this.gl.uniform2f(this.uResolutionLoc, this.canvas.width, this.canvas.height);
    this.updateView();

    this.gl.clearColor(0, 0, 0, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  renderToPixelSize(width, height) {
    if (!this.program) return;
    if (
      this._contextLost ||
      (this.gl && typeof this.gl.isContextLost === 'function' && this.gl.isContextLost())
    ) {
      return;
    }

    const w = Math.floor(Number(width));
    const h = Math.floor(Number(height));
    if (!(w > 0 && h > 0)) {
      throw new Error(`Invalid render size: ${width}x${height}`);
    }

    // Force the backing store to exact pixel dimensions (ignore DPR/client size).
    if (this.canvas.width !== w) {
      this.canvas.width = w;
    }
    if (this.canvas.height !== h) {
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);

    this.gl.useProgram(this.program);
    this.uploadFingerUniforms();
    this.uploadSu2Uniforms();
    this.gl.uniform2f(this.uResolutionLoc, w, h);
    this.updateView();

    this.gl.clearColor(0, 0, 0, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  handlePointerDown(e) {
    // iOS Safari requires a user gesture for device orientation access.
    this.maybeRequestDeviceRotationPermission();
    if (
      this.activeFingerFamily === 'none' &&
      !this.activeWSlots.length
    ) {
      return;
    }
    const state = {
      pointerId: e.pointerId,
      sequence: this.pointerSequence++,
      startClientX: e.clientX,
      startClientY: e.clientY,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
      role: null,
      slot: null,
      axis: null,
      originX: 0,
      originY: 0,
      fingerInitialValue: null,
      fingerLastValue: null,
      fingerHasSignificantMovement: false,
      maxScreenDistance: 0,
      prevRole: null,
      prevSlot: null,
    };
    this.pointerStates.set(e.pointerId, state);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch (_) {
      // ignore
    }
    this.recomputePointerRoles();
  }

  maybeRequestDeviceRotationPermission() {
    if (this._deviceRotationPermissionRequested) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    const DOE = window.DeviceOrientationEvent;
    if (!DOE || typeof DOE.requestPermission !== 'function') {
      // No permission gate: ensure listener is installed.
      this.ensureDeviceRotationListener();
      return;
    }
    this._deviceRotationPermissionRequested = true;
    Promise.resolve()
      .then(() => DOE.requestPermission())
      .then((result) => {
        if (result === 'granted') {
          this.ensureDeviceRotationListener({ force: true });
        }
      })
      .catch(() => {
        // Permission denied or unsupported; keep values at identity.
      });
  }

  ensureDeviceRotationListener({ force = false } = {}) {
    if (this._deviceRotationListener || typeof window === 'undefined') {
      return;
    }
    const DOE = window.DeviceOrientationEvent;
    if (!DOE) {
      return;
    }
    // On iOS, a permission gate exists. Only install after permission is granted
    // (we can’t query state, so rely on the gesture-triggered request flow).
    if (!force && typeof DOE.requestPermission === 'function') {
      return;
    }

    const eventName = ('ondeviceorientationabsolute' in window)
      ? 'deviceorientationabsolute'
      : 'deviceorientation';
    this._deviceRotationEventName = eventName;
    this._deviceRotationListener = (ev) => this.handleDeviceRotationEvent(ev);
    try {
      window.addEventListener(eventName, this._deviceRotationListener);
    } catch (_) {
      this._deviceRotationListener = null;
      this._deviceRotationEventName = null;
    }
  }

  handleDeviceRotationEvent(event) {
    // DeviceOrientationEvent reports degrees; we convert to a unit quaternion,
    // baseline it at the first valid reading, then expose the *relative* SU(2)
    // element as (QA,QB) with:
    //   QA = w + i z
    //   QB = x + i y
    const degToRad = (deg) => (Number(deg) * Math.PI) / 180;
    const alpha = degToRad(event?.alpha);
    const beta = degToRad(event?.beta);
    const gamma = degToRad(event?.gamma);
    if (!Number.isFinite(alpha) || !Number.isFinite(beta) || !Number.isFinite(gamma)) {
      return;
    }

    function quatMultiply(a, b) {
      return {
        w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
        x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
      };
    }
    function quatConj(q) {
      return { w: q.w, x: -q.x, y: -q.y, z: -q.z };
    }
    function quatNormalize(q) {
      const n = Math.hypot(q.w, q.x, q.y, q.z);
      if (!(n > 0) || !Number.isFinite(n)) {
        return { w: 1, x: 0, y: 0, z: 0 };
      }
      return { w: q.w / n, x: q.x / n, y: q.y / n, z: q.z / n };
    }

    // Convert deviceorientation Euler angles -> quaternion using the same convention as
    // Three.js DeviceOrientationControls (stable + widely tested):
    //   euler = (beta, alpha, -gamma) in 'YXZ' order
    //   q = quatFromEuler(euler) * q1 * q0
    // where:
    //   q1 = rotation around X by -PI/2 (so +Z points out of screen)
    //   q0 = rotation around Z by -screenOrientation

    function quatFromEulerYXZ(x, y, z) {
      const c1 = Math.cos(y / 2);
      const c2 = Math.cos(x / 2);
      const c3 = Math.cos(z / 2);
      const s1 = Math.sin(y / 2);
      const s2 = Math.sin(x / 2);
      const s3 = Math.sin(z / 2);
      return quatNormalize({
        w: c1 * c2 * c3 + s1 * s2 * s3,
        x: s2 * c1 * c3 + c2 * s1 * s3,
        y: c2 * s1 * c3 - s2 * c1 * s3,
        z: c2 * c1 * s3 - s2 * s1 * c3,
      });
    }

    let screenAngleDeg = 0;
    try {
      screenAngleDeg = Number(window?.screen?.orientation?.angle ?? window?.orientation ?? 0);
    } catch (_) {
      screenAngleDeg = 0;
    }
    const orient = degToRad(screenAngleDeg);

    // Note: z = -gamma (per DeviceOrientationControls).
    let q = quatFromEulerYXZ(beta, alpha, -gamma);
    const SQRT1_2 = Math.SQRT1_2;
    const q1 = { w: SQRT1_2, x: -SQRT1_2, y: 0, z: 0 };
    q = quatNormalize(quatMultiply(q, q1));
    if (Number.isFinite(orient) && orient !== 0) {
      const half = -orient / 2;
      const q0 = { w: Math.cos(half), x: 0, y: 0, z: Math.sin(half) };
      q = quatNormalize(quatMultiply(q, q0));
    }

    if (!this._deviceRotationBaselineQuat) {
      this._deviceRotationBaselineQuat = q;
    }
    const q0inv = quatConj(this._deviceRotationBaselineQuat);
    const qRel = quatNormalize(quatMultiply(q0inv, q));

    // Expose the relative rotation in the same screen-aligned basis as the trackball.
    // (Any fixed quarter-turn basis tweaks should be handled consistently in the user's
    // formula, not only for QA/QB.)
    const qMapped = qRel;

    this._deviceSU2 = {
      A: { x: qMapped.w, y: qMapped.z }, // w + i z
      B: { x: qMapped.x, y: qMapped.y }, // x + i y
    };

    // Throttle redraw to one per animation frame.
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      this.render();
      return;
    }
    if (this._deviceRotationRaf != null) {
      return;
    }
    this._deviceRotationRaf = window.requestAnimationFrame(() => {
      this._deviceRotationRaf = null;
      this.render();
    });
  }

  handlePointerMove(e) {
    const state = this.pointerStates.get(e.pointerId);
    if (!state) {
      return;
    }
    state.lastClientX = e.clientX;
    state.lastClientY = e.clientY;
    if (state.role === 'finger') {
      this.updatePointerControlledFinger(state);
    } else if (state.role === 'w') {
      this.updateWFromGesture();
    } else if (state.role === 'trackball') {
      this.updateTrackballFromGesture();
    }
  }

  handlePointerEnd(e) {
    const state = this.pointerStates.get(e.pointerId);
    if (!state) {
      return;
    }
    this.pointerStates.delete(e.pointerId);
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch (_) {
      // ignore
    }
    this.recomputePointerRoles();
  }

  mapClientPointToArcball(clientX, clientY) {
    const rect = this.canvas?.getBoundingClientRect?.();
    const w = rect?.width || this.canvas?.clientWidth || this.canvas?.width || 1;
    const h = rect?.height || this.canvas?.clientHeight || this.canvas?.height || 1;
    const cx = (rect?.left || 0) + w / 2;
    const cy = (rect?.top || 0) + h / 2;
    const radius = Math.max(1, Math.min(w, h) * 0.45);
    const dx = (Number(clientX) - cx) / radius;
    const dy = (cy - Number(clientY)) / radius;
    const d2 = dx * dx + dy * dy;
    // Shoemake arcball mapping: inside the unit disk we use the sphere, outside we
    // use a hyperbolic sheet so drags past the rim keep producing rotation (no clamp).
    const r2 = 1;
    const r2Half = r2 / 2;
    let x;
    let y;
    let z;
    if (d2 <= r2Half) {
      // On the sphere.
      x = dx;
      y = dy;
      z = Math.sqrt(r2 - d2);
    } else {
      // On the hyperbola.
      const d = Math.sqrt(d2) || 1;
      x = dx / d;
      y = dy / d;
      z = r2Half / d;
    }
    // Ensure unit length for stable quatFromArcballVectors math.
    const n = Math.hypot(x, y, z) || 1;
    return { x: x / n, y: y / n, z: z / n };
  }

  quatMultiply(a, b) {
    return {
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    };
  }

  quatNormalize(q) {
    const n = Math.hypot(q.w, q.x, q.y, q.z);
    if (!(n > 0) || !Number.isFinite(n)) {
      return { w: 1, x: 0, y: 0, z: 0 };
    }
    return { w: q.w / n, x: q.x / n, y: q.y / n, z: q.z / n };
  }

  quatFromArcballVectors(v0, v1) {
    const dot = v0.x * v1.x + v0.y * v1.y + v0.z * v1.z;
    const cx = v0.y * v1.z - v0.z * v1.y;
    const cy = v0.z * v1.x - v0.x * v1.z;
    const cz = v0.x * v1.y - v0.y * v1.x;
    // When vectors are nearly opposite, 1+dot ~ 0; fall back to 180° around a stable axis.
    if (dot < -0.999999) {
      const ax = Math.abs(v0.x) < 0.9 ? 1 : 0;
      const ay = Math.abs(v0.y) < 0.9 ? 1 : 0;
      const az = 0;
      // axis = normalize(v0 x a)
      const rx = v0.y * az - v0.z * ay;
      const ry = v0.z * ax - v0.x * az;
      const rz = v0.x * ay - v0.y * ax;
      const rn = Math.hypot(rx, ry, rz) || 1;
      return { w: 0, x: rx / rn, y: ry / rn, z: rz / rn };
    }
    return this.quatNormalize({ w: 1 + dot, x: cx, y: cy, z: cz });
  }

  updateTrackballFromGesture() {
    const gs = this.trackballGestureState;
    if (!gs || !Array.isArray(gs.pointerIds) || gs.pointerIds.length < 2) {
      return;
    }
    const s1 = this.pointerStates.get(gs.pointerIds[0]);
    const s2 = this.pointerStates.get(gs.pointerIds[1]);
    if (!s1 || !s2) {
      return;
    }
    const midX = (s1.lastClientX + s2.lastClientX) / 2;
    const midY = (s1.lastClientY + s2.lastClientY) / 2;
    const prevMidX = Number.isFinite(gs.prevMidX) ? gs.prevMidX : midX;
    const prevMidY = Number.isFinite(gs.prevMidY) ? gs.prevMidY : midY;
    const deltaX = midX - prevMidX;
    // Use a "screen-up is positive" convention.
    const deltaY = prevMidY - midY;

    // Fully-relative trackball: interpret midpoint motion as incremental yaw/pitch.
    // This avoids any finite disk radius / rim behavior and allows infinite drags
    // starting from anywhere on the screen.
    let rectW = 1;
    let rectH = 1;
    try {
      const rect = this.canvas?.getBoundingClientRect?.();
      rectW = rect?.width || this.canvas?.clientWidth || this.canvas?.width || 1;
      rectH = rect?.height || this.canvas?.clientHeight || this.canvas?.height || 1;
    } catch (_) {
      rectW = this.canvas?.clientWidth || this.canvas?.width || 1;
      rectH = this.canvas?.clientHeight || this.canvas?.height || 1;
    }
    const minDim = Math.max(1, Math.min(rectW, rectH));
    // Dragging by one full screen width corresponds to ~one full turn.
    const k = (2 * Math.PI) / minDim;

    const yaw = deltaX * k;     // left/right drag
    const pitch = -deltaY * k;  // up/down drag (flip so drag down rotates down)

    const qYaw = { w: Math.cos(yaw / 2), x: 0, y: Math.sin(yaw / 2), z: 0 };
    const qPitch = { w: Math.cos(pitch / 2), x: Math.sin(pitch / 2), y: 0, z: 0 };
    const qMove = this.quatNormalize(this.quatMultiply(qYaw, qPitch));

    const ang = Math.atan2(s2.lastClientY - s1.lastClientY, s2.lastClientX - s1.lastClientX);
    const prevTwist = Number.isFinite(gs.prevTwist) ? gs.prevTwist : gs.startTwist;
    const twist = ang - prevTwist;
    const qTwist = { w: Math.cos(twist / 2), x: 0, y: 0, z: Math.sin(twist / 2) };

    const deltaScreen = this.quatMultiply(qTwist, qMove);
    const next = this.quatNormalize(this.quatMultiply(deltaScreen, this._trackballQuat));
    this.setTrackballFromQuaternion(next);

    // Incremental reference update.
    gs.prevMidX = midX;
    gs.prevMidY = midY;
    gs.prevTwist = ang;
  }

  updatePointerControlledFinger(state) {
    const deltaX = state.lastClientX - state.startClientX;
    const deltaY = state.lastClientY - state.startClientY;
    const delta = this.pointerDeltaToComplex(deltaX, deltaY);
    if (!delta) {
      return;
    }
    const screenDistance = Math.hypot(deltaX, deltaY);
    state.maxScreenDistance = Math.max(state.maxScreenDistance || 0, screenDistance);
    if (state.axis === 'x') {
      delta.im = 0;
    } else if (state.axis === 'y') {
      delta.re = 0;
    }
    const nextRe = state.originX + delta.re;
    const nextIm = state.originY + delta.im;
    this.setFingerValue(state.slot, nextRe, nextIm);
    state.fingerLastValue = { x: nextRe, y: nextIm };
    if (!state.fingerHasSignificantMovement) {
      state.fingerHasSignificantMovement =
        screenDistance >= FINGER_SWITCH_PIXEL_THRESHOLD;
    }
  }

  recomputePointerRoles() {
    const pointerList = Array.from(this.pointerStates.values()).sort(
      (a, b) => a.sequence - b.sequence,
    );
    const hasParamSlots = this.activeFingerFamily !== 'none';
    const hasW = this.activeWSlots.length > 0;
    if (!hasW || !pointerList.length) {
      this.wGestureLatched = false;
    }
    const assignedPointerIds = new Set();

    // Trackball override: when enabled, a two-finger gesture controls RA/RB by default.
    // (Solo mode can disable this by setting trackballEnabled=false from the UI layer.)
    if (this.trackballEnabled && pointerList.length >= 2) {
      const p1 = pointerList[0];
      const p2 = pointerList[1];
      // Clear any in-progress W gesture.
      this.wGestureState = null;
      this.wGestureLatched = false;
      // Assign roles.
      pointerList.forEach((state) => {
        state.prevRole = state.role;
        state.prevSlot = state.slot;
        state.role = null;
        state.slot = null;
        state.axis = null;
      });
      p1.role = 'trackball';
      p2.role = 'trackball';
      assignedPointerIds.add(p1.pointerId);
      assignedPointerIds.add(p2.pointerId);

      // Initialize gesture state once.
      if (
        !this.trackballGestureState ||
        !Array.isArray(this.trackballGestureState.pointerIds) ||
        this.trackballGestureState.pointerIds[0] !== p1.pointerId ||
        this.trackballGestureState.pointerIds[1] !== p2.pointerId
      ) {
        const midX = (p1.lastClientX + p2.lastClientX) / 2;
        const midY = (p1.lastClientY + p2.lastClientY) / 2;
        const startTwist = Math.atan2(p2.lastClientY - p1.lastClientY, p2.lastClientX - p1.lastClientX);
        this.trackballGestureState = {
          pointerIds: [p1.pointerId, p2.pointerId],
          startTwist,
          prevMidX: midX,
          prevMidY: midY,
          prevTwist: startTwist,
        };
      }
      // Trackball owns the gesture; do not assign other roles.
      return;
    }
    this.trackballGestureState = null;

    // Reset roles before reassigning.
    pointerList.forEach((state) => {
      state.prevRole = state.role;
      state.prevSlot = state.slot;
      if (state.role === 'w') {
        this.wGestureState = null;
      }
      state.role = null;
      state.slot = null;
      state.axis = null;
    });

    // Assign W fingers according to priority rules.
    const wAssignments = [];
    if (hasW && pointerList.length) {
      const availableCount = Math.min(this.activeWSlots.length, pointerList.length);
      const minPointersToStart = hasParamSlots ? 2 : 1;
      const canStartNewGesture = pointerList.length >= minPointersToStart;
      const shouldAssignW = this.wGestureLatched || canStartNewGesture;
      if (shouldAssignW && availableCount > 0) {
        const desiredCount = hasParamSlots ? Math.min(2, availableCount) : availableCount;
        for (let i = 0; i < desiredCount; i += 1) {
          wAssignments.push(pointerList[i]);
        }
        if (!this.wGestureLatched && canStartNewGesture) {
          this.wGestureLatched = true;
        }
      }
    }
    wAssignments.forEach((state) => {
      assignedPointerIds.add(state.pointerId);
      this.assignPointerToW(state);
    });

    const remainingStates = pointerList.filter((state) => !assignedPointerIds.has(state.pointerId));

    const assignDynamicNearest = (states, slots) => {
      const availableSlots = Array.isArray(slots) ? slots.slice() : [];
      const unassigned = [];
      (states || []).forEach((state) => {
        if (!availableSlots.length) {
          unassigned.push(state);
          return;
        }
        const pointerPoint = this.clientPointToComplex(state.lastClientX, state.lastClientY);
        if (!pointerPoint) {
          const slot = availableSlots.shift();
          this.assignPointerToSlot(state, slot);
          return;
        }
        let bestSlot = availableSlots[0];
        let bestDistance = Infinity;
        availableSlots.forEach((slot) => {
          const value = this.getFingerValue(slot);
          const dx = value.x - pointerPoint.x;
          const dy = value.y - pointerPoint.y;
          const dist = dx * dx + dy * dy;
          if (dist < bestDistance) {
            bestDistance = dist;
            bestSlot = slot;
          }
        });
        const slotIndex = availableSlots.indexOf(bestSlot);
        if (slotIndex !== -1) {
          availableSlots.splice(slotIndex, 1);
        }
        this.assignPointerToSlot(state, bestSlot);
      });
      return unassigned;
    };

    if (this.activeFingerFamily === 'fixed') {
      let stateIndex = 0;
      this.activeFixedSlots.forEach((slot) => {
        if (stateIndex >= remainingStates.length) {
          return;
        }
        const state = remainingStates[stateIndex];
        this.assignPointerToSlot(state, slot);
        stateIndex += 1;
      });
    } else if (this.activeFingerFamily === 'dynamic') {
      assignDynamicNearest(remainingStates, this.activeDynamicSlots);
    } else if (this.activeFingerFamily === 'mixed') {
      const fixedSlots = this.activeFixedSlots.slice();
      const dynamicSlots = this.activeDynamicSlots.slice();
      if (!remainingStates.length) {
        // nothing
      } else if (!fixedSlots.length) {
        assignDynamicNearest(remainingStates, dynamicSlots);
      } else if (!dynamicSlots.length) {
        let stateIndex = 0;
        fixedSlots.forEach((slot) => {
          if (stateIndex >= remainingStates.length) return;
          this.assignPointerToSlot(remainingStates[stateIndex], slot);
          stateIndex += 1;
        });
      } else {
        // Decide fixed vs dynamic based on the first non-W pointer.
        const leader = remainingStates[0];
        const pointerPoint = this.clientPointToComplex(leader.lastClientX, leader.lastClientY);
        let chooseFixed = false;
        if (pointerPoint) {
          const firstFixed = fixedSlots[0];
          const fv = this.getFingerValue(firstFixed);
          const dxF = fv.x - pointerPoint.x;
          const dyF = fv.y - pointerPoint.y;
          const distF = dxF * dxF + dyF * dyF;

          let bestDynDist = Infinity;
          dynamicSlots.forEach((slot) => {
            const dv = this.getFingerValue(slot);
            const dx = dv.x - pointerPoint.x;
            const dy = dv.y - pointerPoint.y;
            const dist = dx * dx + dy * dy;
            if (dist < bestDynDist) bestDynDist = dist;
          });
          chooseFixed = distF < bestDynDist;
        }

        if (chooseFixed) {
          // Assign sequential fixed slots first, then fall back to dynamic for remaining pointers.
          let stateIndex = 0;
          for (; stateIndex < remainingStates.length && stateIndex < fixedSlots.length; stateIndex += 1) {
            this.assignPointerToSlot(remainingStates[stateIndex], fixedSlots[stateIndex]);
          }
          const leftoverStates = remainingStates.slice(stateIndex);
          if (leftoverStates.length) {
            assignDynamicNearest(leftoverStates, dynamicSlots);
          }
        } else {
          // Prefer dynamic matching first; if we use more fingers than dynamic slots,
          // fall back to fixed slots in order (F1, F2, ...).
          const leftoverStates = assignDynamicNearest(remainingStates, dynamicSlots);
          if (leftoverStates.length) {
            let stateIndex = 0;
            for (; stateIndex < leftoverStates.length && stateIndex < fixedSlots.length; stateIndex += 1) {
              this.assignPointerToSlot(leftoverStates[stateIndex], fixedSlots[stateIndex]);
            }
          }
        }
      }
    }

    const currentWStates = pointerList.filter((state) => state.role === 'w');
    this.updateWGestureAnchors(currentWStates);
  }

  assignPointerToSlot(state, slot) {
    if (!slot) {
      return;
    }
    state.role = 'finger';
    state.slot = slot;
    state.axis = this.fingerAxisConstraints.get(slot) || null;
    state.startClientX = state.lastClientX;
    state.startClientY = state.lastClientY;
    state.maxScreenDistance = 0;
    const origin = this.getFingerValue(slot);
    state.originX = origin.x;
    state.originY = origin.y;
    state.fingerInitialValue = { x: origin.x, y: origin.y };
    state.fingerLastValue = { x: origin.x, y: origin.y };
    state.fingerHasSignificantMovement = false;
  }

  assignPointerToW(state) {
    this.maybeRestoreFingerSlot(state);
    state.role = 'w';
    state.slot = null;
    state.axis = null;
  }

  maybeRestoreFingerSlot(state) {
    if (
      !state ||
      state.prevRole !== 'finger' ||
      !state.prevSlot ||
      !state.fingerInitialValue ||
      state.fingerHasSignificantMovement
    ) {
      return;
    }
    const initial = state.fingerInitialValue;
    this.setFingerValue(state.prevSlot, initial.x, initial.y);
  }

  updateWGestureAnchors(wStates) {
    if (!wStates.length) {
      this.wGestureState = null;
      this.wGestureLatched = false;
      return;
    }
    const pointerIds = new Set(wStates.map((state) => state.pointerId));
    const existingIds = this.wGestureState ? this.wGestureState.pointerIds : null;
    if (existingIds && pointerIds.size === existingIds.size) {
      let identical = true;
      pointerIds.forEach((id) => {
        if (!existingIds.has(id)) {
          identical = false;
        }
      });
      if (identical) {
        return;
      }
    }
    const pointerData = new Map();
    wStates.forEach((state) => {
      pointerData.set(state.pointerId, {
        startClientX: state.lastClientX,
        startClientY: state.lastClientY,
        startWorldPoint: this.clientPointToComplex(state.lastClientX, state.lastClientY),
      });
    });
    const initialValues = new Map();
    this.activeWSlots.forEach((slot) => {
      initialValues.set(slot, this.getFingerValue(slot));
    });
    this.wGestureState = {
      pointerIds,
      pointerData,
      initialValues,
    };
  }

  updateWFromGesture() {
    if (!this.wGestureState) {
      return;
    }
    const wStates = Array.from(this.pointerStates.values()).filter((state) => state.role === 'w');
    if (!wStates.length) {
      return;
    }
    if (wStates.length === 1) {
      const pointerState = wStates[0];
      const anchor = this.wGestureState.pointerData.get(pointerState.pointerId);
      if (!anchor || !anchor.startWorldPoint) {
        return;
      }
      const current = this.clientPointToComplex(pointerState.lastClientX, pointerState.lastClientY);
      if (!current) {
        return;
      }
      const delta = complexSub(current, anchor.startWorldPoint);
      this.applyWTranslation(delta);
      return;
    }
    const [first, second] = wStates
      .slice()
      .sort((a, b) => a.sequence - b.sequence);
    const firstAnchor = this.wGestureState.pointerData.get(first.pointerId);
    const secondAnchor = this.wGestureState.pointerData.get(second.pointerId);
    if (
      !firstAnchor ||
      !secondAnchor ||
      !firstAnchor.startWorldPoint ||
      !secondAnchor.startWorldPoint
    ) {
      return;
    }
    const currentFirst = this.clientPointToComplex(first.lastClientX, first.lastClientY);
    const currentSecond = this.clientPointToComplex(second.lastClientX, second.lastClientY);
    if (!currentFirst || !currentSecond) {
      return;
    }
    const initialSpan = complexSub(firstAnchor.startWorldPoint, secondAnchor.startWorldPoint);
    const currentSpan = complexSub(currentFirst, currentSecond);
    const scale = complexDiv(currentSpan, initialSpan);
    if (!scale) {
      const delta = complexSub(currentFirst, firstAnchor.startWorldPoint);
      this.applyWTranslation(delta);
      return;
    }
    const scaledOrigin = complexMul(scale, firstAnchor.startWorldPoint);
    const translation = complexSub(currentFirst, scaledOrigin);
    this.applyWTransform(scale, translation);
  }

  applyWTranslation(delta) {
    if (!delta) return;
    let changed = false;
    this.activeWSlots.forEach((slot) => {
      const initial = this.wGestureState?.initialValues.get(slot) || { x: 0, y: 0 };
      const next = complexAdd(initial, delta);
      this.setFingerValue(slot, next.x, next.y, { triggerRender: false });
      changed = true;
    });
    if (changed) {
      this.render();
    }
  }

  applyWTransform(scale, translation) {
    if (!scale || !translation) {
      return;
    }
    let changed = false;
    this.activeWSlots.forEach((slot) => {
      const initial = this.wGestureState?.initialValues.get(slot) || { x: 0, y: 0 };
      const scaled = complexMul(scale, initial);
      const next = complexAdd(scaled, translation);
      this.setFingerValue(slot, next.x, next.y, { triggerRender: false });
      changed = true;
    });
    if (changed) {
      this.render();
    }
  }

  clientPointToComplex(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }
    const u = (clientX - rect.left) / rect.width;
    const vFromTop = (clientY - rect.top) / rect.height;
    if (!Number.isFinite(u) || !Number.isFinite(vFromTop)) {
      return null;
    }
    const spanX = this.viewXMax - this.viewXMin;
    const spanY = this.viewYMax - this.viewYMin;
    const x = this.viewXMin + u * spanX;
    const v = 1 - vFromTop;
    const y = this.viewYMin + v * spanY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return { x, y };
  }

  pointerDeltaToComplex(dxCss, dyCss) {
    const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
    const dx = dxCss * dpr;
    const dy = dyCss * dpr;
    if (this.canvas.width === 0 || this.canvas.height === 0) {
      return null;
    }
    const unitsPerPixelX = this.viewXSpan / this.canvas.width;
    const unitsPerPixelY = this.viewYSpan / this.canvas.height;
    if (!Number.isFinite(unitsPerPixelX) || !Number.isFinite(unitsPerPixelY)) {
      return null;
    }
    return {
      re: dx * unitsPerPixelX,
      im: -dy * unitsPerPixelY,
    };
  }

  projectComplexToCanvasNormalized(x, y) {
    const spanX = this.viewXMax - this.viewXMin;
    const spanY = this.viewYMax - this.viewYMin;
    if (spanX === 0 || spanY === 0) {
      return null;
    }
    const u = (x - this.viewXMin) / spanX;
    const v = (y - this.viewYMin) / spanY;
    if (!Number.isFinite(u) || !Number.isFinite(v)) {
      return null;
    }
    return { u, v };
  }
}

function complexAdd(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

function complexSub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function complexMul(a, b) {
  return {
    x: a.x * b.x - a.y * b.y,
    y: a.x * b.y + a.y * b.x,
  };
}

function complexDiv(a, b) {
  const denom = b.x * b.x + b.y * b.y;
  if (denom < 1e-12) {
    return null;
  }
  return {
    x: (a.x * b.x + a.y * b.y) / denom,
    y: (a.y * b.x - a.x * b.y) / denom,
  };
}

