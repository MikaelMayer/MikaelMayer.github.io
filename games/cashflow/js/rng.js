/* Deterministic RNG.
 *
 * Every random event in the game goes through this. Given the same seed and the
 * same sequence of player actions, a game replays identically -- which is what
 * makes a bug report reproducible ("seed 8814, turn 12, board goes weird").
 *
 * mulberry32: 32-bit state, uniform, fast, and trivially serialisable. The
 * state is a plain integer so it round-trips through JSON save files.
 */
(function (global) {
  'use strict';

  function makeRng(seed) {
    var state = seed >>> 0;
    return {
      // Raw float in [0, 1).
      next: function () {
        state = (state + 0x6d2b79f5) >>> 0;
        var t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      // Integer in [min, max] inclusive.
      int: function (min, max) {
        return min + Math.floor(this.next() * (max - min + 1));
      },
      die: function () {
        return this.int(1, 6);
      },
      // Fisher-Yates. Returns a new array; does not touch the input.
      shuffle: function (arr) {
        var out = arr.slice();
        for (var i = out.length - 1; i > 0; i--) {
          var j = Math.floor(this.next() * (i + 1));
          var tmp = out[i];
          out[i] = out[j];
          out[j] = tmp;
        }
        return out;
      },
      getState: function () {
        return state >>> 0;
      },
      setState: function (s) {
        state = s >>> 0;
      }
    };
  }

  // A seed the player can read aloud and type back in.
  function randomSeed() {
    return Math.floor(Math.random() * 1000000);
  }

  global.CF = global.CF || {};
  global.CF.makeRng = makeRng;
  global.CF.randomSeed = randomSeed;
})(typeof window !== 'undefined' ? window : globalThis);
