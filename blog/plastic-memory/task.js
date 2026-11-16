/* The stream the memory has to survive.
 *
 * An episode is a list of events. A write says "key k now means value v"; a
 * query says "what does k mean?" Keys are fresh random unit vectors every
 * episode, so nothing can be memorised in the static weights: whatever the
 * model knows at query time, it learned during this episode and stored in m.
 *
 * Each query is labelled with the three things we want to plot against:
 *   delay        steps since that key was last written
 *   reps         how many times it had been written by then
 *   interference how many writes to *other* keys happened in that gap
 */
(function (root) {
  'use strict';
  var AG = root.AG;

  function randomKey(rand, dk) {
    var v = new Float64Array(dk), norm = 0;
    for (var i = 0; i < dk; i++) { v[i] = AG.gaussian(rand); norm += v[i] * v[i]; }
    norm = Math.sqrt(norm);
    for (var j = 0; j < dk; j++) v[j] /= norm;
    return v;
  }

  /* A near-duplicate of a key, for the "do similar things interfere more"
   * test: same direction rotated slightly towards a random one. */
  function similarKey(rand, dk, key, similarity) {
    var other = randomKey(rand, dk);
    var v = new Float64Array(dk), norm = 0;
    for (var i = 0; i < dk; i++) {
      v[i] = similarity * key[i] + (1 - similarity) * other[i];
      norm += v[i] * v[i];
    }
    norm = Math.sqrt(norm);
    for (var j = 0; j < dk; j++) v[j] /= norm;
    return v;
  }

  /* The main generator.
   *
   * Builds a timeline of writes for a handful of items with varying repeat
   * counts, sprinkles unrelated filler writes between them, then queries every
   * item at a spread of delays. */
  function makeEpisode(cfg, rand) {
    var dk = cfg.dk, dv = cfg.dv;
    var nItems = cfg.nItems || 4;
    var maxDelay = cfg.maxDelay || 60;
    var repChoices = cfg.repChoices || [1, 1, 2, 4];

    var items = [];
    for (var i = 0; i < nItems; i++) {
      items.push({
        key: randomKey(rand, dk),
        value: Math.floor(rand() * dv),
        reps: repChoices[Math.floor(rand() * repChoices.length)],
        written: 0, lastWrite: -1
      });
    }

    var events = [];
    function filler() {
      events.push({ type: 'write', key: randomKey(rand, dk), value: Math.floor(rand() * dv), filler: true });
    }

    /* Phase 1: write everything, repeats spread out, filler in between. */
    var order = [];
    for (var a = 0; a < items.length; a++) {
      for (var b = 0; b < items[a].reps; b++) order.push(a);
    }
    for (var s = order.length - 1; s > 0; s--) {          // shuffle
      var t = Math.floor(rand() * (s + 1));
      var tmp = order[s]; order[s] = order[t]; order[t] = tmp;
    }
    for (var o = 0; o < order.length; o++) {
      var it = items[order[o]];
      events.push({ type: 'write', key: it.key, value: it.value, item: order[o] });
      var pad = Math.floor(rand() * (cfg.fillerPerWrite === undefined ? 3 : cfg.fillerPerWrite));
      for (var f = 0; f < pad; f++) filler();
    }

    /* Phase 2: a gap of filler writes, then queries at spread delays. */
    var queries = [];
    for (var qi = 0; qi < items.length; qi++) {
      queries.push({ item: qi, at: Math.floor(rand() * maxDelay) });
    }
    queries.sort(function (x, y) { return x.at - y.at; });

    var clock = 0;
    var qptr = 0;
    while (qptr < queries.length) {
      while (qptr < queries.length && queries[qptr].at <= clock) {
        var q = queries[qptr++];
        events.push({ type: 'query', item: q.item, key: items[q.item].key, value: items[q.item].value });
      }
      filler();
      clock++;
    }

    annotate(events);
    return { events: events, items: items };
  }

  /* Walk the timeline once and fill in delay / reps / interference. */
  function annotate(events) {
    var last = {}, count = {}, writesSince = {};
    var nWrites = 0;
    for (var t = 0; t < events.length; t++) {
      var e = events[t];
      if (e.type === 'write') {
        nWrites++;
        if (e.item !== undefined) {
          last[e.item] = t;
          count[e.item] = (count[e.item] || 0) + 1;
          writesSince[e.item] = nWrites;
        }
      } else {
        e.delay = t - last[e.item];
        e.reps = count[e.item] || 0;
        e.interference = nWrites - (writesSince[e.item] || 0);
      }
    }
    return events;
  }

  /* Episode where a key's value is replaced partway through, to measure how
   * fast the memory updates and how much of the old value lingers. */
  function makeOverwriteEpisode(cfg, rand) {
    var dk = cfg.dk, dv = cfg.dv;
    var key = randomKey(rand, dk);
    var vOld = Math.floor(rand() * dv);
    var vNew = (vOld + 1 + Math.floor(rand() * (dv - 1))) % dv;
    var events = [];
    var repsOld = cfg.repsOld === undefined ? 3 : cfg.repsOld;

    for (var i = 0; i < repsOld; i++) {
      events.push({ type: 'write', key: key, value: vOld, item: 0 });
      events.push({ type: 'write', key: randomKey(rand, dk), value: Math.floor(rand() * dv), filler: true });
    }
    events.push({ type: 'write', key: key, value: vNew, item: 0 });   // the switch
    var probeAt = [];
    for (var d = 0; d < (cfg.probes || 12); d++) {
      events.push({ type: 'query', item: 0, key: key, value: vNew, oldValue: vOld, tag: 'after-switch' });
      probeAt.push(events.length - 1);
      events.push({ type: 'write', key: randomKey(rand, dk), value: Math.floor(rand() * dv), filler: true });
    }
    annotate(events);
    return { events: events, key: key, vOld: vOld, vNew: vNew, probeAt: probeAt };
  }

  /* Episode with a controllable number of interfering writes at a fixed delay,
   * to separate elapsed time from number of writes. */
  function makeInterferenceEpisode(cfg, rand, nInterfering, gapLength) {
    var dk = cfg.dk, dv = cfg.dv;
    var key = randomKey(rand, dk);
    var value = Math.floor(rand() * dv);
    var events = [{ type: 'write', key: key, value: value, item: 0 }];
    /* gapLength steps pass either way; only some of them carry a write. The
     * rest are queries about an unrelated key, which cost time but write
     * nothing. */
    var decoy = randomKey(rand, dk);
    for (var i = 0; i < gapLength; i++) {
      if (i < nInterfering) {
        events.push({ type: 'write', key: randomKey(rand, dk), value: Math.floor(rand() * dv), filler: true });
      } else {
        events.push({ type: 'query', item: 99, key: decoy, value: 0, tag: 'decoy' });
      }
    }
    events.push({ type: 'query', item: 0, key: key, value: value, tag: 'target' });
    annotate(events);
    return { events: events };
  }

  /* Episode mixing a recurring rule with one-off facts, for the
   * specialisation test: the rule key repeats across the whole episode, the
   * episodic keys appear once. */
  function makeStructureEpisode(cfg, rand) {
    var dk = cfg.dk, dv = cfg.dv;
    var ruleKey = randomKey(rand, dk);
    var ruleValue = Math.floor(rand() * dv);
    var events = [];
    var nBlocks = cfg.blocks || 8;
    for (var b = 0; b < nBlocks; b++) {
      events.push({ type: 'write', key: ruleKey, value: ruleValue, item: 0, tag: 'rule' });
      var epKey = randomKey(rand, dk);
      var epVal = Math.floor(rand() * dv);
      events.push({ type: 'write', key: epKey, value: epVal, item: 100 + b, tag: 'episodic' });
      events.push({ type: 'query', item: 100 + b, key: epKey, value: epVal, tag: 'episodic' });
      events.push({ type: 'query', item: 0, key: ruleKey, value: ruleValue, tag: 'rule' });
    }
    annotate(events);
    return { events: events, ruleKey: ruleKey, ruleValue: ruleValue };
  }

  /* A stream with capacity pressure.
   *
   * The first design had four items and forty-eight channels, so the memory
   * could hold everything and the best policy was never to forget: decay could
   * only lose. That is a property of the task, not of the architecture, and it
   * makes the whole comparison meaningless.
   *
   * Here items arrive faster than rank-r can hold them. Some keys recur
   * throughout the episode; most appear once. Queries are drawn across the
   * whole history, so a good memory has to keep what recurs, keep what is
   * recent, and let go of stale one-offs. Now forgetting is a strategy rather
   * than a handicap.
   */
  function makeStreamEpisode(cfg, rand) {
    var dk = cfg.dk, dv = cfg.dv;
    var length = cfg.streamLength || 160;
    var nRecurring = cfg.nRecurring || 3;
    var pWrite = cfg.pWrite === undefined ? 0.62 : cfg.pWrite;
    var pRepeat = cfg.pRepeat === undefined ? 0.35 : cfg.pRepeat;

    var recurring = [];
    for (var i = 0; i < nRecurring; i++) {
      recurring.push({ id: i, key: randomKey(rand, dk), value: Math.floor(rand() * dv) });
    }

    var events = [];
    var live = [];                 // everything written so far, for querying
    var nextId = 1000;

    for (var t = 0; t < length; t++) {
      if (rand() < pWrite || live.length === 0) {
        if (recurring.length && rand() < pRepeat) {
          var rc = recurring[Math.floor(rand() * recurring.length)];
          events.push({ type: "write", key: rc.key, value: rc.value, item: rc.id, tag: "rule" });
          if (live.indexOf(rc) === -1) live.push(rc);
        } else {
          var it = { id: nextId++, key: randomKey(rand, dk), value: Math.floor(rand() * dv) };
          events.push({ type: "write", key: it.key, value: it.value, item: it.id, tag: "episodic" });
          live.push(it);
        }
      } else {
        /* Query something already written. Recency-biased but heavy-tailed, so
         * both short and long delays are represented. */
        var idx = live.length - 1 - Math.floor(Math.pow(rand(), 2.2) * live.length);
        if (idx < 0) idx = 0;
        var q = live[idx];
        events.push({ type: "query", key: q.key, value: q.value, item: q.id,
          tag: q.id < 1000 ? "rule" : "episodic" });
      }
    }
    annotate(events);
    return { events: events, recurring: recurring };
  }

  root.PT = root.PT || {};
  root.PT.task = {
    randomKey: randomKey, similarKey: similarKey,
    makeEpisode: makeEpisode, makeOverwriteEpisode: makeOverwriteEpisode,
    makeInterferenceEpisode: makeInterferenceEpisode,
    makeStructureEpisode: makeStructureEpisode, makeStreamEpisode: makeStreamEpisode, annotate: annotate
  };
})(typeof window !== 'undefined' ? window : globalThis);
