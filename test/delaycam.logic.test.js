#!/usr/bin/env node
const assert = require('assert');
const path = require('path');

const logicPath = path.join(__dirname, '..', 'apps', 'videodelay', 'logic.js');
const logic = require(logicPath);

function testFormatTime() {
  assert.strictEqual(logic.formatTime(0), '0.0');
  assert.strictEqual(logic.formatTime(90), '0.0');
  assert.strictEqual(logic.formatTime(100), '0.1');
  assert.strictEqual(logic.formatTime(999), '0.9');
  assert.strictEqual(logic.formatTime(1000), '1.0');
}

function testComputeDelayMs() {
  const start = 1000;
  // less than 1s should clamp to 1000
  assert.strictEqual(logic.computeDelayMs(start, 1500), 1000);
  // rounds to nearest 100ms
  assert.strictEqual(logic.computeDelayMs(start, 2600), 1600);
  assert.strictEqual(logic.computeDelayMs(start, 2750), 1800);
}

function testStrategySelection_shouldPreferElementCaptureWhenAvailable_initiallyFails() {
  // We expect the strategy to be 'element-capture' if the browser can capture.
  // Naive concatenation of WebM chunks is known to produce invalid files
  // because each chunk contains its own container headers, leading to players
  // repeating the first segment or corrupt timelines — exactly the reported bug.
  const strategy = logic.chooseRecordingStrategy({ canCaptureElement: true });
  assert.strictEqual(strategy, 'element-capture');
}

function testStrategySelection_shouldFallbackToConcatWhenNotAvailable() {
  const strategy = logic.chooseRecordingStrategy({ canCaptureElement: false });
  assert.strictEqual(strategy, 'unsupported');
}

function run() {
  const tests = [
    ['formatTime', testFormatTime],
    ['computeDelayMs', testComputeDelayMs],
    ['strategySelectionPreferCapture', testStrategySelection_shouldPreferElementCaptureWhenAvailable_initiallyFails],
    ['strategySelectionFallbackConcat', testStrategySelection_shouldFallbackToConcatWhenNotAvailable],
    // Advanced: ensure computeDelayMs never decreases with increasing now
    ['computeDelayMsMonotonic', () => {
      const start = 5000;
      let last = logic.computeDelayMs(start, 5000);
      for (let t = 5000; t <= 10000; t += 37) {
        const cur = logic.computeDelayMs(start, t);
        if (cur < last) throw new Error(`non-monotonic at t=${t}: ${cur} < ${last}`);
        last = cur;
      }
    }],
  ];
  let failed = 0;
  for (const [name, fn] of tests) {
    try { fn(); console.log(`✅ ${name}`); }
    catch (e) { failed++; console.error(`❌ ${name}: ${e.message}`); }
  }
  if (failed) process.exit(1);
}

run();