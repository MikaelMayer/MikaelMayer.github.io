import test from 'node:test';
import assert from 'node:assert/strict';
import { visitAst } from './ast-utils.mjs';
import { Add, VarZ, FingerOffset, Compose, VarX } from './core-engine.mjs';

function sampleAst() {
  return Add(
    Compose(VarX(), FingerOffset('D1')),
    Add(VarZ(), FingerOffset('F1')),
  );
}

test('visitAst walks nodes in pre-order and reports parent metadata', () => {
  const ast = sampleAst();
  const kinds = [];
  const parents = [];
  visitAst(ast, (node, meta) => {
    kinds.push(node.kind);
    parents.push(meta.parent ? meta.parent.kind : null);
  });
  assert.deepEqual(kinds.slice(0, 5), ['Add', 'Compose', 'VarX', 'FingerOffset', 'Add']);
  assert.equal(parents[0], null);
  assert.equal(parents[1], 'Add');
  assert.equal(parents[2], 'Compose');
  assert.equal(parents[3], 'Compose');
});

test('visitAst provides child keys', () => {
  const ast = sampleAst();
  const relationships = [];
  visitAst(ast, (_node, meta) => {
    if (!meta.parent) return;
    relationships.push(`${meta.parent.kind}.${meta.key}`);
  });
  assert.ok(relationships.includes('Add.left'));
  assert.ok(relationships.includes('Add.right'));
  assert.ok(relationships.includes('Compose.f'));
  assert.ok(relationships.includes('Compose.g'));
});
