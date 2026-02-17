export const REPEAT_COUNT_TOLERANCE = 1e-9;

export function evaluateConstantNode(node, context, scope = {}, localBindings = []) {
  if (!node || typeof node !== 'object') {
    return null;
  }
  switch (node.kind) {
    case 'Const':
      return { re: node.re, im: node.im };
    case 'FingerOffset':
      return getFingerValueFromContext(node.slot, context);
    case 'DeviceRotation':
    case 'TrackballRotation':
      // Rotation values are runtime-provided and are not constant-folded.
      return null;
    case 'Var':
      return scope.z ? { re: scope.z.re, im: scope.z.im } : null;
    case 'VarX':
      return scope.z ? { re: scope.z.re, im: 0 } : null;
    case 'VarY':
      return scope.z ? { re: scope.z.im, im: 0 } : null;
    case 'Add': {
      const left = evaluateConstantNode(node.left, context, scope, localBindings);
      if (!left) {
        return null;
      }
      const right = evaluateConstantNode(node.right, context, scope, localBindings);
      if (!right) {
        return null;
      }
      return complexAdd(left, right);
    }
    case 'Sub': {
      const left = evaluateConstantNode(node.left, context, scope, localBindings);
      if (!left) {
        return null;
      }
      const right = evaluateConstantNode(node.right, context, scope, localBindings);
      if (!right) {
        return null;
      }
      return complexSub(left, right);
    }
    case 'Mul': {
      const left = evaluateConstantNode(node.left, context, scope, localBindings);
      if (!left) {
        return null;
      }
      const right = evaluateConstantNode(node.right, context, scope, localBindings);
      if (!right) {
        return null;
      }
      return complexMul(left, right);
    }
    case 'Div': {
      const left = evaluateConstantNode(node.left, context, scope, localBindings);
      if (!left) {
        return null;
      }
      const right = evaluateConstantNode(node.right, context, scope, localBindings);
      if (!right) {
        return null;
      }
      return complexDiv(left, right);
    }
    case 'Pow': {
      const base = evaluateConstantNode(node.base, context, scope, localBindings);
      if (!base) {
        return null;
      }
      return complexPowInt(base, node.exponent);
    }
    case 'Exp': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      return value ? complexExp(value) : null;
    }
    case 'Sin': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      return value ? complexSin(value) : null;
    }
    case 'Cos': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      return value ? complexCos(value) : null;
    }
    case 'Tan': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      return value ? complexTan(value) : null;
    }
    case 'Atan': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      return value ? complexAtan(value) : null;
    }
    case 'Asin': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      return value ? complexAsin(value) : null;
    }
    case 'Acos': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      return value ? complexAcos(value) : null;
    }
    case 'Ln': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      if (!value) {
        return null;
      }
      let center = 0;
      if (node.branch) {
        const branchValue = evaluateConstantNode(node.branch, context, scope, localBindings);
        if (!branchValue) {
          return null;
        }
        center = branchValue.re;
      }
      return complexLn(value, center);
    }
    case 'Arg': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      if (!value) {
        return null;
      }
      let center = 0;
      if (node.branch) {
        const branchValue = evaluateConstantNode(node.branch, context, scope, localBindings);
        if (!branchValue) {
          return null;
        }
        center = branchValue.re;
      }
      const lnValue = complexLn(value, center);
      if (!lnValue) {
        return null;
      }
      return { re: lnValue.im, im: 0 };
    }
    case 'Abs': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      if (!value) {
        return null;
      }
      return { re: complexAbs(value), im: 0 };
    }
    case 'Abs2': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      if (!value) {
        return null;
      }
      return { re: complexAbs2(value), im: 0 };
    }
    case 'Floor': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      return value ? complexFloor(value) : null;
    }
    case 'Conjugate': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      return value ? complexConjugate(value) : null;
    }
    case 'IsNaN': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      if (!value) {
        return null;
      }
      const m = Math.hypot(value.re, value.im);
      const isError = !(m <= 1e10);
      return { re: isError ? 1 : 0, im: 0 };
    }
    case 'Compose': {
      const inner = evaluateConstantNode(node.g, context, scope, localBindings);
      if (!inner) {
        return null;
      }
      return evaluateConstantNode(node.f, context, { z: inner }, localBindings);
    }
    case 'ComposeMultiple': {
      const count = typeof node.resolvedCount === 'number' ? node.resolvedCount : null;
      if (count === null) {
        return null;
      }
      if (count === 0) {
        return scope.z ? { re: scope.z.re, im: scope.z.im } : null;
      }
      let current = scope.z ? { re: scope.z.re, im: scope.z.im } : null;
      if (!current) {
        return null;
      }
      for (let i = 0; i < count; i += 1) {
        const next = evaluateConstantNode(node.base, context, { z: current }, localBindings);
        if (!next) {
          return null;
        }
        current = next;
      }
      return current;
    }
    case 'LessThan':
    case 'GreaterThan':
    case 'LessThanOrEqual':
    case 'GreaterThanOrEqual':
    case 'Equal': {
      const left = evaluateConstantNode(node.left, context, scope, localBindings);
      if (!left) {
        return null;
      }
      const right = evaluateConstantNode(node.right, context, scope, localBindings);
      if (!right) {
        return null;
      }
      return { re: evaluateComparison(node.kind, left, right), im: 0 };
    }
    case 'LogicalAnd':
    case 'LogicalOr': {
      const left = evaluateConstantNode(node.left, context, scope, localBindings);
      if (!left) {
        return null;
      }
      const right = evaluateConstantNode(node.right, context, scope, localBindings);
      if (!right) {
        return null;
      }
      const leftTruthy = isTruthyComplex(left);
      const rightTruthy = isTruthyComplex(right);
      const result =
        node.kind === 'LogicalAnd'
          ? leftTruthy && rightTruthy
          : leftTruthy || rightTruthy;
      return { re: result ? 1 : 0, im: 0 };
    }
    case 'If': {
      const condition = evaluateConstantNode(node.condition, context, scope, localBindings);
      if (!condition) {
        return null;
      }
      const branch = isTruthyComplex(condition) ? node.thenBranch : node.elseBranch;
      return evaluateConstantNode(branch, context, scope, localBindings);
    }
    case 'IfNaN': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      if (!value) {
        return null;
      }
      const m = Math.hypot(value.re, value.im);
      const isError = !(m <= 1e10);
      if (isError) {
        return evaluateConstantNode(node.fallback, context, scope, localBindings);
      }
      return value;
    }
    case 'SetBinding': {
      const value = evaluateConstantNode(node.value, context, scope, localBindings);
      if (!value) {
        return null;
      }
      localBindings.push({ binding: node, value });
      const result = evaluateConstantNode(node.body, context, scope, localBindings);
      localBindings.pop();
      return result;
    }
    case 'SetRef': {
      for (let i = localBindings.length - 1; i >= 0; i -= 1) {
        if (localBindings[i].binding === node.binding) {
          return localBindings[i].value;
        }
      }
      const bindingStack = context?.bindingStack;
      if (bindingStack) {
        for (let i = bindingStack.length - 1; i >= 0; i -= 1) {
          const entry = bindingStack[i];
          if (entry.binding === node.binding) {
            return entry.value || null;
          }
        }
      }
      return null;
    }
    default:
      return null;
  }
}

function isTruthyComplex(value) {
  return Math.abs(value.re) > REPEAT_COUNT_TOLERANCE || Math.abs(value.im) > REPEAT_COUNT_TOLERANCE;
}

function evaluateComparison(kind, left, right) {
  switch (kind) {
    case 'LessThan':
      return left.re < right.re ? 1 : 0;
    case 'GreaterThan':
      return left.re > right.re ? 1 : 0;
    case 'LessThanOrEqual':
      return left.re <= right.re ? 1 : 0;
    case 'GreaterThanOrEqual':
      return left.re >= right.re ? 1 : 0;
    case 'Equal':
      return left.re === right.re ? 1 : 0;
    default:
      return 0;
  }
}

function getFingerValueFromContext(label, context) {
  if (!context || context.allowFingerConstants === false) {
    return null;
  }
  const fingerValues = context.fingerValues;
  const value = fingerValues?.get(label);
  if (value) {
    return { re: value.re, im: value.im };
  }
  // Default missing finger values to 0 (with W1 defaulting to 1+0i),
  // matching the previous fixed-token behavior.
  if (label === 'W1') {
    return { re: 1, im: 0 };
  }
  return { re: 0, im: 0 };
}

function complexAdd(a, b) {
  return { re: a.re + b.re, im: a.im + b.im };
}

function complexSub(a, b) {
  return { re: a.re - b.re, im: a.im - b.im };
}

function complexMul(a, b) {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

function complexDiv(a, b) {
  const denom = b.re * b.re + b.im * b.im;
  if (denom < 1e-12) {
    return null;
  }
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
  };
}

function complexPowInt(base, exponent) {
  if (!Number.isInteger(exponent)) {
    return null;
  }
  if (exponent === 0) {
    return { re: 1, im: 0 };
  }
  let result = { re: 1, im: 0 };
  let power = exponent;
  let current = { re: base.re, im: base.im };
  if (power < 0) {
    const inv = complexDiv({ re: 1, im: 0 }, current);
    if (!inv) {
      return null;
    }
    current = inv;
    power = -power;
  }
  while (power > 0) {
    if (power % 2 === 1) {
      result = complexMul(result, current);
    }
    power = Math.floor(power / 2);
    if (power > 0) {
      current = complexMul(current, current);
    }
  }
  return result;
}

function complexAbs2(value) {
  return value.re * value.re + value.im * value.im;
}

function complexAbs(value) {
  return Math.hypot(value.re, value.im);
}

function complexFloor(value) {
  return { re: Math.floor(value.re), im: Math.floor(value.im) };
}

function complexConjugate(value) {
  return { re: value.re, im: -value.im };
}

function complexExp(value) {
  const expReal = Math.exp(value.re);
  return {
    re: expReal * Math.cos(value.im),
    im: expReal * Math.sin(value.im),
  };
}

function complexSin(value) {
  const sinX = Math.sin(value.re);
  const cosX = Math.cos(value.re);
  const sinhY = Math.sinh(value.im);
  const coshY = Math.cosh(value.im);
  return {
    re: sinX * coshY,
    im: cosX * sinhY,
  };
}

function complexCos(value) {
  const sinX = Math.sin(value.re);
  const cosX = Math.cos(value.re);
  const sinhY = Math.sinh(value.im);
  const coshY = Math.cosh(value.im);
  return {
    re: cosX * coshY,
    im: -sinX * sinhY,
  };
}

function complexTan(value) {
  const sin = complexSin(value);
  const cos = complexCos(value);
  return complexDiv(sin, cos);
}

function complexSqrt(value) {
  if (!value) {
    return null;
  }
  const magnitude = complexAbs(value);
  if (!Number.isFinite(magnitude)) {
    return null;
  }
  if (magnitude === 0) {
    return { re: 0, im: 0 };
  }
  const realPart = Math.sqrt(0.5 * (magnitude + value.re));
  const imagPartMagnitude = Math.sqrt(Math.max(0, 0.5 * (magnitude - value.re)));
  const imagPart = value.im >= 0 ? imagPartMagnitude : -imagPartMagnitude;
  return { re: realPart, im: imagPart };
}

function complexAsin(value) {
  if (!value) {
    return null;
  }
  const iz = { re: -value.im, im: value.re };
  const one = { re: 1, im: 0 };
  const zSquared = complexMul(value, value);
  const underSqrt = complexSub(one, zSquared);
  const sqrtTerm = complexSqrt(underSqrt);
  if (!sqrtTerm) {
    return null;
  }
  const inside = complexAdd(iz, sqrtTerm);
  const lnValue = complexLn(inside);
  if (!lnValue) {
    return null;
  }
  return { re: lnValue.im, im: -lnValue.re };
}

function complexAcos(value) {
  const asinValue = complexAsin(value);
  if (!asinValue) {
    return null;
  }
  return { re: Math.PI / 2 - asinValue.re, im: -asinValue.im };
}

function complexLn(value, branchCenter = 0) {
  const magnitude = complexAbs(value);
  if (magnitude < 1e-12) {
    return null;
  }
  const angle = Math.atan2(value.im, value.re);
  const adjusted = wrapAngleToRange(angle, branchCenter);
  return {
    re: Math.log(magnitude),
    im: adjusted,
  };
}

function complexAtan(value) {
  const iz = { re: -value.im, im: value.re };
  const one = { re: 1, im: 0 };
  const term1 = complexLn(complexSub(one, iz));
  const term2 = complexLn(complexAdd(one, iz));
  if (!term1 || !term2) {
    return null;
  }
  const diff = complexSub(term1, term2);
  return complexMul({ re: 0, im: 0.5 }, diff);
}

function wrapAngleToRange(angle, center) {
  const shifted = angle - center;
  const normalized = shifted - Math.PI * 2 * Math.floor((shifted + Math.PI) / (Math.PI * 2));
  return normalized + center;
}
