import test from 'node:test';
import assert from 'node:assert/strict';
import { pruneFingerUrlParams } from './finger-url-prune.mjs';

test('pruneFingerUrlParams removes inactive finger values and animation intervals', () => {
  const params = new URLSearchParams([
    ['formula', 'z + D1'],
    ['D1', '1+0i'],
    ['D1A', '1+0i..2+0i'],
    ['D2', '9+9i'],
    ['D2A', '9+9i..8+8i'],
    ['t', '5s'],
    ['unrelated', 'keepme'],
  ]);

  pruneFingerUrlParams(params, {
    knownLabels: ['D1', 'D2'],
    activeLabels: ['D1'],
    animationSuffix: 'A',
    animationTimeParam: 't',
  });

  assert.equal(params.get('D1'), '1+0i');
  assert.equal(params.get('D1A'), '1+0i..2+0i');
  assert.equal(params.has('D2'), false);
  assert.equal(params.has('D2A'), false);
  assert.equal(params.get('t'), '5s');
  assert.equal(params.get('unrelated'), 'keepme');
});

test('pruneFingerUrlParams drops t when no active animations remain', () => {
  const params = new URLSearchParams([
    ['D1', '1+0i'],
    ['D1A', '1+0i..2+0i'],
    ['t', '10s'],
  ]);

  // Formula changed: D1 no longer active, nothing active now.
  pruneFingerUrlParams(params, {
    knownLabels: ['D1'],
    activeLabels: [],
  });

  assert.equal(params.has('D1'), false);
  assert.equal(params.has('D1A'), false);
  assert.equal(params.has('t'), false);
});

