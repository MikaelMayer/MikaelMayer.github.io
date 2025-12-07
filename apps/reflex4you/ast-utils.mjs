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
    const children = getChildEntries(node);
    for (let i = children.length - 1; i >= 0; i -= 1) {
      const [childKey, childNode] = children[i];
      if (!childNode) continue;
      stack.push({ node: childNode, parent: node, key: childKey });
    }
  }
}

function getChildEntries(node) {
  switch (node.kind) {
    case 'Pow':
      return [['base', node.base]];
    case 'Exp':
    case 'Sin':
    case 'Cos':
    case 'Tan':
    case 'Atan':
    case 'Abs':
    case 'Floor':
    case 'Conjugate':
      return [['value', node.value]];
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
    case 'If':
      return [
        ['condition', node.condition],
        ['thenBranch', node.thenBranch],
        ['elseBranch', node.elseBranch],
      ];
    case 'SetBinding':
      return [
        ['value', node.value],
        ['body', node.body],
      ];
    case 'LetBinding':
      return [
        ['value', node.value],
        ['body', node.body],
      ];
    case 'SetRef':
    case 'Identifier':
    case 'PlaceholderVar':
    case 'Const':
    case 'Var':
    case 'VarX':
    case 'VarY':
    case 'FingerOffset':
      return [];
    default:
      return [];
  }
}
