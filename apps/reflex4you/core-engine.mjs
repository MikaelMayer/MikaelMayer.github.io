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

export function Offset() {
  return { kind: "Offset" };
}

export function Offset2() {
  return { kind: "Offset2" };
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

export function Ln(value) {
  return { kind: "Ln", value };
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

export const defaultFormulaSource = 'Mul(Sub(VarZ(), Offset()), Op(VarZ(), Offset(), "add"))';

const formulaGlobals = Object.freeze({
  VarX,
  VarY,
  VarZ,
  Pow,
  Offset,
  Offset2,
  Sub,
  Mul,
  Op,
  Add,
  Div,
  LessThan,
  If,
  Const,
  Compose,
  Exp,
  Sin,
  Cos,
  Ln,
  oo,
});

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
    case "Offset":
    case "Offset2":
    case "Const":
      return;
    case "Pow":
      assignNodeIds(ast.base);
      return;
    case "Exp":
    case "Sin":
    case "Cos":
    case "Ln":
      assignNodeIds(ast.value);
      return;
    case "Sub":
    case "Mul":
    case "Op":
    case "Add":
    case "Div":
    case "LessThan":
      assignNodeIds(ast.left);
      assignNodeIds(ast.right);
      return;
    case "If":
      assignNodeIds(ast.condition);
      assignNodeIds(ast.thenBranch);
      assignNodeIds(ast.elseBranch);
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
    case "Ln":
      collectNodesPostOrder(ast.value, out);
      break;
    case "Sub":
    case "Mul":
    case "Op":
    case "Add":
    case "Div":
    case "LessThan":
      collectNodesPostOrder(ast.left, out);
      collectNodesPostOrder(ast.right, out);
      break;
    case "If":
      collectNodesPostOrder(ast.condition, out);
      collectNodesPostOrder(ast.thenBranch, out);
      collectNodesPostOrder(ast.elseBranch, out);
      break;
    case "Compose":
      collectNodesPostOrder(ast.f, out);
      collectNodesPostOrder(ast.g, out);
      break;
    case "Var":
    case "VarX":
    case "VarY":
    case "Offset":
    case "Offset2":
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

  if (ast.kind === "Offset") {
    return `
vec2 ${name}(vec2 z) {
    return u_offset;
}`.trim();
  }

  if (ast.kind === "Offset2") {
    return `
vec2 ${name}(vec2 z) {
    return u_offset2;
}`.trim();
  }

  if (ast.kind === "Const") {
    return `
vec2 ${name}(vec2 z) {
    return vec2(${ast.re}, ${ast.im});
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

  if (ast.kind === "Ln") {
    const valueName = functionName(ast.value);
    return `
vec2 ${name}(vec2 z) {
    vec2 v = ${valueName}(z);
    return c_ln(v);
}`.trim();
  }

  if (ast.kind === "If") {
    const condName = functionName(ast.condition);
    const thenName = functionName(ast.thenBranch);
    const elseName = functionName(ast.elseBranch);
    return `
vec2 ${name}(vec2 z) {
    vec2 cond = ${condName}(z);
    vec2 thenValue = ${thenName}(z);
    vec2 elseValue = ${elseName}(z);
    float selector = (cond.x != 0.0 || cond.y != 0.0) ? 1.0 : 0.0;
    return mix(elseValue, thenValue, selector);
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
  const funcs = nodes.map(generateNodeFunction).join("\n\n");
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
uniform vec2 u_offset;
uniform vec2 u_offset2;

out vec4 outColor;

const float SQ3 = 1.7320508075688772;

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

vec2 c_ln(vec2 z) {
  float magnitude = length(z);
  if (magnitude < 1e-12) {
    return vec2(-1e10, 0.0);
  }
  return vec2(log(magnitude), atan(z.y, z.x));
}

/*NODE_FUNCS*/

vec2 f(vec2 z) {
  return /*TOP_FUNC*/(z);
}

vec3 reflexColor(vec2 w) {
  float re = w.x;
  float im = w.y;
  float m  = length(w);

  if (m == 0.0) {
    return vec3(0.0);
  }

  if (m > 1.0e10 || isnan(m)) {
    return vec3(1.0);
  }

  float r = 0.0;
  float g = 0.0;
  float b = 0.0;

  float rpm  = re + m;
  float rpm2 = rpm * rpm;
  float i2   = im * im;
  float den  = rpm2 + i2;

  if (im == 0.0 && re <= 0.0) {
    g = 190.0;
    b = 190.0;
  } else {
    r = 255.0 * (1.0 - i2 / den);
    g = 255.0 * (0.25 + 0.5 * im * (SQ3 * rpm + im) / den);
    b = 255.0 * (0.25 - 0.5 * im * (SQ3 * rpm - im) / den);
  }

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
  const { funcs, topName } = buildNodeFunctionsAndTop(ast);
  return fragmentTemplate
    .replace("/*NODE_FUNCS*/", funcs)
    .replace("/*TOP_FUNC*/", topName);
}

// =========================
// Renderer core
// =========================

export class ReflexCore {
  constructor(canvas, initialAST = createDefaultFormulaAST()) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2');
    if (!this.gl) {
      throw new Error('WebGL2 not supported in this browser');
    }

    this.program = null;
    this.vao = null;
    this.uMinLoc = null;
    this.uMaxLoc = null;
    this.uResolutionLoc = null;
    this.uOffsetLoc = null;
    this.uOffset2Loc = null;

    this.baseHalfSpan = 4.0;
    this.viewXSpan = 8.0;
    this.viewYSpan = 8.0;
    this.viewXMin = -4.0;
    this.viewXMax = 4.0;
    this.viewYMin = -4.0;
    this.viewYMax = 4.0;

    this.offset = { x: 0.0, y: 0.0 };
    this.offset2 = { x: 0.0, y: 0.0 };
    this.offsetChangeListeners = [];
    this.offset2ChangeListeners = [];
    this.pointerAssignments = new Map();

    this.formulaAST = initialAST;

    this.rebuildProgram();
    this.render();

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.render());
    }
  }

  setFormulaAST(ast) {
    this.formulaAST = ast;
    this.rebuildProgram();
    this.render();
  }

  getFormulaAST() {
    return this.formulaAST;
  }

  getOffset() {
    return { x: this.offset.x, y: this.offset.y };
  }

  getOffset2() {
    return { x: this.offset2.x, y: this.offset2.y };
  }

  onOffsetChange(listener) {
    if (typeof listener !== 'function') {
      return;
    }
    this.offsetChangeListeners.push(listener);
    try {
      listener(this.getOffset());
    } catch (err) {
      console.error('ReflexCore offset listener threw', err);
    }
  }

  onOffset2Change(listener) {
    if (typeof listener !== 'function') {
      return;
    }
    this.offset2ChangeListeners.push(listener);
    try {
      listener(this.getOffset2());
    } catch (err) {
      console.error('ReflexCore offset2 listener threw', err);
    }
  }

  notifyOffsetChange() {
    if (!this.offsetChangeListeners.length) {
      return;
    }
    const snapshot = this.getOffset();
    this.offsetChangeListeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('ReflexCore offset listener threw', err);
      }
    });
  }

  notifyOffset2Change() {
    if (!this.offset2ChangeListeners.length) {
      return;
    }
    const snapshot = this.getOffset2();
    this.offset2ChangeListeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('ReflexCore offset2 listener threw', err);
      }
    });
  }

  setOffset(x, y, { triggerRender = true } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    if (x === this.offset.x && y === this.offset.y) {
      return;
    }
    this.offset.x = x;
    this.offset.y = y;
    if (triggerRender) {
      this.render();
    }
    this.notifyOffsetChange();
  }

  setOffset2(x, y, { triggerRender = true } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    if (x === this.offset2.x && y === this.offset2.y) {
      return;
    }
    this.offset2.x = x;
    this.offset2.y = y;
    if (triggerRender) {
      this.render();
    }
    this.notifyOffset2Change();
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
    const fragmentSource = buildFragmentSourceFromAST(this.formulaAST);
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
    this.uOffsetLoc = this.gl.getUniformLocation(this.program, 'u_offset');
    this.uOffset2Loc = this.gl.getUniformLocation(this.program, 'u_offset2');
  }

  resizeCanvasToDisplaySize() {
    const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
    const displayWidth = Math.floor(this.canvas.clientWidth * dpr);
    const displayHeight = Math.floor(this.canvas.clientHeight * dpr);

    if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
      this.canvas.width = displayWidth;
      this.canvas.height = displayHeight;
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
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

  render() {
    if (!this.program) return;
    this.resizeCanvasToDisplaySize();
    this.gl.uniform2f(this.uResolutionLoc, this.canvas.width, this.canvas.height);
    this.updateView();
    if (this.uOffsetLoc) {
      this.gl.uniform2f(this.uOffsetLoc, this.offset.x, this.offset.y);
    }
    if (this.uOffset2Loc) {
      this.gl.uniform2f(this.uOffset2Loc, this.offset2.x, this.offset2.y);
    }

    this.gl.clearColor(0, 0, 0, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  handlePointerDown(e) {
    const target = this.pickPointerTarget();
    if (!target) {
      return;
    }
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch (_) {
      // ignore
    }
    const origin = target === 'F1' ? this.getOffset() : this.getOffset2();
    this.pointerAssignments.set(e.pointerId, {
      pointerId: e.pointerId,
      target,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: origin.x,
      originY: origin.y,
    });
  }

  handlePointerMove(e) {
    const state = this.pointerAssignments.get(e.pointerId);
    if (!state) {
      return;
    }
    const delta = this.pointerDeltaToComplex(e.clientX - state.startClientX, e.clientY - state.startClientY);
    if (!delta) {
      return;
    }
    const nextRe = state.originX + delta.re;
    const nextIm = state.originY + delta.im;
    if (state.target === 'F1') {
      this.setOffset(nextRe, nextIm);
    } else if (state.target === 'F2') {
      this.setOffset2(nextRe, nextIm);
    }
  }

  handlePointerEnd(e) {
    const state = this.pointerAssignments.get(e.pointerId);
    if (!state) {
      return;
    }
    this.pointerAssignments.delete(e.pointerId);
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch (_) {
      // ignore
    }
  }

  pickPointerTarget() {
    const hasF1Pointer = Array.from(this.pointerAssignments.values()).some((entry) => entry.target === 'F1');
    const hasF2Pointer = Array.from(this.pointerAssignments.values()).some((entry) => entry.target === 'F2');
    if (!hasF1Pointer) {
      return 'F1';
    }
    if (!hasF2Pointer) {
      return 'F2';
    }
    return null;
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
