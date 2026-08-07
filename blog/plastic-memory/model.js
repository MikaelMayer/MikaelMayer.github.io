/* The plastic low-rank memory layer, the task that tests it, and the variants
 * we compare. Runs in Node and in the browser.
 *
 * The whole model:
 *
 *   W_t   = W_0 + U diag(m_t) V^T          (W_0 irrelevant here: it cannot know
 *                                           keys that are sampled per episode)
 *   a_t   = k_t V                          project the key into the basis
 *   c_t   = v_t U^T                        project the value into the basis
 *   d_t   = a_t * c_t                      the write signal: local, cheap
 *   m_t+1 = lambda * m_t + eta * d_t       one decay rate per channel
 *   read  = (m_t * a_q) U                  logits over values for query key q
 *
 * d_t is exactly diag(U^T v k^T V): the rank-1 Hebbian outer product v k^T,
 * squashed onto the frozen basis. Nothing here needs the history of the
 * episode, which is the point.
 */
(function (root) {
  'use strict';
  var AG = root.AG;

  /* ---- timescale spectra -------------------------------------------- */

  /* Every variant gets the same number of channels and the same everything
   * else. Only the vector of timescales differs. */
  var SPECTRA = {
    none: function (r) {                    // lambda = 1, never forgets
      return new Array(r).fill(Infinity);
    },
    one: function (r, opt) {                // a single rate for all channels
      var tau = (opt && opt.tau) || 20;
      return new Array(r).fill(tau);
    },
    three: function (r, opt) {              // three discrete tiers
      var lo = (opt && opt.min) || 2, hi = (opt && opt.max) || 200;
      var mid = Math.sqrt(lo * hi);
      var taus = [];
      for (var j = 0; j < r; j++) taus.push([lo, mid, hi][j % 3]);
      return taus;
    },
    spectrum: function (r, opt) {           // log-spaced continuum
      var lo = (opt && opt.min) || 2, hi = (opt && opt.max) || 200;
      var taus = [];
      for (var j = 0; j < r; j++) {
        var f = r === 1 ? 0 : j / (r - 1);
        taus.push(lo * Math.pow(hi / lo, f));
      }
      return taus;
    },
    shuffled: function (r, opt) {           // same multiset, scrambled order
      var taus = SPECTRA.spectrum(r, opt);
      var rand = AG.mulberry32((opt && opt.seed) || 7);
      for (var i = taus.length - 1; i > 0; i--) {
        var j = Math.floor(rand() * (i + 1));
        var t = taus[i]; taus[i] = taus[j]; taus[j] = t;
      }
      return taus;
    }
  };

  function lambdasFrom(taus) {
    return taus.map(function (t) { return t === Infinity ? 1 : Math.exp(-1 / t); });
  }

  /* ---- the model ----------------------------------------------------- */

  function PlasticMemory(cfg) {
    this.cfg = cfg;
    var r = cfg.r, dk = cfg.dk, dv = cfg.dv;
    var rand = AG.mulberry32(cfg.seed || 1);

    // V: dk x r  (keys into the basis).  U: r x dv  (basis into values).
    this.V = AG.param(dk, r, function () { return AG.gaussian(rand) / Math.sqrt(dk); });
    this.U = AG.param(r, dv, function () { return AG.gaussian(rand) / Math.sqrt(r); });

    // one write gain per channel, learned in log space so it stays positive
    this.logEta = AG.param(1, r, function () { return Math.log(cfg.eta0 || 1.0); });

    this.taus = SPECTRA[cfg.spectrum](r, cfg);
    this.learnTau = !!cfg.learnTau;
    if (this.learnTau) {
      var self = this;
      this.logTau = AG.param(1, r, function (i) { return Math.log(self.taus[i]); });
    }
    this.params = [this.V, this.U, this.logEta].concat(this.learnTau ? [this.logTau] : []);
  }

  PlasticMemory.prototype.lambdas = function () {
    if (!this.learnTau) return lambdasFrom(this.taus);
    var out = [];
    for (var j = 0; j < this.cfg.r; j++) {
      var tau = Math.exp(this.logTau.data[j]);
      out.push(Math.exp(-1 / Math.max(tau, 1.01)));
    }
    return out;
  };

  PlasticMemory.prototype.currentTaus = function () {
    if (!this.learnTau) return this.taus.slice();
    var out = [];
    for (var j = 0; j < this.cfg.r; j++) out.push(Math.exp(this.logTau.data[j]));
    return out;
  };

  /* Run one episode. Returns loss tensor, accuracy stats, and traces for the
   * plots. `record` collects per-channel state over time when asked. */
  PlasticMemory.prototype.runEpisode = function (episode, opts) {
    opts = opts || {};
    var r = this.cfg.r, dv = this.cfg.dv;
    /* When timescales are learned, lambda has to stay in the graph: building
     * it with fromArray made a constant and silently cut logTau off from any
     * gradient, so "learned" and "fixed" gave bit-identical results. */
    var lam = this.learnTau ? lambdaFromLogTau(this.logTau) : AG.fromArray(this.lambdas());
    var eta = AG.tensor(1, r);
    for (var j = 0; j < r; j++) eta.data[j] = Math.exp(this.logEta.data[j]);
    // keep eta differentiable via logEta
    var etaT = expTensor(this.logEta);

    var m = AG.tensor(1, r);                       // m_0 = 0
    var loss = AG.tensor(1, 1);
    var n = 0, correct = 0;
    var perQuery = [];
    var trace = opts.trace ? [] : null;

    for (var t = 0; t < episode.length; t++) {
      var ev = episode[t];
      var kT = AG.fromArray(ev.key);
      var a = AG.matmul(kT, this.V);               // 1 x r

      if (ev.type === 'write') {
        var vOne = AG.tensor(1, dv);
        vOne.data[ev.value] = 1;
        var c = AG.matmul(vOne, transposeConst(this.U));   // 1 x r
        var delta = AG.mul(a, c);
        m = AG.add(AG.mul(m, lam), AG.mul(etaT, delta));
      } else {                                     // query
        var gated = AG.mul(m, a);
        var logits = AG.matmul(gated, this.U);     // 1 x dv
        var ce = AG.softmaxCE(logits, ev.value);
        loss = AG.add(loss, ce);
        n++;
        var best = 0;
        for (var q = 1; q < dv; q++) if (ce.probs[q] > ce.probs[best]) best = q;
        var ok = best === ev.value ? 1 : 0;
        correct += ok;
        perQuery.push({
          delay: ev.delay, reps: ev.reps, interference: ev.interference,
          correct: ok, p: ce.probs[ev.value], tag: ev.tag || null,
          pOld: ev.oldValue !== undefined ? ce.probs[ev.oldValue] : null
        });
        // decay still applies on a query step: time passes either way
        m = AG.mul(m, lam);
      }

      if (trace) {
        var row = new Float64Array(r);
        for (var z = 0; z < r; z++) row[z] = m.data[z];
        trace.push(row);
      }
    }

    return {
      loss: n > 0 ? AG.scale(loss, 1 / n) : loss,
      nQueries: n, correct: correct,
      perQuery: perQuery, trace: trace, finalM: m
    };
  };

  /* lambda_j = exp(-1/tau_j) with tau_j = exp(logTau_j).
   * d lambda / d logTau = lambda / tau. */
  function lambdaFromLogTau(logTau) {
    var out = new AG.T(logTau.rows, logTau.cols);
    var taus = new Float64Array(out.data.length);
    for (var i = 0; i < out.data.length; i++) {
      taus[i] = Math.max(1.01, Math.exp(logTau.data[i]));
      out.data[i] = Math.exp(-1 / taus[i]);
    }
    out.parents = [logTau];
    out.backward = function () {
      for (var i = 0; i < out.data.length; i++) {
        logTau.grad[i] += out.grad[i] * out.data[i] / taus[i];
      }
    };
    return out;
  }

  /* exp of a parameter tensor, differentiable */
  function expTensor(a) {
    var out = new AG.T(a.rows, a.cols);
    for (var i = 0; i < out.data.length; i++) out.data[i] = Math.exp(a.data[i]);
    out.parents = [a];
    out.backward = function () {
      for (var i = 0; i < out.data.length; i++) a.grad[i] += out.grad[i] * out.data[i];
    };
    return out;
  }

  /* U is r x dv; we need dv x r for the value projection. Transpose as a real
   * op so gradients reach U. */
  function transposeConst(a) {
    var out = new AG.T(a.cols, a.rows);
    for (var i = 0; i < a.rows; i++)
      for (var j = 0; j < a.cols; j++)
        out.data[j * a.rows + i] = a.data[i * a.cols + j];
    out.parents = [a];
    out.backward = function () {
      for (var i = 0; i < a.rows; i++)
        for (var j = 0; j < a.cols; j++)
          a.grad[i * a.cols + j] += out.grad[j * a.rows + i];
    };
    return out;
  }

  root.PT = root.PT || {};
  root.PT.SPECTRA = SPECTRA;
  root.PT.lambdasFrom = lambdasFrom;
  root.PT.PlasticMemory = PlasticMemory;
  root.PT.expTensor = expTensor;
  root.PT.transposeConst = transposeConst;
})(typeof window !== 'undefined' ? window : globalThis);
