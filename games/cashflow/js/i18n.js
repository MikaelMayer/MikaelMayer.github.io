/* Translation layer.
 *
 * The English string IS the key. `t('Roll {n} dice', {n: 2})` looks the English
 * up in the active dictionary and falls back to the English itself when there
 * is no entry. That has three consequences worth knowing:
 *
 *  - Adding a language is purely additive. Nothing breaks if a phrase is
 *    missing; it simply appears in English.
 *  - There are no invented key names to keep in sync, and the source stays
 *    readable: you can see what a line says without a lookup.
 *  - Changing the English wording orphans its translation. That is the cost,
 *    and it is why `missingTranslations()` exists at the bottom of this file:
 *    call it from the console to list every phrase the current language has
 *    not covered.
 *
 * Placeholders: `{name}` inserts a value; `{$name}` inserts a value formatted
 * as money in the active locale. Engine log entries store the key and the raw
 * params rather than a finished sentence, so a game saved in French reads in
 * English if you switch, and vice versa.
 */
(function (global) {
  'use strict';

  var CF = global.CF = global.CF || {};

  var LANG_KEY = 'cashflow-solo-lang';
  var SUPPORTED = ['en', 'fr'];

  CF.langNames = { en: 'English', fr: 'Français' };

  // Filled in by lang-*.js files. `en` stays empty: English is the key.
  CF.lang = { en: { ui: {}, content: {} } };

  var current = 'en';
  var missing = {};

  function detect() {
    var stored;
    try { stored = localStorage.getItem(LANG_KEY); } catch (e) { /* private mode */ }
    if (stored && SUPPORTED.indexOf(stored) !== -1) return stored;

    var nav = (global.navigator && (global.navigator.language ||
      (global.navigator.languages && global.navigator.languages[0]))) || 'en';
    var base = String(nav).toLowerCase().split('-')[0];
    return SUPPORTED.indexOf(base) !== -1 ? base : 'en';
  }

  function setLang(code) {
    if (SUPPORTED.indexOf(code) === -1) code = 'en';
    current = code;
    try { localStorage.setItem(LANG_KEY, code); } catch (e) { /* private mode */ }
    if (global.document) {
      global.document.documentElement.setAttribute('lang', code);
    }
  }

  function lang() { return current; }

  function dict() {
    return (CF.lang[current] && CF.lang[current].ui) || {};
  }

  /* ---- money ------------------------------------------------------
   * French writes 1 000 € with the symbol after and a space as the group
   * separator; English writes $1,000. Getting this wrong is the first thing a
   * French speaker notices. */
  function money(n) {
    var neg = n < 0;
    var abs = Math.abs(Math.round(n));
    if (current === 'fr') {
      return (neg ? '-' : '') + abs.toLocaleString('fr-FR') + '\u00a0\u20ac';
    }
    return (neg ? '-$' : '$') + abs.toLocaleString('en-US');
  }

  /* The decimal separator differs by locale; the placement of the % sign is
   * left to the strings themselves, which is why this returns a bare
   * number.
   *
   * `digits` is a maximum, not a width: a rate of exactly 6% reads "6%", not
   * "6.0%". A trailing zero is precision this game does not have and does not
   * need, and it makes a plain number look like a measurement. */
  function pct(n, digits) {
    var d = digits === undefined ? 1 : digits;
    return Number(n).toLocaleString(current === 'fr' ? 'fr-FR' : 'en-US',
      { minimumFractionDigits: 0, maximumFractionDigits: d });
  }

  function fill(template, params) {
    if (!params) return template;
    return template.replace(/\{(\$?)([a-zA-Z0-9_]+)\}/g, function (whole, isMoney, name) {
      if (!(name in params)) return whole;
      var v = params[name];
      return isMoney ? money(v) : String(v);
    });
  }

  function t(key, params) {
    var table = dict();
    var found = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null;
    if (found === null && current !== 'en') missing[key] = true;
    return fill(found === null ? key : found, params);
  }

  /* ---- content ----------------------------------------------------
   * Cards, professions, dreams and investments are looked up by id, because
   * their English text lives in data.js and would be unwieldy as a key. */
  /* Translate if we know the phrase, otherwise return it untouched and do NOT
   * record a gap. Used for text the engine may already have localised, so
   * a second pass over French does not look like a missing translation. */
  function maybe(str) {
    var table = dict();
    return Object.prototype.hasOwnProperty.call(table, str) ? table[str] : str;
  }

  function content(id) {
    var table = (CF.lang[current] && CF.lang[current].content) || {};
    return table[id] || null;
  }

  // Returns the localised value of one field of a data object, by its id.
  function field(obj, name) {
    if (!obj) return '';
    var tr = content(obj.id);
    if (tr && tr[name]) return tr[name];
    if (current !== 'en' && obj.id) {
      missing['[content] ' + obj.id + '.' + name] = true;
    }
    return obj[name] || '';
  }

  function missingTranslations() {
    return Object.keys(missing).sort();
  }

  CF.i18n = {
    t: t,
    maybe: maybe,
    money: money,
    pct: pct,
    fill: fill,
    lang: lang,
    setLang: setLang,
    detect: detect,
    supported: SUPPORTED,
    field: field,
    content: content,
    missingTranslations: missingTranslations
  };

  setLang(detect());
})(typeof window !== 'undefined' ? window : globalThis);
