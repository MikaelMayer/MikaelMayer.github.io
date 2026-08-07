/* Interactive bits for "A memory with many half-lives".
 *
 * Nothing here is special: it drives the same three files the command-line
 * study uses. Training runs in small chunks on a timer so the page stays
 * responsive while it learns.
 */
(function () {
  'use strict';
  var AG = window.AG, PT = window.PT;

  var CFG = {
    dk: 32, dv: 8, r: 48,
    streamLength: 160, nRecurring: 3, pWrite: 0.62, pRepeat: 0.35,
    eta0: 1.0, min: 2, max: 200
  };

  /* ---- shared canvas helpers ---------------------------------------- */

  function fit(canvas) {
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || canvas.width;
    var h = Math.round(w * (canvas.height / canvas.width));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.height = h + 'px';
    var g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g: g, w: w, h: h };
  }

  function axes(g, w, h, pad, xlab, ylab) {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#ccc'; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(pad, 6); g.lineTo(pad, h - pad); g.lineTo(w - 6, h - pad);
    g.stroke();
    g.fillStyle = '#888'; g.font = '11px sans-serif';
    g.fillText(xlab, w - 6 - g.measureText(xlab).width, h - pad + 14);
    g.save(); g.translate(11, 10); g.rotate(0); g.fillText(ylab, 0, 0); g.restore();
  }

  function line(g, pts, color, width) {
    g.strokeStyle = color; g.lineWidth = width || 2;
    g.beginPath();
    pts.forEach(function (p, i) { i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); });
    g.stroke();
  }

  /* ---- 1. how much survives ----------------------------------------- */

  var taus = PT.SPECTRA.spectrum(CFG.r, CFG);

  function survival(delay) {
    var fast = Math.pow(Math.exp(-1 / 5), delay);
    var slow = Math.pow(Math.exp(-1 / 200), delay);
    var spec = 0;
    for (var j = 0; j < taus.length; j++) spec += Math.pow(Math.exp(-1 / taus[j]), delay);
    return { fast: fast, slow: slow, spectrum: spec / taus.length };
  }

  function drawDecay() {
    var c = document.getElementById('decay-canvas');
    if (!c) return;
    var f = fit(c), g = f.g, w = f.w, h = f.h, pad = 34;
    axes(g, w, h, pad, 'delay (steps)', '');
    var maxD = 300;
    var X = function (d) { return pad + (d / maxD) * (w - pad - 10); };
    var Y = function (v) { return (h - pad) - v * (h - pad - 12); };

    [['fast', '#d94f3d'], ['slow', '#2b6cb0'], ['spectrum', '#1a7f4b']].forEach(function (pair) {
      var pts = [];
      for (var d = 0; d <= maxD; d += 2) pts.push([X(d), Y(survival(d)[pair[0]])]);
      line(g, pts, pair[1], pair[0] === 'spectrum' ? 2.5 : 1.6);
    });

    var d = +document.getElementById('decay-slider').value;
    g.strokeStyle = '#999'; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(X(d), 6); g.lineTo(X(d), h - pad); g.stroke();
    g.setLineDash([]);

    var s = survival(d);
    document.getElementById('decay-delay').textContent = d;
    document.getElementById('decay-out').innerHTML =
      'after ' + d + ' steps &nbsp; fast: ' + (s.fast * 100).toFixed(1) + '% &nbsp; ' +
      'slow: ' + (s.slow * 100).toFixed(1) + '% &nbsp; ' +
      '<b>spectrum: ' + (s.spectrum * 100).toFixed(1) + '%</b>';
  }

  var slider = document.getElementById('decay-slider');
  if (slider) {
    slider.addEventListener('input', drawDecay);
    window.addEventListener('resize', drawDecay);
    drawDecay();
  }

  /* ---- 2. live training --------------------------------------------- */

  /* The browser runs this several times slower than Node, so the in-page demo
   * uses a smaller batch and a shorter run. It still clears chance by a wide
   * margin in a few seconds. */
  var BATCH = 4;
  var TRAIN_STEPS = 200;
  var trainState = null;

  function specConfig(name) {
    if (name === 'one') return { spectrum: 'one', tau: 20 };
    if (name === 'one-slow') return { spectrum: 'one', tau: 200 };
    if (name === 'none') return { spectrum: 'none' };
    return { spectrum: 'spectrum' };
  }

  function newRun() {
    var name = document.getElementById('train-spectrum').value;
    var cfg = Object.assign({}, CFG, specConfig(name), { seed: 1 });
    return {
      cfg: cfg,
      model: new PT.PlasticMemory(cfg),
      opt: null,
      rand: AG.mulberry32(7919),
      step: 0, hist: [], running: false
    };
  }

  function drawTrain() {
    var c = document.getElementById('train-canvas');
    if (!c || !trainState) return;
    var f = fit(c), g = f.g, w = f.w, h = f.h, pad = 30;
    axes(g, w, h, pad, 'training steps', '');
    var hist = trainState.hist;
    if (!hist.length) return;
    var maxStep = Math.max(TRAIN_STEPS, hist[hist.length - 1].step);
    var X = function (s) { return pad + (s / maxStep) * (w - pad - 10); };
    var Yacc = function (a) { return (h - pad) - a * (h - pad - 12); };

    // chance line
    g.strokeStyle = '#ddd'; g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(pad, Yacc(1 / CFG.dv)); g.lineTo(w - 10, Yacc(1 / CFG.dv)); g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#aaa'; g.font = '10px sans-serif';
    g.fillText('chance', pad + 3, Yacc(1 / CFG.dv) - 3);

    /* Each point is 4 episodes, which is far too few to read as-is. Show the
     * running mean so the trend is visible, and the raw points faintly behind
     * it so the noise is not hidden. */
    line(g, hist.map(function (p) { return [X(p.step), Yacc(p.acc)]; }), '#bcd9c8', 1);
    var smooth = [], win = 6;
    for (var i = 0; i < hist.length; i++) {
      var lo = Math.max(0, i - win + 1), s = 0, c = 0;
      for (var j = lo; j <= i; j++) { s += hist[j].acc; c++; }
      smooth.push([X(hist[i].step), Yacc(s / c)]);
    }
    line(g, smooth, '#1a7f4b', 2.2);
    var maxLoss = Math.max.apply(null, hist.map(function (p) { return p.loss; }));
    line(g, hist.map(function (p) { return [X(p.step), Yacc(1 - p.loss / (maxLoss * 1.05))]; }), '#c9a227', 1.2);
    g.fillStyle = '#1a7f4b'; g.fillText('accuracy', w - 70, 14);
    g.fillStyle = '#c9a227'; g.fillText('loss (scaled)', w - 84, 26);
  }

  function chunk() {
    if (!trainState || !trainState.running) return;
    var st = trainState, N = 10;
    for (var k = 0; k < N; k++) {
      AG.zeroGrads(st.model.params);
      var correct = 0, n = 0, lossSum = 0;
      for (var b = 0; b < BATCH; b++) {
        var ep = PT.task.makeStreamEpisode(st.cfg, st.rand);
        var out = st.model.runEpisode(ep.events);
        if (!out.nQueries) continue;
        AG.backprop(out.loss);
        lossSum += out.loss.data[0]; correct += out.correct; n += out.nQueries;
      }
      st.model.params.forEach(function (p) {
        for (var i = 0; i < p.grad.length; i++) p.grad[i] /= BATCH;
      });
      if (st.step === Math.floor(TRAIN_STEPS * 0.7)) st.opt.lr = 0.006;
      st.opt.step(1.0);
      st.step++;
      if (st.step % 5 === 0) st.hist.push({ step: st.step, loss: lossSum / BATCH, acc: n ? correct / n : 0 });
    }
    var last = st.hist[st.hist.length - 1] || { acc: 0, loss: 0 };
    document.getElementById('train-out').innerHTML =
      'step ' + st.step + ' &nbsp; accuracy ' + (last.acc * 100).toFixed(1) + '%' +
      ' &nbsp; loss ' + last.loss.toFixed(3) + ' &nbsp; (chance 12.5%)';
    drawTrain();
    if (st.step >= TRAIN_STEPS) { st.running = false; document.getElementById('train-btn').textContent = 'Train more'; document.getElementById('train-btn').disabled = false; return; }
    setTimeout(chunk, 0);
  }

  var trainBtn = document.getElementById('train-btn');
  if (trainBtn) {
    trainBtn.addEventListener('click', function () {
      if (!trainState) { trainState = newRun(); trainState.opt = new AG.Adam(trainState.model.params, 0.02); }
      trainState.running = true;
      trainBtn.disabled = true;
      trainBtn.textContent = 'Training...';
      setTimeout(chunk, 0);
    });
    document.getElementById('train-reset').addEventListener('click', function () {
      trainState = null;
      document.getElementById('train-out').textContent = 'not started — chance is 12.5%';
      trainBtn.textContent = 'Train'; trainBtn.disabled = false;
      var c = document.getElementById('train-canvas');
      var f = fit(c); f.g.clearRect(0, 0, f.w, f.h);
      document.getElementById('reps-out').textContent = 'train a model first';
      var rc = document.getElementById('reps-canvas');
      var rf = fit(rc); rf.g.clearRect(0, 0, rf.w, rf.h);
    });
    document.getElementById('train-spectrum').addEventListener('change', function () {
      document.getElementById('train-reset').click();
    });
  }

  /* ---- 3. retention by repetition ----------------------------------- */

  function measureReps() {
    if (!trainState || trainState.step === 0) {
      document.getElementById('reps-out').textContent = 'train a model first';
      return;
    }
    var st = trainState;
    var rand = AG.mulberry32(4242);
    var buckets = {};
    for (var e = 0; e < 120; e++) {
      var ep = PT.task.makeStreamEpisode(st.cfg, rand);
      var out = st.model.runEpisode(ep.events);
      out.perQuery.forEach(function (q) {
        var r = Math.min(5, q.reps);
        (buckets[r] = buckets[r] || []).push(q.correct);
      });
    }
    var keys = Object.keys(buckets).map(Number).filter(function (k) { return k >= 1 && buckets[k].length >= 15; }).sort(function (a, b) { return a - b; });
    var vals = keys.map(function (k) {
      var a = buckets[k];
      return a.reduce(function (x, y) { return x + y; }, 0) / a.length;
    });

    var c = document.getElementById('reps-canvas');
    var f = fit(c), g = f.g, w = f.w, h = f.h, pad = 32;
    axes(g, w, h, pad, 'times the fact was written', '');
    var bw = (w - pad - 20) / Math.max(1, keys.length);
    keys.forEach(function (k, i) {
      var x = pad + 6 + i * bw, hgt = vals[i] * (h - pad - 14);
      g.fillStyle = '#1a7f4b';
      g.fillRect(x, (h - pad) - hgt, bw * 0.62, hgt);
      g.fillStyle = '#333'; g.font = '11px sans-serif';
      g.fillText((vals[i] * 100).toFixed(0) + '%', x, (h - pad) - hgt - 4);
      g.fillStyle = '#888';
      g.fillText(k === 5 ? '5+' : String(k), x + bw * 0.2, h - pad + 13);
    });
    g.strokeStyle = '#ddd'; g.setLineDash([4, 4]);
    var yc = (h - pad) - (1 / CFG.dv) * (h - pad - 14);
    g.beginPath(); g.moveTo(pad, yc); g.lineTo(w - 10, yc); g.stroke(); g.setLineDash([]);

    document.getElementById('reps-out').innerHTML =
      keys.map(function (k, i) { return (k === 5 ? '5+' : k) + 'x: ' + (vals[i] * 100).toFixed(0) + '%'; }).join(' &nbsp; ') +
      ' &nbsp; (no importance label anywhere in the model)';
  }

  var repsBtn = document.getElementById('reps-btn');
  if (repsBtn) repsBtn.addEventListener('click', measureReps);

  /* ---- 4. the results table ----------------------------------------- */

  var RESULTS = window.PT_RESULTS || null;

  function renderTable() {
    var el = document.getElementById('res-table');
    if (!el || !RESULTS) return;
    var bins = RESULTS.delayBins;
    var html = '<tr><th>half-lives</th><th>overall</th>' + bins.map(function (d) { return '<th>d=' + d + '</th>'; }).join('') + '</tr>';
    RESULTS.rows.forEach(function (r) {
      html += '<tr' + (r.highlight ? ' class="hi"' : '') + '><td>' + r.name + '</td>' +
        '<td><b>' + (r.overall === undefined ? '' : Math.round(r.overall * 100) + '%') + '</b></td>' +
        r.acc.map(function (a) { return '<td>' + (a === null ? '&mdash;' : Math.round(a * 100) + '%') + '</td>'; }).join('') + '</tr>';
    });
    el.innerHTML = html;
    var prov = document.getElementById("res-provenance");
    if (prov && RESULTS.provenance) prov.textContent = "Run: " + RESULTS.provenance + ".";
  }
  renderTable();
})();
