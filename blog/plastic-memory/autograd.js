/* A tiny reverse-mode autograd over 2-D arrays.
 *
 * Small enough to read in one sitting, which is the point: the blog post asks
 * the reader to believe the training loop, so the training loop has to be
 * something they could have written. Everything is a flat Float64Array with a
 * shape, and every op records how to push gradient backwards.
 *
 * Runs unmodified in Node and in a browser (no imports, no exports beyond a
 * global).
 */
(function (root) {
  'use strict';

  function T(rows, cols, data) {
    this.rows = rows;
    this.cols = cols;
    this.data = data || new Float64Array(rows * cols);
    this.grad = new Float64Array(rows * cols);
    this.parents = [];
    this.backward = null;      // pushes this.grad into parents' grads
    this.trainable = false;
  }

  T.prototype.size = function () { return this.rows * this.cols; };

  function tensor(rows, cols, fill) {
    var t = new T(rows, cols);
    if (typeof fill === 'function') {
      for (var i = 0; i < t.data.length; i++) t.data[i] = fill(i);
    } else if (typeof fill === 'number') {
      t.data.fill(fill);
    }
    return t;
  }

  function param(rows, cols, fill) {
    var t = tensor(rows, cols, fill);
    t.trainable = true;
    return t;
  }

  function fromArray(arr) {
    var t = new T(1, arr.length);
    for (var i = 0; i < arr.length; i++) t.data[i] = arr[i];
    return t;
  }

  /* ---- ops ---------------------------------------------------------- */

  // (n x k) @ (k x m) -> (n x m)
  function matmul(a, b) {
    if (a.cols !== b.rows) throw new Error('matmul shape ' + a.rows + 'x' + a.cols + ' @ ' + b.rows + 'x' + b.cols);
    var out = new T(a.rows, b.cols);
    var n = a.rows, k = a.cols, m = b.cols;
    for (var i = 0; i < n; i++) {
      for (var p = 0; p < k; p++) {
        var av = a.data[i * k + p];
        if (av === 0) continue;
        var boff = p * m, ooff = i * m;
        for (var j = 0; j < m; j++) out.data[ooff + j] += av * b.data[boff + j];
      }
    }
    out.parents = [a, b];
    out.backward = function () {
      for (var i = 0; i < n; i++) {
        for (var p = 0; p < k; p++) {
          var s = 0, boff = p * m, ooff = i * m;
          for (var j = 0; j < m; j++) s += out.grad[ooff + j] * b.data[boff + j];
          a.grad[i * k + p] += s;
        }
      }
      for (var p2 = 0; p2 < k; p2++) {
        for (var j2 = 0; j2 < m; j2++) {
          var s2 = 0;
          for (var i2 = 0; i2 < n; i2++) s2 += a.data[i2 * k + p2] * out.grad[i2 * m + j2];
          b.grad[p2 * m + j2] += s2;
        }
      }
    };
    return out;
  }

  // elementwise, same shape
  function mul(a, b) {
    var out = new T(a.rows, a.cols);
    for (var i = 0; i < out.data.length; i++) out.data[i] = a.data[i] * b.data[i];
    out.parents = [a, b];
    out.backward = function () {
      for (var i = 0; i < out.data.length; i++) {
        a.grad[i] += out.grad[i] * b.data[i];
        b.grad[i] += out.grad[i] * a.data[i];
      }
    };
    return out;
  }

  function add(a, b) {
    var out = new T(a.rows, a.cols);
    for (var i = 0; i < out.data.length; i++) out.data[i] = a.data[i] + b.data[i];
    out.parents = [a, b];
    out.backward = function () {
      for (var i = 0; i < out.data.length; i++) { a.grad[i] += out.grad[i]; b.grad[i] += out.grad[i]; }
    };
    return out;
  }

  function scale(a, s) {
    var out = new T(a.rows, a.cols);
    for (var i = 0; i < out.data.length; i++) out.data[i] = a.data[i] * s;
    out.parents = [a];
    out.backward = function () {
      for (var i = 0; i < out.data.length; i++) a.grad[i] += out.grad[i] * s;
    };
    return out;
  }

  function tanh(a) {
    var out = new T(a.rows, a.cols);
    for (var i = 0; i < out.data.length; i++) out.data[i] = Math.tanh(a.data[i]);
    out.parents = [a];
    out.backward = function () {
      for (var i = 0; i < out.data.length; i++) {
        var y = out.data[i];
        a.grad[i] += out.grad[i] * (1 - y * y);
      }
    };
    return out;
  }

  function sigmoid(a) {
    var out = new T(a.rows, a.cols);
    for (var i = 0; i < out.data.length; i++) out.data[i] = 1 / (1 + Math.exp(-a.data[i]));
    out.parents = [a];
    out.backward = function () {
      for (var i = 0; i < out.data.length; i++) {
        var y = out.data[i];
        a.grad[i] += out.grad[i] * y * (1 - y);
      }
    };
    return out;
  }

  /* Cross-entropy over a 1 x C row of logits. Returns a 1x1 tensor holding the
   * loss, and stashes the probabilities for inspection. */
  function softmaxCE(logits, targetIndex) {
    var C = logits.cols, max = -Infinity, i;
    for (i = 0; i < C; i++) if (logits.data[i] > max) max = logits.data[i];
    var probs = new Float64Array(C), sum = 0;
    for (i = 0; i < C; i++) { probs[i] = Math.exp(logits.data[i] - max); sum += probs[i]; }
    for (i = 0; i < C; i++) probs[i] /= sum;
    var out = new T(1, 1);
    out.data[0] = -Math.log(Math.max(probs[targetIndex], 1e-12));
    out.probs = probs;
    out.parents = [logits];
    out.backward = function () {
      var g = out.grad[0];
      for (var j = 0; j < C; j++) {
        logits.grad[j] += g * (probs[j] - (j === targetIndex ? 1 : 0));
      }
    };
    return out;
  }

  function addLoss(a, b) { return add(a, b); }

  /* ---- graph -------------------------------------------------------- */

  function backprop(lossTensor) {
    var order = [], seen = new Set();
    (function visit(t) {
      if (seen.has(t)) return;
      seen.add(t);
      for (var i = 0; i < t.parents.length; i++) visit(t.parents[i]);
      order.push(t);
    })(lossTensor);
    lossTensor.grad[0] = 1;
    for (var i = order.length - 1; i >= 0; i--) {
      if (order[i].backward) order[i].backward();
    }
  }

  function zeroGrads(params) {
    for (var i = 0; i < params.length; i++) params[i].grad.fill(0);
  }

  /* Adam, because plain SGD on a recurrence with a decay spectrum needs a
   * learning rate per channel and this is one fewer thing to tune. */
  function Adam(params, lr, b1, b2, eps) {
    this.params = params;
    this.lr = lr === undefined ? 0.02 : lr;
    this.b1 = b1 === undefined ? 0.9 : b1;
    this.b2 = b2 === undefined ? 0.999 : b2;
    this.eps = eps === undefined ? 1e-8 : eps;
    this.t = 0;
    this.m = params.map(function (p) { return new Float64Array(p.size()); });
    this.v = params.map(function (p) { return new Float64Array(p.size()); });
  }

  Adam.prototype.step = function (clip) {
    this.t++;
    var bc1 = 1 - Math.pow(this.b1, this.t);
    var bc2 = 1 - Math.pow(this.b2, this.t);
    if (clip) {
      var norm = 0;
      for (var a = 0; a < this.params.length; a++) {
        var gg = this.params[a].grad;
        for (var b = 0; b < gg.length; b++) norm += gg[b] * gg[b];
      }
      norm = Math.sqrt(norm);
      if (norm > clip) {
        var sc = clip / norm;
        for (var a2 = 0; a2 < this.params.length; a2++) {
          var g2 = this.params[a2].grad;
          for (var b2i = 0; b2i < g2.length; b2i++) g2[b2i] *= sc;
        }
      }
    }
    for (var i = 0; i < this.params.length; i++) {
      var p = this.params[i], m = this.m[i], v = this.v[i];
      for (var j = 0; j < p.data.length; j++) {
        var g = p.grad[j];
        m[j] = this.b1 * m[j] + (1 - this.b1) * g;
        v[j] = this.b2 * v[j] + (1 - this.b2) * g * g;
        p.data[j] -= this.lr * (m[j] / bc1) / (Math.sqrt(v[j] / bc2) + this.eps);
      }
    }
  };

  /* ---- seeded rng --------------------------------------------------- */

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussian(rand) {
    var u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  root.AG = {
    T: T, tensor: tensor, param: param, fromArray: fromArray,
    matmul: matmul, mul: mul, add: add, scale: scale,
    tanh: tanh, sigmoid: sigmoid, softmaxCE: softmaxCE, addLoss: addLoss,
    backprop: backprop, zeroGrads: zeroGrads, Adam: Adam,
    mulberry32: mulberry32, gaussian: gaussian
  };
})(typeof window !== 'undefined' ? window : globalThis);
