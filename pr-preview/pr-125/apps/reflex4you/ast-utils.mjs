export function visitAst(root, visitor) {
  if (!root || typeof root !== 'object') {
    return;
  }
  const stack = [{ node: root, parent: null, key: null }];
  while (stack.length) {
    const frame = stack.pop();
    const { node, parent, key } = frame;
    if (!node || typeof node !== 'object') {
      continue;
    }
    visitor(node, { parent, key });
    const children = childEntries(node);
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const [childKey, childNode] = children[i];
      if (!childNode) continue;
      if (Array.isArray(childNode)) {
        for (let j = childNode.length - 1; j >= 0; j -= 1) {
          const entry = childNode[j];
          if (!entry) continue;
          stack.push({ node: entry, parent: node, key: `${childKey}[${j}]` });
        }
        continue;
      }
      stack.push({ node: childNode, parent: node, key: childKey });
    }
  }
}

// Single source of truth for the Reflex4You AST shape.
// Any logic that traverses/clones/transforms the AST should route through this.
export function childEntries(node) {
  switch (node.kind) {
    case 'Pow':
      return [['base', node.base]];
    case 'Exp':
    case 'Sin':
    case 'Cos':
    case 'Tan':
    case 'Atan':
    case 'Asin':
    case 'Acos':
    case 'Abs':
    case 'Abs2':
    case 'Floor':
    case 'Conjugate':
    case 'IsNaN':
      return [['value', node.value]];
    case 'Arg': {
      const entries = [['value', node.value]];
      if (node.branch) {
        entries.push(['branch', node.branch]);
      }
      return entries;
    }
    case 'Ln': {
      const entries = [['value', node.value]];
      if (node.branch) {
        entries.push(['branch', node.branch]);
      }
      return entries;
    }
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
      return [
        ['left', node.left],
        ['right', node.right],
      ];
    case 'Compose':
      return [
        ['f', node.f],
        ['g', node.g],
      ];
    case 'ComposeMultiple':
      return [
        ['base', node.base],
        ['countExpression', node.countExpression],
      ];
    case 'If':
      return [
        ['condition', node.condition],
        ['thenBranch', node.thenBranch],
        ['elseBranch', node.elseBranch],
      ];
    case 'IfNaN':
      return [
        ['value', node.value],
        ['fallback', node.fallback],
      ];
    case 'SetBinding':
      return [
        ['value', node.value],
        ['body', node.body],
      ];
    case 'RepeatComposePlaceholder':
      return [
        ['base', node.base],
        ['countExpression', node.countExpression],
      ];
    case 'Repeat':
      return [
        ['countExpression', node.countExpression],
        ['fromExpressions', Array.isArray(node.fromExpressions) ? node.fromExpressions : []],
      ];
    case 'LetBinding':
      return [
        ['value', node.value],
        ['body', node.body],
      ];
    case 'Call':
      return [
        ['callee', node.callee],
        ['args', Array.isArray(node.args) ? node.args : []],
      ];
    case 'SetRef':
    case 'Identifier':
    case 'ParamRef':
    case 'Const':
    case 'Var':
    case 'VarX':
    case 'VarY':
    case 'FingerOffset':
    case 'DeviceRotation':
    case 'TrackballRotation':
      return [];
    default:
      // Be strict: if a new node kind is added, we want tests to fail loudly
      // until this schema is updated (prevents missed traversal updates).
      throw new Error(`Unknown AST kind in childEntries: ${node.kind}`);
  }
}

export function cloneAst(root, { preserveBindings = true } = {}) {
  if (!root || typeof root !== 'object') {
    return root;
  }

  // `SetRef` nodes refer to a `SetBinding` by object identity. When cloning,
  // preserve that graph by remapping references to the cloned binding node.
  const setBindingMap = preserveBindings ? new Map() : null;
  // `Identifier` nodes refer to a `LetBinding` via `__letBinding` identity.
  // Preserve that graph too (critical for GPU-only transforms like
  // materializeComposeMultiples, which clones and then expects `__letBinding`
  // to point into the cloned tree).
  const letBindingMap = preserveBindings ? new Map() : null;

  function cloneNode(node) {
    if (!node || typeof node !== 'object') {
      return node;
    }

    if (preserveBindings && node.kind === 'SetBinding') {
      if (setBindingMap.has(node)) {
        return setBindingMap.get(node);
      }
      // Create the clone first (with empty children), then fill in children.
      const cloned = { ...node, value: null, body: null };
      setBindingMap.set(node, cloned);
      cloned.value = cloneNode(node.value);
      cloned.body = cloneNode(node.body);
      return cloned;
    }

    if (preserveBindings && node.kind === 'LetBinding') {
      if (letBindingMap.has(node)) {
        return letBindingMap.get(node);
      }
      // Create the clone first (with empty children), then fill in children.
      const cloned = { ...node, value: null, body: null };
      letBindingMap.set(node, cloned);
      cloned.value = cloneNode(node.value);
      cloned.body = cloneNode(node.body);
      return cloned;
    }

    const cloned = { ...node };
    const entries = childEntries(node);
    for (const [key, child] of entries) {
      if (Array.isArray(child)) {
        cloned[key] = child.map((entry) => cloneNode(entry));
      } else {
        cloned[key] = cloneNode(child);
      }
    }

    if (preserveBindings && cloned.kind === 'SetRef' && cloned.binding && setBindingMap.has(cloned.binding)) {
      cloned.binding = setBindingMap.get(cloned.binding);
    }

    if (preserveBindings && cloned.kind === 'Identifier' && cloned.__letBinding && letBindingMap.has(cloned.__letBinding)) {
      cloned.__letBinding = letBindingMap.get(cloned.__letBinding);
    }
    return cloned;
  }

  return cloneNode(root);
}
