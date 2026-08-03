/* Node test runner:  node run-tests.js
 * The same suite the browser runs at tests.html. */
require('./js/rng.js');
require('./js/data.js');
require('./js/engine.js');
require('./js/tests.js');

var results = globalThis.CF.runTests();
var failed = 0;

results.forEach(function (r) {
  if (r.pass) {
    console.log('  PASS  ' + r.name + (r.note ? '   [' + r.note + ']' : ''));
  } else {
    failed++;
    console.log('  FAIL  ' + r.name);
    console.log('        ' + r.error);
  }
});

console.log('');
console.log((results.length - failed) + ' passed, ' + failed + ' failed, ' + results.length + ' total');
process.exit(failed ? 1 : 0);
