// Core engine for Reflex4You: AST helpers, GLSL generation, and renderer

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

const W_FINGER_LABELS = Object.freeze(["W1", "W2"]);

function parseFingerLabel(label) {
  if (!label || typeof label !== "string") {
    return null;
  }
  if (label === "W1") {
    return { family: "w", index: 0 };
  }
  if (label === "W2") {
    return { family: "w", index: 1 };
  }
  const match = /^([FD])([1-9]\d*)$/.exec(label);
  if (!match) {
    return null;
  }
  const prefix = match[1];
  const rawIndex = Number(match[2]);
  if (!Number.isInteger(rawIndex) || rawIndex < 1) {
    return null;
  }
  const index = rawIndex - 1;
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

export function Asin(value) {
  return { kind: "Asin", value };
}

export function Acos(value) {
  return { kind: "Acos", value };
}

export function Ln(value, branch = null) {
  return { kind: "Ln", value, branch };
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
        visit(node.value);
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
      case "Compose":
        visit(node.f);
        visit(node.g);
        return;
      case "SetBinding":
        visit(node.value);
        visit(node.body);
        return;
      case "SetRef":
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
  let root = ast;
  function visit(node, parent, key) {
    if (!node || typeof node !== "object") {
      return;
    }
    if (node.kind === "ComposeMultiple") {
      if (node.base) {
        visit(node.base, node, "base");
      }
      const count = typeof node.resolvedCount === "number" ? node.resolvedCount : null;
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
        visit(node.value, node, "value");
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
  Const,
  Compose,
  Exp,
  Sin,
  Cos,
  Tan,
  Atan,
  Asin,
  Acos,
  Ln,
  Abs,
  Abs2,
  Floor,
  Conjugate,
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
    case "Abs":
    case "Abs2":
    case "Floor":
    case "Conjugate":
      assignNodeIds(ast.value);
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
    case "SetBinding":
      assignNodeIds(ast.value);
      assignNodeIds(ast.body);
      return;
    case "SetRef":
      return;
    case "Compose":
      assignNodeIds(ast.f);
      assignNodeIds(ast.g);
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
    case "Abs":
    case "Abs2":
    case "Floor":
    case "Conjugate":
      collectNodesPostOrder(ast.value, out);
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
    case "Var":
    case "VarX":
    case "VarY":
    case "FingerOffset":
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

  if (ast.kind === "Atan") {
    const valueName = functionName(ast.value);
    return `
vec2 ${name}(vec2 z) {
    vec2 v = ${valueName}(z);
    return c_atan(v);
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

/*NODE_FUNCS*/

vec2 f(vec2 z) {
  return /*TOP_FUNC*/(z);
}

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
  const preparedAst = materializeComposeMultiples(ast);
  const uniformCounts = analyzeFingerUniformCounts(preparedAst);
  const { funcs, topName } = buildNodeFunctionsAndTop(preparedAst);
  return fragmentTemplate
    .replace("/*FIXED_OFFSETS_COUNT*/", String(uniformCounts.fixedCount))
    .replace("/*DYNAMIC_OFFSETS_COUNT*/", String(uniformCounts.dynamicCount))
    .replace("/*NODE_FUNCS*/", funcs)
    .replace("/*TOP_FUNC*/", topName);
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

    this.baseHalfSpan = 4.0;
    this.viewXSpan = 8.0;
    this.viewYSpan = 8.0;
    this.viewXMin = -4.0;
    this.viewXMax = 4.0;
    this.viewYMin = -4.0;
    this.viewYMax = 4.0;

    this.fingerValues = new Map();
    this.fingerListeners = new Map();

    this.fixedUniformCount = 1;
    this.dynamicUniformCount = 1;
    this.wUniformCount = 2;

    this.fixedOffsetsBuffer = new Float32Array(this.fixedUniformCount * 2);
    this.dynamicOffsetsBuffer = new Float32Array(this.dynamicUniformCount * 2);
    this.wOffsetsBuffer = new Float32Array(this.wUniformCount * 2);
    this.fixedOffsetsDirty = true;
    this.dynamicOffsetsDirty = true;
    this.wOffsetsDirty = true;

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
    // If we render before the browser has computed layout, canvas.clientWidth/Height can
    // temporarily report 0–1px (notably on mobile/PWA). Resizing the backing store to
    // that tiny size produces a uniform full-screen color until a later resize/re-render.
    // Track a single scheduled retry render once layout stabilizes.
    this._layoutRetryRaf = null;
    this._resizeObserver = null;
    this._resizeObserverRaf = null;
    this._visibilityListener = null;
    this._pageShowListener = null;

    this.formulaAST = initialAST;

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
    this.formulaAST = materializeComposeMultiples(ast);
    this.rebuildProgram();
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
  } = {}) {
    this.activeFixedSlots = Array.isArray(fixedSlots) ? [...fixedSlots] : [];
    this.activeDynamicSlots = Array.isArray(dynamicSlots) ? [...dynamicSlots] : [];
    this.activeWSlots = Array.isArray(wSlots) ? [...wSlots] : [];
    if (this.activeFixedSlots.length && this.activeDynamicSlots.length) {
      // Should never happen, but guard to keep internal state consistent.
      this.activeDynamicSlots = [];
    }
    this.activeFingerFamily = this.activeFixedSlots.length
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
    const uniformCounts = analyzeFingerUniformCounts(this.formulaAST);
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

    const fragmentSource = buildFragmentSourceFromAST(this.formulaAST);
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
      const label = `W${i + 1}`;
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
    this.gl.uniform2f(this.uResolutionLoc, w, h);
    this.updateView();

    this.gl.clearColor(0, 0, 0, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  handlePointerDown(e) {
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
      const availableSlots = this.activeDynamicSlots.slice();
      remainingStates.forEach((state) => {
        if (!availableSlots.length) {
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

