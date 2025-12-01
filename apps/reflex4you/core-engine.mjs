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
  return { kind: "Pow", base, exponent };
}

export function Offset() {
  return { kind: "Offset" };
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

export function Const(re, im) {
  return { kind: "Const", re, im };
}

export function Compose(f, g) {
  return { kind: "Compose", f, g };
}

export const defaultFormulaSource = 'Mul(Sub(VarZ(), Offset()), Op(VarZ(), Offset(), "add"))';

const formulaGlobals = Object.freeze({
  VarX,
  VarY,
  VarZ,
  Pow,
  Offset,
  Sub,
  Mul,
  Op,
  Add,
  Div,
  Const,
  Compose,
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
    case "Const":
      return;
    case "Pow":
      assignNodeIds(ast.base);
      return;
    case "Sub":
    case "Mul":
    case "Op":
    case "Add":
    case "Div":
      assignNodeIds(ast.left);
      assignNodeIds(ast.right);
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
    case "Sub":
    case "Mul":
    case "Op":
    case "Add":
    case "Div":
      collectNodesPostOrder(ast.left, out);
      collectNodesPostOrder(ast.right, out);
      break;
    case "Compose":
      collectNodesPostOrder(ast.f, out);
      collectNodesPostOrder(ast.g, out);
      break;
    case "Var":
    case "VarX":
    case "VarY":
    case "Offset":
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
    return vec2(0.0, z.y);
}`.trim();
  }

  if (ast.kind === "Offset") {
    return `
vec2 ${name}(vec2 z) {
    return u_offset;
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
    const n = ast.exponent | 0;
    if (n < 0) {
      throw new Error("Negative exponents not supported in this demo");
    }
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
    const lines = [];
    lines.push(`vec2 ${name}(vec2 z) {`);
    lines.push(`    vec2 acc = ${baseName}(z);`);
    for (let i = 2; i <= n; i++) {
      lines.push(`    acc = c_mul(acc, ${baseName}(z));`);
    }
    lines.push(`    return acc;`);
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
    float denom = b.x * b.x + b.y * b.y;
    if (denom < 1e-12) {
        return vec2(1e10, 1e10);
    }
    float realPart = (a.x * b.x + a.y * b.y) / denom;
    float imagPart = (a.y * b.x - a.x * b.y) / denom;
    return vec2(realPart, imagPart);
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

out vec4 outColor;

const float SQ3 = 1.7320508075688772;

vec2 c_mul(vec2 a, vec2 b) {
  return vec2(
    a.x * b.x - a.y * b.y,
    a.x * b.y + a.y * b.x
  );
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

    this.baseHalfSpan = 4.0;
    this.viewXSpan = 8.0;
    this.viewYSpan = 8.0;
    this.viewXMin = -4.0;
    this.viewXMax = 4.0;
    this.viewYMin = -4.0;
    this.viewYMax = 4.0;

    this.offset = { x: 0.0, y: 0.0 };
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.startOffsetX = 0.0;
    this.startOffsetY = 0.0;

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
    this.gl.uniform2f(this.uOffsetLoc, this.offset.x, this.offset.y);

    this.gl.clearColor(0, 0, 0, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  handlePointerDown(e) {
    this.canvas.setPointerCapture(e.pointerId);
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.startOffsetX = this.offset.x;
    this.startOffsetY = this.offset.y;
  }

  handlePointerMove(e) {
    if (!this.isDragging) return;
    const dxCss = e.clientX - this.dragStartX;
    const dyCss = e.clientY - this.dragStartY;
    const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;
    const dx = dxCss * dpr;
    const dy = dyCss * dpr;
    const unitsPerPixelX = this.viewXSpan / this.canvas.width;
    const unitsPerPixelY = this.viewYSpan / this.canvas.height;
    const deltaRe = dx * unitsPerPixelX;
    const deltaIm = -dy * unitsPerPixelY;
    this.offset.x = this.startOffsetX + deltaRe;
    this.offset.y = this.startOffsetY + deltaIm;
    this.render();
  }

  handlePointerEnd(e) {
    if (!this.isDragging) return;
    this.isDragging = false;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch (_) {
      // ignore
    }
  }
}
