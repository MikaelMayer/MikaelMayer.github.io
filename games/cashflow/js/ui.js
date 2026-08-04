/* CASHFLOW Solo -- user interface.
 *
 * This file renders state and turns clicks into engine actions. It contains no
 * game rules. If you want to change how the game plays, edit engine.js; if you
 * want to change how it looks, edit this file and style.css.
 *
 * The render is a full redraw from state on every change. It is a small board
 * and a redraw is microseconds -- and it makes stale-DOM bugs impossible.
 */
(function () {
  'use strict';

  var E = window.CF.engine;
  var D = window.CF.data;
  var money = E.money;

  var SAVE_KEY = 'cashflow-solo-save-v1';

  // Bumped when the interface changes; handy for confirming a browser is not
  // serving a stale cached copy when someone reports odd behaviour.
  window.CF.uiBuild = 2;

  var state = null;
  var undoStack = [];
  var MAX_UNDO = 60;

  /* ------------------------------------------------------------------ *
   * Tiny DOM helpers
   * ------------------------------------------------------------------ */

  function $(sel) { return document.querySelector(sel); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function signed(n) {
    return el('span', { class: n >= 0 ? 'pos' : 'neg', text: money(n) });
  }

  /* ------------------------------------------------------------------ *
   * Board geometry: map a perimeter index onto an n x n CSS grid.
   * ------------------------------------------------------------------ */

  function perimeterCell(i, n) {
    if (i < n) return [1, i + 1];                          // top, left to right
    if (i < 2 * n - 1) return [i - n + 2, n];              // right, top to bottom
    if (i < 3 * n - 2) return [n, n - (i - (2 * n - 2))];  // bottom, right to left
    return [n - (i - (3 * n - 3)), 1];                     // left, bottom to top
  }

  var SQUARE_LABEL = {
    OPPORTUNITY: 'Opportunity',
    PAYDAY: 'PAYDAY',
    MARKET: 'Market',
    DOODAD: 'Expense',
    CHARITY: 'Charity',
    BABY: 'Baby',
    DOWNSIZED: 'Downsized'
  };

  // Only the squares whose names do not fit a small cell need an alias.
  var SQUARE_SHORT = {
    OPPORTUNITY: 'Deal',
    DOWNSIZED: 'Job loss'
  };

  /* Tapping a square explains it. A touch device has no hover, so the `title`
   * tooltip the board used to rely on reached nobody on a phone -- and the
   * game shipped with no legend and no rules anywhere in the interface. */
  var SQUARE_HELP = {
    OPPORTUNITY: 'Choose a Small Deal or a Big Deal, then look at the card. Small Deals need a few thousand down; Big Deals need much more and pay much more. Looking is always free and you can always say no.',
    PAYDAY: 'You collect your monthly cash flow — salary plus passive income, less every expense. You collect it whenever you PASS a payday square as well as when you land on one, so there are three per lap.',
    MARKET: 'Something happens to the things you own. Usually a buyer appears for one type of asset and you may sell; sometimes a cost lands on every property or business you hold. If you own nothing that matches, nothing happens.',
    DOODAD: 'An unplanned expense. Some must be paid: you are shown the amount and you press Pay. Others are offered, and you may accept or decline them; declining changes none of your numbers.',
    CHARITY: 'You may donate 10% of your total income. If you do, then for the next three turns you may roll one die or two — more control over where you land, and more chances at an Opportunity.',
    BABY: 'A child joins your household, up to three. Each one adds your profession\'s per-child cost to your expenses every month, for good, which raises the bar you have to clear to get out.',
    DOWNSIZED: 'You lose your job. Pay one full month of total expenses and lose your next two turns. The lower your cash flow, the harder this lands.'
  };

  var squareInfo = null;

  function squareHelpCard(type) {
    return el('div', { class: 'card info' }, [
      el('span', { class: 'tagline', text: 'Board square' }),
      el('h3', { text: SQUARE_LABEL[type] }),
      el('p', { text: SQUARE_HELP[type] }),
      el('div', { class: 'buttons' }, [
        el('button', { onclick: function () { squareInfo = null; render(); }, text: 'Close' })
      ])
    ]);
  }

  /* ------------------------------------------------------------------ *
   * Actions: every mutation goes through here so undo always works.
   * ------------------------------------------------------------------ */

  function snapshot() {
    undoStack.push(E.serialize(state));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  }

  /* Errors are shown inside the card that caused them, not in a banner far up
   * the page that disappears after five seconds. `cardError` is cleared by the
   * next successful action. */
  var cardError = null;

  function showBanner(msg, kind) {
    var b = $('#error-banner');
    b.textContent = msg;
    b.className = 'banner ' + (kind || 'error');
    clearTimeout(showBanner._t);
    showBanner._t = setTimeout(function () { b.classList.add('hidden'); }, 6000);
  }

  /* ---- Turn receipt -------------------------------------------------
   *
   * Half the squares in the game resolve with no decision to make: payday
   * pays, a baby arrives, the market ignores you. Those turns used to end
   * with the money changed and nothing on screen to say what happened, which
   * is bad teaching and indistinguishable from a bug. So the whole turn is
   * recorded and replayed back to the player as a receipt.
   *
   * The engine's log is the source: everything that moves a dollar writes a
   * line, so slicing the log around an action captures the turn exactly,
   * without the UI having to know what any square does. */
  var receipt = null;

  function beginTurn() {
    receipt = {
      cashStart: state.cash,
      passiveStart: E.stats(state).passiveIncome,
      square: null,
      entries: []
    };
  }

  function recordSince(mark) {
    if (!receipt) return;
    for (var i = mark; i < state.log.length; i++) {
      var entry = state.log[i];
      if (entry.type === 'roll') continue;          // the dice are drawn separately
      receipt.entries.push(entry);
    }
  }

  function currentSquareLabel() {
    if (state.phase === 'fasttrack' || state.phase === 'won') {
      var sq = D.FAST_TRACK_BOARD[state.ftPosition];
      if (sq.type === 'INVESTMENT') return E.findById(D.FT_INVESTMENTS, sq.investment).name;
      if (sq.type === 'DREAM') return E.findById(D.DREAMS, sq.dream).name;
      return sq.label || sq.type;
    }
    return SQUARE_LABEL[D.RAT_RACE_BOARD[state.position]] || '';
  }

  function doAction(type, payload) {
    snapshot();
    var mark = state.log.length;
    var res = E.act(state, type, payload);
    if (!res.ok) {
      undoStack.pop();          // nothing changed, so nothing to undo
      cardError = res.error;
      render();
      return false;
    }
    cardError = null;
    recordSince(mark);
    render();
    return true;
  }

  function doRoll(dice) {
    if (moving) return;                 // ignore taps while the token is walking
    squareInfo = null;
    snapshot();
    beginTurn();
    var from = (state.phase === 'fasttrack' || state.phase === 'won') ? state.ftPosition : state.position;
    var mark = state.log.length;
    try {
      E.roll(state, dice);
    } catch (e) {
      undoStack.pop();
      receipt = null;
      showBanner(e.message);
      return;
    }
    cardError = null;
    recordSince(mark);
    receipt.square = currentSquareLabel();

    var to = (state.phase === 'fasttrack' || state.phase === 'won') ? state.ftPosition : state.position;
    if (to !== from && !E.isOver(state)) {
      // Draw the board first so the squares exist, then walk the token across
      // them and redraw once it arrives so the landing square lights up.
      render();
      walkToken(from, to, render);
    } else {
      render();
    }
  }

  function undo() {
    if (!undoStack.length) return;
    state = JSON.parse(undoStack.pop());
    receipt = null;
    cardError = null;
    render();
  }

  /* ------------------------------------------------------------------ *
   * Render
   * ------------------------------------------------------------------ */

  function render() {
    if (!state) return;
    /* A throw anywhere in here used to leave whichever panel was mid-rebuild
     * empty and the game unplayable, with the reason only in the console. A
     * blank screen is the worst possible failure mode; say what happened and
     * keep the game recoverable through Undo. */
    try {
      renderHeader();
      renderBoard();
      renderStatement();
      renderPending();
      renderBank();
      renderLog();
      renderInvariants();
      maybeScrollToAction();
      focusNewDecision();
      autosave();
    } catch (e) {
      showBanner('The interface hit an error drawing this turn (' + e.message +
        '). Your game is safe — press Undo to step back, and please report seed ' +
        state.seed + ' at month ' + state.months + '.');
      if (window.console) console.error(e);
    }
  }

  /* Save on every change rather than on a button.
   *
   * Manual-only saving meant closing the tab at month 50 with a Save from
   * month 20 silently threw away thirty months of decisions -- with no
   * warning, because the game resumed from the old slot without a word. */
  function autosave() {
    try {
      localStorage.setItem(SAVE_KEY, E.serialize(state));
    } catch (e) { /* private mode or quota; the game still plays */ }
  }

  /* A full redraw destroys whatever had focus, so a keyboard player was
   * returned to the top of the document after every single action. Put focus
   * on the new decision instead. */
  function focusNewDecision() {
    if (!focusPending) return;
    focusPending = false;
    var h = $('#action').querySelector('h3');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  /* On a phone the columns stack, so a new card can land below the fold and
   * look like nothing happened. Bring it into view -- but only when the
   * decision itself has changed, so the page never moves under a player who is
   * deliberately reading their financial statement. */
  var lastPendingKey = null;
  var focusPending = false;

  function pendingKey() {
    var p = state.pending;
    if (!p) return state.phase === 'ratrace' || state.phase === 'fasttrack' ? null : 'over:' + state.phase;
    return p.kind + ':' + (p.card ? p.card.id : p.title || '');
  }

  function maybeScrollToAction() {
    var key = pendingKey();
    var changed = key !== lastPendingKey;
    lastPendingKey = key;
    if (changed) focusPending = true;
    if (!changed || key === null) return;

    // Single-column layout only; on a wide screen everything is already visible.
    if (window.innerWidth > 820) return;

    /* Measure late, on purpose. render() has just replaced the whole panel,
     * and the browser's scroll anchoring is still adjusting for a while
     * afterwards. Measuring immediately -- or even on the next animation
     * frame -- reads a half-settled layout in which the panel looks like it
     * is on screen when it is not, and the scroll silently never happens. */
    clearTimeout(maybeScrollToAction._t);
    maybeScrollToAction._t = setTimeout(function () {
      var box = $('#action').getBoundingClientRect();
      if (box.top >= 0 && box.bottom <= window.innerHeight) return;   // already visible

      var margin = Math.max(8, (window.innerHeight - box.height) / 2);
      var target = Math.max(0, window.scrollY + box.top - margin);
      // Instant, not smooth: a smooth scroll started right after a full DOM
      // replacement gets silently cancelled by scroll anchoring, and an
      // animation that sometimes runs is worse than one that never does.
      window.scrollTo(0, target);
    }, 80);
  }

  function renderHeader() {
    $('#seedtag').textContent = 'seed ' + state.seed + '  ·  month ' + state.months;
    $('#undo-btn').disabled = undoStack.length === 0;
  }

  function renderBoard() {
    var wrap = $('#board');
    clear(wrap);

    // A bankrupt player never reached the Fast Track, so keep them on the
    // board where it happened.
    var isRat = state.phase === 'ratrace' || state.phase === 'bankrupt';
    var board = isRat ? D.RAT_RACE_BOARD : D.FAST_TRACK_BOARD;
    var n = isRat ? 7 : 11;
    var pos = isRat ? state.position : state.ftPosition;

    wrap.className = 'board ' + (isRat ? 'rat' : 'fast');

    for (var i = 0; i < board.length; i++) {
      var cell = perimeterCell(i, n);
      var sq = board[i];
      var type = isRat ? sq : sq.type;
      var label, short, mine = false;

      if (isRat) {
        label = SQUARE_LABEL[type];
        short = SQUARE_SHORT[type] || label;
      } else if (type === 'INVESTMENT') {
        var inv = E.findById(D.FT_INVESTMENTS, sq.investment);
        label = inv.name;
        short = inv.short || inv.name;
      } else if (type === 'DREAM') {
        var dr = E.findById(D.DREAMS, sq.dream);
        label = dr.name;
        short = dr.short || dr.name;
        mine = dr.id === state.dream.id;
      } else {
        label = sq.label;
        short = sq.label;
      }

      // Both labels are rendered; the stylesheet shows whichever fits the
      // screen. Doing it in CSS means no resize listener and no reflow bugs.
      var explains = isRat && SQUARE_HELP[type];
      var node = el(explains ? 'button' : 'div', {
        class: 'sq ' + type + (i === pos && !moving ? ' here' : '') + (mine ? ' mine' : ''),
        style: 'grid-row:' + cell[0] + ';grid-column:' + cell[1],
        title: explains ? label + ' — tap to see what this square does' : label,
        'data-index': String(i),
        'aria-label': label + (i === pos ? ', you are here' : '')
      }, [
        el('span', { class: 'lbl-full', text: label }),
        el('span', { class: 'lbl-short', text: short })
      ]);
      if (i === pos) node.setAttribute('aria-current', 'true');
      if (explains) {
        node.type = 'button';
        (function (t) { node.addEventListener('click', function () { squareInfo = t; render(); }); })(type);
      }
      wrap.appendChild(node);
    }

    wrap.appendChild(renderBoardCentre(n));
    placeToken(moving ? tokenAt : pos, false);
  }

  /* ---- the token -------------------------------------------------
   *
   * The token lives outside the board grid, absolutely positioned over it, so
   * a board redraw does not destroy it mid-move and so it can slide between
   * squares instead of teleporting. It walks one square at a time, which is
   * the part that makes a roll of five feel like five. */
  var moving = false;
  var tokenAt = 0;

  function boardLength() {
    return (state.phase === 'fasttrack' || state.phase === 'won')
      ? D.FAST_TRACK_BOARD.length : D.RAT_RACE_BOARD.length;
  }

  /* The very first paint happens before the page has settled -- a scrollbar
   * may still appear and shift the centred board sideways -- so place the
   * token again once layout has stopped moving. */
  function settleToken() {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (state && !moving) placeToken(tokenAt, false);
      });
    });
  }

  function placeToken(index, animate) {
    var token = $('#token');
    var board = $('#board');
    if (!token || !board) return;
    var sq = board.querySelector('.sq[data-index="' + index + '"]');
    if (!sq) { token.style.opacity = '0'; return; }

    token.style.opacity = '1';
    token.classList.toggle('gliding', !!animate);

    /* Measure against the wrapper rather than adding up offsets. A square's
     * offsetParent is already the positioned wrapper, so adding the board's
     * own offset on top double-counts it and lands the token a square wide of
     * where the player actually is. */
    var wrapRect = $('#board-wrap').getBoundingClientRect();
    var sqRect = sq.getBoundingClientRect();
    var x = sqRect.left - wrapRect.left + sqRect.width / 2;
    var y = sqRect.top - wrapRect.top + sqRect.height / 2;

    token.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px) translate(-50%,-50%)';
    tokenAt = index;
  }

  function walkToken(from, to, done) {
    var len = boardLength();
    var steps = (to - from + len) % len;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (steps === 0 || reduce) {
      placeToken(to, false);
      done();
      return;
    }

    moving = true;
    var cur = from;
    var taken = 0;
    placeToken(cur, false);

    (function hop() {
      cur = (cur + 1) % len;
      taken++;
      placeToken(cur, true);
      if (taken < steps) {
        setTimeout(hop, 170);
      } else {
        setTimeout(function () { moving = false; done(); }, 220);
      }
    })();
  }

  /* A real die face, not a printed number.
   *
   * Nine cells of a 3x3 grid; each face lights the cells a physical die would.
   * Cheaper and crisper than an image, and it scales with the board. */
  var DIE_PIPS = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8]
  };

  function dieFace(value) {
    var die = el('div', {
      class: 'die',
      role: 'img',
      'aria-label': 'die showing ' + value
    });
    var lit = DIE_PIPS[value] || [];
    for (var i = 0; i < 9; i++) {
      die.appendChild(el('span', {
        class: 'pip' + (lit.indexOf(i) === -1 ? ' off' : '')
      }));
    }
    return die;
  }

  function renderBoardCentre(n) {
    var centre = el('div', { class: 'board-center' });
    centre.style.gridRow = '2 / ' + n;
    centre.style.gridColumn = '2 / ' + n;

    if (state.phase === 'won') {
      centre.appendChild(el('div', { class: 'big', text: 'You win' }));
      centre.appendChild(el('div', {
        class: 'sub',
        text: (state.result.how === 'dream' ? 'Dream bought' : 'Fast Track cash flow goal reached') +
          ' in ' + state.result.months + ' months.'
      }));
      centre.appendChild(el('button', { class: 'primary', onclick: openSetup, text: 'Play again' }));
      return centre;
    }

    if (state.phase === 'bankrupt') {
      centre.appendChild(el('div', { class: 'big neg', text: 'Bankrupt' }));
      centre.appendChild(el('div', { class: 'sub', text: 'Month ' + state.result.months + '.' }));
      centre.appendChild(el('button', { class: 'primary', onclick: openSetup, text: 'New game' }));
      return centre;
    }

    var s = E.stats(state);
    if (state.phase === 'ratrace') {
      /* Passive income is the number that ends the game, so it is the number
       * that gets the 34px treatment. Monthly cash flow used to be here, and
       * a player optimising the biggest number on screen would have been
       * optimising the wrong one -- cash flow goes UP when you sell the
       * assets that were going to free you. */
      centre.appendChild(el('div', { class: 'sub', text: 'Passive income' }));
      centre.appendChild(el('div', { class: 'big', text: money(s.passiveIncome) }));

      var gap = s.totalExpenses - s.passiveIncome;
      centre.appendChild(el('div', {
        class: 'sub',
        text: gap > 0
          ? money(gap) + ' a month short of your ' + money(s.totalExpenses) + ' of expenses'
          : 'Clear of your ' + money(s.totalExpenses) + ' of expenses'
      }));

      var pct = s.totalExpenses > 0 ? Math.min(100, (s.passiveIncome / s.totalExpenses) * 100) : 0;
      var bar = el('div', {
        class: 'progress', role: 'progressbar',
        'aria-valuemin': '0', 'aria-valuemax': '100',
        'aria-valuenow': String(Math.round(pct)),
        'aria-valuetext': money(s.passiveIncome) + ' of ' + money(s.totalExpenses) + ' needed to leave the Rat Race'
      });
      bar.appendChild(el('i', { style: 'width:' + pct.toFixed(1) + '%' }));
      centre.appendChild(bar);
      centre.appendChild(el('div', { class: 'sub', text: Math.round(pct) + '% of the way out' }));
      centre.appendChild(statusChips());
    } else {
      var f = E.ftStats(state);
      centre.appendChild(el('div', { class: 'sub', text: 'Cash Flow Day income' }));
      centre.appendChild(el('div', { class: 'big', text: money(f.totalIncome) }));
      centre.appendChild(el('div', {
        class: 'sub',
        text: 'New investment income ' + money(f.addedIncome) + ' of ' +
          money(E.constants.FAST_TRACK_CASHFLOW_GOAL)
      }));
      var pct2 = Math.min(100, (f.addedIncome / E.constants.FAST_TRACK_CASHFLOW_GOAL) * 100);
      var bar2 = el('div', {
        class: 'progress', role: 'progressbar',
        'aria-valuemin': '0', 'aria-valuemax': '100',
        'aria-valuenow': String(Math.round(pct2)),
        'aria-valuetext': money(f.addedIncome) + ' of ' + money(E.constants.FAST_TRACK_CASHFLOW_GOAL) + ' of new income'
      });
      bar2.appendChild(el('i', { style: 'width:' + pct2.toFixed(1) + '%' }));
      centre.appendChild(bar2);
    }

    if (state.lastRoll) {
      var dice = el('div', { class: 'dice' });
      state.lastRoll.forEach(function (d) { dice.appendChild(dieFace(d)); });
      centre.appendChild(dice);
    }
    return centre;
  }

  /* Modes the player is in right now. These used to be mentioned only on the
   * roll card, so the dice choice you paid 10% of your income for vanished the
   * moment any other card appeared. */
  function statusChips() {
    var wrap = el('div', { class: 'chips' });
    if (state.charityTurns > 0) {
      wrap.appendChild(el('span', {
        class: 'chip good',
        text: 'Dice choice: this turn' + (state.charityTurns > 1 ? ' and ' + (state.charityTurns - 1) + ' more' : '')
      }));
    }
    if (state.skipTurns > 0) {
      wrap.appendChild(el('span', { class: 'chip bad', text: 'Downsized: ' + state.skipTurns + ' turn' + (state.skipTurns > 1 ? 's' : '') + ' lost' }));
    }
    if (state.children > 0) {
      wrap.appendChild(el('span', { class: 'chip', text: state.children + ' child' + (state.children > 1 ? 'ren' : '') }));
    }
    if (state.bankLoan > 0) {
      wrap.appendChild(el('span', { class: 'chip bad', text: 'Bank debt ' + money(state.bankLoan) }));
    }
    return wrap;
  }

  function renderStatement() {
    var s = E.stats(state);
    var head = $('#headline');
    clear(head);

    function box(k, v, cls, sub) {
      var b = el('div', { class: 'box' + (cls === 'hero' ? ' hero' : '') }, [el('div', { class: 'k', text: k })]);
      var val = el('div', { class: 'v' + (cls && cls !== 'hero' ? ' ' + cls : '') });
      val.appendChild(typeof v === 'string' ? document.createTextNode(v) : v);
      b.appendChild(val);
      if (sub) b.appendChild(el('div', { class: 'boxsub', text: sub }));
      return b;
    }

    if (state.phase === 'fasttrack' || state.phase === 'won') {
      var f = E.ftStats(state);
      head.appendChild(box('Cash', money(state.cash)));
      head.appendChild(box('Cash Flow Day', money(f.totalIncome), 'pos'));
    } else {
      /* The win condition, side by side, as the first thing in the panel --
       * because "passive income vs total expenses" IS the game, and it used to
       * be a 13px grey subline while cash flow got two large displays. */
      var gap = s.totalExpenses - s.passiveIncome;
      var passiveBox = box('Passive income', money(s.passiveIncome), 'hero',
        gap > 0 ? money(gap) + ' short of ' + money(s.totalExpenses) : 'clear of ' + money(s.totalExpenses));

      /* A bar whose full width is your total expenses. Passive income only
       * means something measured against what it has to cover, so the two
       * numbers are shown as one shape rather than two figures to subtract. */
      var pctOut = s.totalExpenses > 0
        ? Math.min(100, (s.passiveIncome / s.totalExpenses) * 100) : 0;
      var passiveBar = el('div', {
        class: 'progress inbox', role: 'progressbar',
        'aria-valuemin': '0', 'aria-valuemax': String(s.totalExpenses),
        'aria-valuenow': String(s.passiveIncome),
        'aria-valuetext': money(s.passiveIncome) + ' of the ' + money(s.totalExpenses) + ' needed'
      });
      passiveBar.appendChild(el('i', { style: 'width:' + pctOut.toFixed(1) + '%' }));
      passiveBox.appendChild(passiveBar);
      head.appendChild(passiveBox);
      head.appendChild(box('Total expenses', money(s.totalExpenses), 'hero', 'the bar to clear'));
      head.appendChild(box('Cash', money(state.cash)));
      head.appendChild(box('Monthly cash flow', signed(s.cashflow), null, 'what payday pays'));
    }

    var st = $('#statement');
    clear(st);

    if (state.phase === 'fasttrack' || state.phase === 'won') {
      var ft = E.ftStats(state);
      st.appendChild(group('Fast Track income', [
        row('From the Rat Race', money(ft.baseIncome), true),
        row('From new investments', money(ft.investmentIncome), true),
        row('Cash Flow Day total', money(ft.totalIncome), false, true)
      ]));
      st.appendChild(group('Your dream', [
        row(state.dream.name, money(state.dream.cost), true)
      ]));
      return;
    }

    st.appendChild(group('Income', [
      row('Salary', money(s.salary), true),
      row('Interest / dividends', money(s.interestDividends), true),
      row('Real estate', money(s.realEstateIncome), true),
      row('Business', money(s.businessIncome), true),
      row('Passive income', money(s.passiveIncome), false, true),
      row('Total income', money(s.totalIncome), false, true)
    ]));

    /* Only expenses you actually have.
     *
     * A debt you have cleared should leave the sheet, not sit there at $0 --
     * seeing the line vanish is the reward for paying it off, and a statement
     * full of zeroes buries the numbers that still matter. */
    var p = s.expenseParts;
    function expense(label, amount) {
      return amount > 0 ? row(label, money(amount), true) : null;
    }
    st.appendChild(group('Expenses', [
      expense('Taxes', p.taxes),
      expense('Home mortgage', p.home),
      expense('School loan', p.school),
      expense('Car loan', p.car),
      expense('Credit cards', p.creditCard),
      expense('Retail', p.retail),
      expense('Other', p.other),
      state.children > 0 ? row('Children (' + state.children + ')', money(p.children), true) : null,
      expense('Loans', p.bankLoan),
      row('Total expenses', money(s.totalExpenses), false, true)
    ]));

    /* Assets first, then liabilities: the two sides of the balance sheet,
     * in the order a financial statement puts them. */
    var assetsHost = el('div', { class: 'group assets' });
    assetsHost.appendChild(el('div', { class: 'row' }, [
      el('span', { class: 'label', text: 'Assets' })
    ]));
    var assetsBody = el('div', {});
    renderAssets(assetsBody);
    assetsHost.appendChild(assetsBody);
    st.appendChild(assetsHost);

    /* Every debt you can clear gets its own button, right beside the number.
     *
     * Retiring a debt removes its monthly payment for good, which lowers the
     * bar you are trying to clear -- so it belongs on the balance sheet next
     * to the debt itself, not buried in a panel elsewhere. */
    var liabilities = el('div', { class: 'group' }, [
      el('div', { class: 'row' }, [el('span', { class: 'label', text: 'Liabilities' })])
    ]);

    Object.keys(E.LIABILITY_NAMES).forEach(function (which) {
      var slot = state.profession[which];
      if (!slot.liability && !slot.payment) return;
      liabilities.appendChild(liabilityRow(
        capitalise(E.LIABILITY_NAMES[which]), slot.liability, slot.payment,
        slot.liability > 0 ? function () { openPayoffDialog(which); } : null,
        slot.liability > state.cash
      ));
    });

    if (state.bankLoan > 0) {
      liabilities.appendChild(liabilityRow(
        'Loans', state.bankLoan, p.bankLoan, openRepayLoanDialog, state.cash < 1000
      ));
    }

    if (propertyDebt() > 0) {
      liabilities.appendChild(liabilityRow('Property mortgages', propertyDebt(), 0, null, false,
        'Cleared when you sell the property'));
    }
    st.appendChild(liabilities);
  }

  function capitalise(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function liabilityRow(label, balance, payment, onPay, disabled, note) {
    var r = el('div', { class: 'row sub liab' }, [
      el('span', { class: 'liabname', text: label }),
      el('span', { class: 'liabnum', text: money(balance) })
    ]);
    if (onPay) {
      var b = el('button', { class: 'tiny', onclick: onPay, text: 'Repay' });
      if (disabled) {
        b.disabled = true;
        b.title = 'Not enough cash';
      }
      r.appendChild(b);
    } else {
      r.appendChild(el('span', { class: 'liabnote', text: note || '' }));
    }
    return r;
  }

  function propertyDebt() {
    return state.assets.reduce(function (sum, a) { return sum + (a.mortgage || 0); }, 0);
  }

  function group(title, rows) {
    var g = el('div', { class: 'group' }, [el('div', { class: 'row' }, [
      el('span', { class: 'label', text: title })
    ])]);
    rows.forEach(function (r) { if (r) g.appendChild(r); });
    return g;
  }

  function row(label, value, sub, total) {
    return el('div', { class: 'row' + (sub ? ' sub' : '') + (total ? ' total' : '') }, [
      el('span', { text: label }),
      el('span', { text: value })
    ]);
  }

  /* ------------------------------------------------------------------ *
   * The action area: either "roll" or whatever decision is pending.
   * ------------------------------------------------------------------ */

  function renderPending() {
    var host = $('#action');
    clear(host);

    if (state.phase === 'bankrupt') {
      host.appendChild(el('div', { class: 'card danger' }, [
        el('h3', { text: 'Bankrupt in ' + state.result.months + ' months' }),
        el('p', {
          text: 'You could not pay for ' + state.result.reason + ', and there was nothing ' +
            'left to sell or borrow against. Expenses that grow faster than income only ' +
            'end one way. Use Undo to go back and take a different turn, or start again.'
        }),
        el('div', { class: 'buttons' }, [
          el('button', { class: 'primary', onclick: openSetup, text: 'New game' }),
          el('button', { onclick: undo, text: 'Undo the last move' })
        ])
      ]));
      return;
    }

    if (state.phase === 'won') {
      host.appendChild(el('div', { class: 'card gold' }, [
        el('h3', { text: 'Game over - you win' }),
        el('p', {
          text: state.result.how === 'dream'
            ? 'You bought your dream in ' + state.result.months + ' months.'
            : 'You added ' + money(E.ftStats(state).addedIncome) +
              ' a month of investment income in ' + state.result.months + ' months.'
        }),
        el('div', { class: 'buttons' }, [
          el('button', { class: 'primary', onclick: openSetup, text: 'New game' })
        ])
      ]));
      return;
    }

    if (squareInfo) host.appendChild(squareHelpCard(squareInfo));

    var p = state.pending;
    if (!p) {
      // What just happened, then what to do next.
      if (receipt && receipt.entries.length) host.appendChild(receiptCard());
      host.appendChild(rollCard());
      return;
    }

    switch (p.kind) {
      case 'chooseDeck': return host.appendChild(chooseDeckCard(p));
      case 'deal': return host.appendChild(dealCard(p));
      case 'charity': return host.appendChild(simpleCard(p, 'Donate ' + money(p.amount), 'charityDonate', 'Decline'));
      case 'doodadOptional': return host.appendChild(optionalDoodadCard(p));
      case 'bill': return host.appendChild(billCard(p));
      case 'sellAsset': return host.appendChild(sellAssetCard(p));
      case 'sellGold': return host.appendChild(sellGoldCard(p));
      case 'ftInvestment': return host.appendChild(ftInvestmentCard(p));
      case 'ftDream': return host.appendChild(ftDreamCard(p));
      case 'ftCharity': return host.appendChild(simpleCard(p, 'Donate ' + money(p.amount), 'ftCharityDonate', 'Decline'));
      default:
        return host.appendChild(el('div', { class: 'card danger' }, [
          el('h3', { text: 'Unexpected state' }),
          el('p', { text: 'The engine is waiting on "' + p.kind + '", which this interface does not know how to show. Please report this with the seed above.' }),
          el('div', { class: 'buttons' }, [
            el('button', { onclick: function () { doAction('acknowledge'); }, text: 'Continue' })
          ])
        ]));
    }
  }

  /* The turn just played, replayed back. This is the only place a player can
   * see WHY their numbers changed without reading the history log. */
  function receiptCard() {
    var cashDelta = state.cash - receipt.cashStart;
    var passiveDelta = E.stats(state).passiveIncome - receipt.passiveStart;
    var tone = cashDelta > 0 ? 'gold' : (cashDelta < 0 ? 'danger' : 'info');

    var card = el('div', { class: 'card receipt ' + tone }, [
      el('span', { class: 'tagline', text: 'Last turn — ' + (receipt.square || 'result') })
    ]);

    if (cashDelta !== 0) {
      card.appendChild(el('div', { class: 'receipt-headline' }, [
        el('span', { class: cashDelta > 0 ? 'pos' : 'neg', text: (cashDelta > 0 ? '+' : '') + money(cashDelta) }),
        el('span', { class: 'receipt-sub', text: 'cash, now ' + money(state.cash) })
      ]));
    }

    var lines = el('div', { class: 'receipt-lines' });
    receipt.entries.forEach(function (entry) {
      lines.appendChild(el('div', { class: 'receipt-line ' + entry.type, text: entry.text }));
    });
    card.appendChild(lines);

    if (passiveDelta !== 0) {
      card.appendChild(el('div', {
        class: 'hint',
        text: 'Passive income ' + (passiveDelta > 0 ? 'rose ' : 'fell ') + money(Math.abs(passiveDelta)) +
          ' a month, to ' + money(E.stats(state).passiveIncome) + '.'
      }));
    }
    return card;
  }

  function rollCard() {
    var opts = E.diceOptions(state);
    var card = el('div', { class: 'card' }, [
      el('h3', { text: state.skipTurns > 0 ? 'You are downsized' : 'Your move' })
    ]);

    if (state.skipTurns > 0) {
      card.appendChild(el('p', { text: 'You lose ' + state.skipTurns + ' more turn' + (state.skipTurns > 1 ? 's' : '') + '.' }));
      card.appendChild(el('div', { class: 'buttons' }, [
        el('button', { class: 'primary', onclick: function () { doRoll(1); }, text: 'Sit out a month' })
      ]));
      return card;
    }

    if (state.phase === 'fasttrack') {
      card.appendChild(el('p', { text: 'Roll two dice.' }));
    } else if (opts.length > 1) {
      card.appendChild(el('p', { text: 'Your donation earns you a choice: one die or two, for ' + state.charityTurns + ' more turn' + (state.charityTurns > 1 ? 's' : '') + '.' }));
    } else {
      card.appendChild(el('p', { text: 'Roll the die and move.' }));
    }

    var buttons = el('div', { class: 'buttons' });
    opts.forEach(function (n) {
      buttons.appendChild(el('button', {
        class: 'primary',
        onclick: function () { doRoll(n); },
        text: n === 1 ? 'Roll 1 die' : 'Roll 2 dice'
      }));
    });
    card.appendChild(buttons);
    return card;
  }

  function chooseDeckCard(p) {
    return el('div', { class: 'card' }, [
      el('h3', { text: p.title }),
      el('p', { text: p.text }),
      el('div', { class: 'buttons' }, [
        el('button', { onclick: function () { doAction('chooseDeck', { deck: 'small' }); }, text: 'Small Deal' }),
        el('button', { onclick: function () { doAction('chooseDeck', { deck: 'big' }); }, text: 'Big Deal' })
      ]),
      el('div', { class: 'hint', text: 'Looking at a deal does not commit you to it.' })
    ]);
  }

  /* Distinct, useful quantities rather than a slider of every integer.
   * Always offers the maximum first, because "as many as I can" is the most
   * common intent and the hardest to type on a phone. */
  function buyAmounts(max) {
    var out = [max];
    [Math.floor(max / 2), 100, 50, 10, 1].forEach(function (n) {
      if (n >= 1 && n < max && out.indexOf(n) === -1) out.push(n);
    });
    return out.slice(0, 5);
  }

  function sellAmounts(held) {
    var out = [held];
    [Math.floor(held / 2), 10, 1].forEach(function (n) {
      if (n >= 1 && n < held && out.indexOf(n) === -1) out.push(n);
    });
    return out.slice(0, 4);
  }

  /* Picking an amount and committing to it are two separate acts.
   *
   * A quantity chip used to execute the trade the instant it was tapped, so
   * the largest amount was one careless tap away and there was never a moment
   * where the player could see what they were about to do. Chips now only
   * select; a summary of the consequences appears; and a second, explicit
   * press carries it out. */
  var trade = { key: null, mode: null, qty: 0 };

  function resetTrade() { trade = { key: pendingKey(), mode: null, qty: 0 }; }

  function tradeFor(mode) {
    if (trade.key !== pendingKey()) resetTrade();
    return trade.mode === mode ? trade.qty : 0;
  }

  function quantityRow(label, amounts, unitPrice, mode) {
    if (trade.key !== pendingKey()) resetTrade();
    var row = el('div', { class: 'qtyrow' }, [el('span', { class: 'qtylabel', text: label })]);
    amounts.forEach(function (n, i) {
      var chosen = trade.mode === mode && trade.qty === n;
      row.appendChild(el('button', {
        class: 'qtychip' + (chosen ? ' chosen' : ''),
        'aria-pressed': chosen ? 'true' : 'false',
        onclick: function () {
          trade = { key: pendingKey(), mode: mode, qty: n };
          cardError = null;
          render();
        },
        title: n + ' for ' + money(n * unitPrice)
      }, [
        el('span', { class: 'qty', text: (i === 0 ? (mode === 'sell' ? 'All ' : 'Max ') : '') + n }),
        el('span', { class: 'qtycost', text: money(n * unitPrice) })
      ]));
    });
    return row;
  }

  /* The second step: what the selected amount actually does, and the button
   * that does it. */
  function confirmTrade(opts) {
    var qty = trade.qty;
    var total = qty * opts.unitPrice;
    var buying = trade.mode === 'buy';
    var rows = [
      [buying ? 'Buying' : 'Selling', qty + ' ' + (qty === 1 ? opts.unit : opts.units) +
        ' at ' + money(opts.unitPrice)],
      ['Total', money(total)],
      ['Cash now', money(state.cash)],
      ['Cash after', money(buying ? state.cash - total : state.cash + total)]
    ];
    if (opts.extraRows) rows = rows.concat(opts.extraRows(qty, buying));

    return el('div', { class: 'confirmstep' }, [
      terms(rows),
      errorSlot(),
      el('div', { class: 'buttons' }, [
        el('button', {
          onclick: function () { opts.onConfirm(qty, buying); },
          text: (buying ? 'Buy ' : 'Sell ') + qty + ' ' + (qty === 1 ? opts.unit : opts.units)
        }),
        el('button', {
          class: 'ghost',
          onclick: function () { resetTrade(); render(); },
          text: 'Change amount'
        })
      ])
    ]);
  }

  /* Errors belong next to the control that produced them, not in a banner two
   * screens up that erases itself after five seconds. */
  /* Returns an empty DocumentFragment rather than null when there is nothing
   * to show: appending an empty fragment is a no-op, whereas appendChild(null)
   * throws and takes the whole render down with it. */
  function errorSlot() {
    if (!cardError) return document.createDocumentFragment();
    return el('div', { class: 'carderror', role: 'alert', text: cardError });
  }

  function terms(pairs) {
    var box = el('div', { class: 'terms' });
    pairs.forEach(function (pr) {
      if (!pr) return;
      box.appendChild(el('div', {}, [el('span', { text: pr[0] }), el('span', { text: pr[1] })]));
    });
    return box;
  }

  function dealCard(p) {
    var c = p.card;
    var card = el('div', { class: 'card' }, [
      el('h3', { text: c.title })
    ]);
    if (c.text) card.appendChild(el('p', { text: c.text }));

    var buttons = el('div', { class: 'buttons' });

    if (c.kind === 'stock') {
      var held = state.stocks[c.symbol];
      var shares = held ? held.shares : 0;
      var maxBuy = Math.floor(state.cash / c.price);
      card.appendChild(terms([
        ['Price per share', money(c.price)],
        ['Dividend', c.dividend ? money(c.dividend) + ' / share / month' : 'none'],
        ['Trading range', money(c.range[0]) + ' - ' + money(c.range[1])],
        ['You own', shares + ' shares' + (held ? ' (paid ' + money(held.invested) + ')' : '')],
        ['You can afford', maxBuy + ' shares']
      ]));
      /* Preset amounts rather than one shared number field.
       *
       * The old card had a single input used by Buy, Sell and Sell-all, which
       * meant the same box could hold a quantity that was legal for one
       * operation and impossible for another, and its default of 10 was
       * absurd on a $5 share you could buy 300 of. Each button now carries
       * its own quantity, so nothing can be typed into the wrong operation. */
      if (maxBuy >= 1) {
        card.appendChild(quantityRow('Buy', buyAmounts(maxBuy), c.price, 'buy'));
      } else {
        card.appendChild(el('div', { class: 'hint', text: 'One share costs ' + money(c.price) + ' and you have ' + money(state.cash) + '.' }));
      }
      if (shares > 0) {
        card.appendChild(quantityRow('Sell', sellAmounts(shares), c.price, 'sell'));
      }

      if (trade.qty > 0) {
        card.appendChild(confirmTrade({
          unitPrice: c.price, unit: 'share', units: 'shares',
          extraRows: function (qty, buying) {
            var after = buying ? shares + qty : shares - qty;
            var out = [['Shares after', String(after)]];
            if (c.dividend) {
              out.push(['Monthly income from these',
                money(shares * c.dividend) + '  →  ' + money(after * c.dividend)]);
            }
            return out;
          },
          onConfirm: function (qty, buying) {
            doAction(buying ? 'buyStock' : 'sellStock', { qty: qty });
          }
        }));
      } else {
        card.appendChild(errorSlot());
      }

      card.appendChild(el('div', { class: 'buttons' }, [
        el('button', { class: 'ghost', onclick: function () { doAction('pass'); }, text: 'Pass' })
      ]));
      var span = c.range[1] - c.range[0];
      var pctOfRange = span > 0 ? Math.round(((c.price - c.range[0]) / span) * 100) : 0;
      card.appendChild(el('div', {
        class: 'hint',
        text: 'At ' + money(c.price) + ', this is ' + pctOfRange + '% of the way up its ' +
          money(c.range[0]) + ' to ' + money(c.range[1]) + ' range.'
      }));
      return card;
    }

    if (c.kind === 'gold') {
      card.appendChild(terms([
        ['Price per coin', money(c.unitPrice)],
        ['Maximum', c.maxQty + ' coins'],
        ['Monthly income', 'none']
      ]));
      var maxCoins = Math.min(c.maxQty, Math.floor(state.cash / c.unitPrice));
      if (maxCoins >= 1) {
        var coinAmounts = [];
        for (var n = maxCoins; n >= 1 && coinAmounts.length < 5; n--) coinAmounts.push(n);
        card.appendChild(quantityRow('Buy', coinAmounts, c.unitPrice, 'buy'));
      } else {
        card.appendChild(el('div', { class: 'hint', text: 'One coin costs ' + money(c.unitPrice) + ' and you have ' + money(state.cash) + '.' }));
      }

      if (trade.qty > 0) {
        card.appendChild(confirmTrade({
          unitPrice: c.unitPrice, unit: 'coin', units: 'coins',
          extraRows: function () { return [['Monthly income from these', money(0)]]; },
          onConfirm: function (qty) { doAction('buyGold', { qty: qty }); }
        }));
      } else {
        card.appendChild(errorSlot());
      }

      card.appendChild(el('div', { class: 'buttons' }, [
        el('button', { class: 'ghost', onclick: function () { doAction('pass'); }, text: 'Pass' })
      ]));
      return card;
    }

    if (c.kind === 'cd') {
      card.appendChild(terms([
        ['Cost', money(c.cost)],
        ['Monthly income', money(c.cashflow)],
        ['Annual return', ((c.cashflow * 12 / c.cost) * 100).toFixed(1) + '%']
      ]));
      var cdBuy = el('button', {
        class: 'primary',
        onclick: function () { doAction('buyDeal'); },
        text: state.cash < c.cost ? 'Not enough cash' : 'Buy'
      });
      if (state.cash < c.cost) cdBuy.disabled = true;
      buttons.appendChild(cdBuy);
      card.appendChild(cardFooter(card, buttons, 'Pass'));
      return card;
    }

    if (c.kind === 'trap') {
      card.appendChild(terms([
        ['Cost', money(c.cost)],
        ['Monthly income', money(0)],
        c.addExpense ? ['Added monthly expense', money(c.addExpense)] : null,
        ['Cash now', money(state.cash)],
        ['Cash if you buy', money(state.cash - c.cost)]
      ]));
      var trapBtn = el('button', { onclick: function () { doAction('buyDeal'); }, text: 'Buy for ' + money(c.cost) });
      if (c.cost > state.cash) { trapBtn.disabled = true; trapBtn.title = 'Not enough cash'; }
      buttons.appendChild(trapBtn);
      buttons.appendChild(el('button', { onclick: function () { doAction('pass'); }, text: 'Pass' }));
      card.appendChild(errorSlot());
      card.appendChild(buttons);
      return card;
    }

    // Real estate and businesses
    var roi = c.down > 0 ? (c.cashflow * 12 / c.down) * 100 : 0;
    card.appendChild(terms([
      ['Price', money(c.cost)],
      ['Down payment', money(c.down)],
      ['Mortgage / financed', money(c.mortgage)],
      ['Monthly cash flow', money(c.cashflow)],
      ['Cash-on-cash return', roi.toFixed(1) + '% a year'],
      ['Your cash', money(state.cash)]
    ]));
    var short = Math.max(0, c.down - state.cash);
    var credit = E.availableCredit(state);
    var outOfReach = short > credit;
    /* No option on this card is highlighted: whether a deal is worth taking
     * is the judgement the player is here to practise. */
    var buyBtn = el('button', {
      class: '',
      onclick: function () { doAction('buyDeal'); },
      text: 'Buy for ' + money(c.down)
    });
    if (short > 0) buyBtn.disabled = true;
    buttons.appendChild(buyBtn);

    if (short > 0 && short <= credit) {
      buttons.appendChild(el('button', { onclick: openLoanDialog, text: 'Take a loan…' }));
    }

    card.appendChild(errorSlot());
    card.appendChild(cardFooter(card, buttons, 'Pass'));

    if (short > 0) {
      card.appendChild(el('div', {
        class: 'hint',
        text: short > credit
          ? 'You are ' + money(short) + ' short. You can borrow at most ' + money(credit) + ' more.'
          : 'You are ' + money(short) + ' short. A loan of ' + money(Math.ceil(short / 1000) * 1000) +
            ' would cover it and add ' + money(Math.ceil(short / 1000) * 100) + ' a month to your expenses.'
      }));
    }
    return card;
  }

  function cardFooter(card, buttons, passLabel) {
    buttons.appendChild(el('button', {
      class: 'ghost',
      onclick: function () { doAction('pass'); },
      text: passLabel || 'Pass'
    }));
    return buttons;
  }

  /* An expense you have to pay -- but paying is still something you do, not
   * something done to you while you watch. You see the amount, what you have,
   * and what you will have, and then you hand it over. */
  function billCard(p) {
    var after = state.cash - p.amount;
    var short = Math.max(0, p.amount - state.cash);
    var credit = E.availableCredit(state);

    var card = el('div', { class: 'card danger' }, [
      el('span', { class: 'tagline', text: 'An expense you have to pay' }),
      el('h3', { text: p.title })
    ]);
    if (p.text) card.appendChild(el('p', { text: p.text }));

    card.appendChild(terms([
      ['Amount', money(p.amount)],
      ['Cash before', money(state.cash)],
      ['Cash after', short ? money(0) : money(after)]
    ]));
    card.appendChild(errorSlot());
    card.appendChild(el('div', { class: 'buttons' }, [
      el('button', {
        class: 'primary',
        onclick: function () { doAction('payBill'); },
        text: 'Pay ' + money(p.amount)
      })
    ]));

    if (short > 0) {
      var borrow = Math.ceil(short / 1000) * 1000;
      card.appendChild(el('div', {
        class: 'hint',
        text: short <= credit
          ? 'You are ' + money(short) + ' short, so paying takes an automatic loan of ' + money(borrow) +
            ', adding ' + money(borrow / 1000 * 100) + ' a month to your expenses. You have to pay this one.'
          : 'You are ' + money(short) + ' short and can only borrow ' + money(credit) +
            ', so paying will sell whatever it has to.'
      }));
    }
    return card;
  }

  /* An expense you may accept or decline. Both options are presented the
   * same way, with the figures for each. */
  function optionalDoodadCard(p) {
    var s = E.stats(state);
    return el('div', { class: 'card' }, [
      el('span', { class: 'tagline', text: 'Accept or decline' }),
      el('h3', { text: p.title }),
      p.text ? el('p', { text: p.text }) : null,
      terms([
        ['Cost', money(p.amount)],
        ['Cash now', money(state.cash)],
        ['Cash if you buy', money(state.cash - p.amount)],
        p.addExpense ? ['Monthly expenses if you buy',
          money(s.totalExpenses) + '  →  ' + money(s.totalExpenses + p.addExpense)] : null,
        p.addExpense ? ['Monthly cash flow if you buy',
          money(s.cashflow) + '  →  ' + money(s.cashflow - p.addExpense)] : null,
        ['If you decline', 'no change']
      ]),
      errorSlot(),
      el('div', { class: 'buttons' }, [
        el('button', { onclick: function () { doAction('doodadAccept'); }, text: 'Buy for ' + money(p.amount) }),
        el('button', { onclick: function () { doAction('acknowledge'); }, text: 'Decline' })
      ])
    ]);
  }

  function simpleCard(p, yesLabel, yesAction, noLabel, cls) {
    return el('div', { class: 'card' + (cls ? ' ' + cls : ' info') }, [
      el('h3', { text: p.title }),
      el('p', { text: p.text }),
      p.amount !== undefined ? terms([['Cost', money(p.amount)], p.addExpense ? ['Added monthly expense', money(p.addExpense)] : null]) : null,
      errorSlot(),
      el('div', { class: 'buttons' }, [
        el('button', { onclick: function () { doAction(yesAction); }, text: yesLabel }),
        el('button', { onclick: function () { doAction('acknowledge'); }, text: noLabel })
      ])
    ]);
  }

  /* One compact row per offer, each stating the cash it raises and the
   * monthly income it removes. Both outcomes are shown; neither is
   * recommended. */
  function sellAssetCard(p) {
    var card = el('div', { class: 'card info' }, [
      el('h3', { text: p.title }),
      el('p', { text: p.text })
    ]);

    var offers = p.offers.slice().sort(function (a, b) { return b.netCash - a.netCash; });

    offers.forEach(function (o) {
      var gain = o.price - o.cost;
      var loss = o.netCash < 0;
      var row = el('div', { class: 'offer' + (loss ? ' loss' : '') }, [
        el('div', { class: 'offername', text: o.name }),
        el('div', { class: 'offerfacts' }, [
          el('span', { class: loss ? 'neg' : 'pos', text: (o.netCash >= 0 ? '+' : '') + money(o.netCash) + ' cash' }),
          el('span', { class: 'neg', text: '−' + money(o.cashflowLost) + '/mo income' }),
          el('span', { class: 'muted', text: (gain >= 0 ? 'gain ' : 'loss ') + money(Math.abs(gain)) + ' vs the ' + money(o.cost) + ' you paid' })
        ]),
        el('button', {
          onclick: function () { doAction('sellAsset', { assetId: o.assetId }); },
          text: 'Sell'
        })
      ]);
      card.appendChild(row);
    });

    card.appendChild(errorSlot());
    card.appendChild(el('div', { class: 'buttons' }, [
      el('button', { onclick: function () { doAction('acknowledge'); }, text: 'Sell nothing' })
    ]));
    card.appendChild(el('div', {
      class: 'hint',
      text: 'A sale raises cash once and removes that property\'s monthly income from then on.'
    }));
    return card;
  }

  function sellGoldCard(p) {
    var card = el('div', { class: 'card gold' }, [
      el('h3', { text: p.title }),
      el('p', { text: p.text }),
      terms([['Price per coin', money(p.unitPrice)], ['Coins you own', String(p.maxQty)]])
    ]);
    var amounts = [];
    for (var n = p.maxQty; n >= 1 && amounts.length < 5; n--) amounts.push(n);
    card.appendChild(quantityRow('Sell', amounts, p.unitPrice, 'sell'));

    if (trade.qty > 0) {
      card.appendChild(confirmTrade({
        unitPrice: p.unitPrice, unit: 'coin', units: 'coins',
        extraRows: function (qty) { return [['Coins left', String(p.maxQty - qty)]]; },
        onConfirm: function (qty) { doAction('sellGold', { qty: qty }); }
      }));
    } else {
      card.appendChild(errorSlot());
    }

    card.appendChild(el('div', { class: 'buttons' }, [
      el('button', { onclick: function () { doAction('acknowledge'); }, text: 'Sell none' })
    ]));
    return card;
  }

  function ftInvestmentCard(p) {
    return el('div', { class: 'card' }, [
      el('h3', { text: p.title }),
      el('p', { text: p.text }),
      terms([
        ['Cost (cash)', money(p.cost)],
        ['Monthly cash flow', money(p.cashflow)],
        ['Annual return', ((p.cashflow * 12 / p.cost) * 100).toFixed(1) + '%'],
        ['Your cash', money(state.cash)]
      ]),
      errorSlot(),
      el('div', { class: 'buttons' }, [
        el('button', { onclick: function () { doAction('buyInvestment'); }, text: 'Buy for ' + money(p.cost) }),
        el('button', { onclick: function () { doAction('acknowledge'); }, text: 'Pass' })
      ])
    ]);
  }

  function ftDreamCard(p) {
    return el('div', { class: 'card gold' }, [
      el('h3', { text: p.title }),
      el('p', { text: p.text }),
      terms([['Cost', money(p.cost)], ['Your cash', money(state.cash)]]),
      errorSlot(),
      el('div', { class: 'buttons' }, [
        el('button', { onclick: function () { doAction('buyDream'); }, text: 'Buy for ' + money(p.cost) }),
        el('button', { onclick: function () { doAction('acknowledge'); }, text: 'Not yet' })
      ])
    ]);
  }

  /* ------------------------------------------------------------------ *
   * Portfolio and bank
   * ------------------------------------------------------------------ */

  function renderAssets(host) {
    clear(host);

    /* Split by the only question that matters: does this put money in your
     * pocket every month, or does it only pay if someone later pays you more
     * for it? A flat list made a $0-dividend share look identical to an
     * eight-plex, which is the exact confusion the game exists to clear up. */
    var earning = [];
    var speculative = [];

    for (var sym in state.stocks) {
      var h = state.stocks[sym];
      var meta = D.STOCK_SYMBOLS[sym];
      var monthly = h.shares * meta.dividend;
      var row = [sym + ' — ' + meta.name, h.shares + ' shares, paid ' + money(h.invested), monthly];
      (monthly > 0 ? earning : speculative).push(row);
    }

    if (state.phase === 'fasttrack' || state.phase === 'won') {
      state.ftInvestments.forEach(function (i) {
        earning.push([i.name, money(i.cost), i.cashflow]);
      });
    }

    state.assets.forEach(function (a) {
      if (a.category === 'gold') {
        speculative.push([a.name, a.qty + ' coins, paid ' + money(a.cost), 0]);
      } else {
        var detail = money(a.cost) + (a.mortgage ? ', ' + money(a.mortgage) + ' owed' : ', owned outright');
        (a.cashflow > 0 ? earning : speculative).push([a.name, detail, a.cashflow]);
      }
    });

    if (!earning.length && !speculative.length) {
      host.appendChild(el('div', { class: 'empty', text: 'Nothing yet. Every Opportunity square is a chance to start.' }));
      return;
    }

    function section(title, rows, note) {
      if (!rows.length) return;
      var total = rows.reduce(function (sum, r) { return sum + r[2]; }, 0);
      host.appendChild(el('div', { class: 'assetgroup' }, [
        el('span', { text: title }),
        el('span', { class: total > 0 ? 'pos' : '', text: total > 0 ? money(total) + '/mo' : '' })
      ]));
      rows.forEach(function (r) {
        host.appendChild(el('div', { class: 'item' }, [
          el('span', { class: 'n', text: r[0] }),
          el('span', { class: 'm', text: r[1] }),
          el('span', { class: 'm ' + (r[2] > 0 ? 'pos' : 'muted'), text: r[2] > 0 ? money(r[2]) + '/mo' : '$0/mo' })
        ]));
      });
      if (note) host.appendChild(el('div', { class: 'hint', text: note }));
    }

    section('Producing monthly income', earning);
    section('Producing no monthly income', speculative);
  }

  /* ------------------------------------------------------------------ *
   * Loans
   *
   * Taking on debt is always a deliberate, separate act with its own dialog.
   * Buying something can never quietly create a loan -- a player who ends up
   * paying 120% a year has to have chosen to.
   * ------------------------------------------------------------------ */

  var loanAmount = 1000;

  /* One amount-picker dialog, shared by taking a loan and repaying one.
   *
   * It builds its DOM once and mutates the value and the summary in place.
   * Rebuilding the whole dialog on every step of the stepper would destroy the
   * very button the player is tapping, losing focus each time and dropping
   * fast repeat taps. */
  function amountDialog(opts) {
    var dlg = $('#money-dialog');
    var body = $('#money-dialog-body');
    var value = Math.max(opts.min, Math.min(opts.initial, opts.max));

    clear(body);
    body.appendChild(el('h2', { text: opts.title }));
    body.appendChild(el('p', { class: 'dlg-note', text: opts.note }));

    function close() { dlg.close(); }

    if (opts.max < opts.min) {
      body.appendChild(el('p', { class: 'dlg-note', text: opts.blocked }));
      body.appendChild(el('div', { class: 'dlg-actions' }, [
        el('button', { class: 'primary', onclick: close, text: 'Close' })
      ]));
      if (!dlg.open) dlg.showModal();
      return;
    }

    var valueNode = el('span', { class: 'stepval', 'aria-live': 'polite', text: money(value) });
    var summary = el('div', { class: 'terms' });
    var confirm = el('button', { class: 'primary', text: '' });

    function refresh() {
      valueNode.textContent = money(value);
      clear(summary);
      opts.summary(value).forEach(function (pair) {
        if (!pair) return;
        summary.appendChild(el('div', {}, [
          el('span', { text: pair[0] }),
          el('span', { text: pair[1] })
        ]));
      });
      confirm.textContent = opts.confirmLabel(value);
      loanAmount = value;
    }

    function bump(delta) {
      value = Math.max(opts.min, Math.min(opts.max, value + delta));
      refresh();
    }

    body.appendChild(el('div', { class: 'stepper' }, [
      el('button', { onclick: function () { bump(-opts.step); }, 'aria-label': 'Less', text: '−' }),
      valueNode,
      el('button', { onclick: function () { bump(opts.step); }, 'aria-label': 'More', text: '+' })
    ]));
    body.appendChild(el('div', { class: 'buttons quickrow' }, [
      el('button', { class: 'tiny', onclick: function () { value = opts.min; refresh(); }, text: 'Min' }),
      el('button', { class: 'tiny', onclick: function () { value = opts.max; refresh(); }, text: 'Max ' + money(opts.max) })
    ]));
    body.appendChild(summary);
    confirm.addEventListener('click', function () {
      if (opts.onConfirm(value)) close();
    });
    body.appendChild(el('div', { class: 'dlg-actions' }, [
      el('button', { class: 'ghost', onclick: close, text: 'Cancel' }),
      confirm
    ]));

    refresh();
    if (!dlg.open) dlg.showModal();
  }

  function openLoanDialog() {
    var available = E.availableCredit(state);
    var s = E.stats(state);
    amountDialog({
      title: 'Take a loan',
      note: 'Interest only: ' + money(100) + ' a month for every ' + money(1000) +
        ' borrowed, which is 120% a year. The payment continues every month until you ' +
        'repay the principal.',
      blocked: 'You have no borrowing capacity left.',
      min: 1000, max: Math.floor(available / 1000) * 1000, step: 1000,
      initial: loanAmount,
      summary: function (v) {
        var extra = (v / 1000) * 100;
        return [
          ['Cash afterwards', money(state.cash) + '  →  ' + money(state.cash + v)],
          ['Monthly expenses', money(s.totalExpenses) + '  →  ' + money(s.totalExpenses + extra)],
          ['Monthly cash flow', money(s.cashflow) + '  →  ' + money(s.cashflow - extra)]
        ];
      },
      confirmLabel: function (v) { return 'Take ' + money(v); },
      onConfirm: function (v) { return doAction('borrow', { amount: v }); }
    });
  }

  function openRepayLoanDialog() {
    var s = E.stats(state);
    var max = Math.min(state.bankLoan, Math.floor(state.cash / 1000) * 1000);
    amountDialog({
      title: 'Repay loans',
      note: 'You owe ' + money(state.bankLoan) + ', which costs ' +
        money(state.bankLoan / 1000 * 100) + ' a month. Each ' + money(1000) +
        ' repaid removes ' + money(100) + ' a month from your expenses.',
      blocked: 'You need at least ' + money(1000) + ' in cash to repay a block.',
      min: 1000, max: max, step: 1000,
      initial: loanAmount,
      summary: function (v) {
        var freed = (v / 1000) * 100;
        return [
          ['Cash afterwards', money(state.cash) + '  →  ' + money(state.cash - v)],
          ['Loans left', money(state.bankLoan) + '  →  ' + money(state.bankLoan - v)],
          ['Monthly cash flow', money(s.cashflow) + '  →  ' + money(s.cashflow + freed)]
        ];
      },
      confirmLabel: function (v) { return 'Repay ' + money(v); },
      onConfirm: function (v) { return doAction('repay', { amount: v }); }
    });
  }

  /* Consumer debts are all-or-nothing, so this one is a confirmation rather
   * than a picker: you clear the balance and the payment goes with it. */
  function openPayoffDialog(which) {
    var dlg = $('#money-dialog');
    var body = $('#money-dialog-body');
    var slot = state.profession[which];
    var s = E.stats(state);
    var name = E.LIABILITY_NAMES[which];
    var afford = slot.liability <= state.cash;

    clear(body);
    body.appendChild(el('h2', { text: 'Pay off your ' + name }));
    body.appendChild(el('p', {
      class: 'dlg-note',
      text: 'This debt can only be cleared in full. Doing so removes its ' +
        money(slot.payment) + ' monthly payment for the rest of the game.'
    }));
    body.appendChild(terms([
      ['Balance to clear', money(slot.liability)],
      ['Your cash', money(state.cash)],
      ['Cash afterwards', afford ? money(state.cash - slot.liability) : '—'],
      ['Monthly expenses', money(s.totalExpenses) + '  →  ' + money(s.totalExpenses - slot.payment)],
      ['Monthly cash flow', money(s.cashflow) + '  →  ' + money(s.cashflow + slot.payment)]
    ]));
    if (!afford) {
      body.appendChild(el('p', {
        class: 'dlg-note',
        text: 'You are ' + money(slot.liability - state.cash) + ' short of clearing it.'
      }));
    }
    body.appendChild(el('div', { class: 'dlg-actions' }, [
      el('button', { class: 'ghost', onclick: function () { dlg.close(); }, text: 'Cancel' }),
      afford ? el('button', {
        class: 'primary',
        onclick: function () {
          if (doAction('repayLiability', { which: which })) dlg.close();
        },
        text: 'Pay off ' + money(slot.liability)
      }) : null
    ]));
    if (!dlg.open) dlg.showModal();
  }


  /* A summary and one way in. Taking a loan happens in its own dialog, and
   * repaying happens from the Liabilities list beside the debt itself. */
  function renderBank() {
    var host = $('#bank');
    clear(host);

    if (state.phase !== 'ratrace') {
      host.appendChild(el('div', {
        class: 'empty',
        text: state.phase === 'bankrupt'
          ? 'No one will lend to you now.'
          : 'There are no loans on the Fast Track. Investments are bought with cash.'
      }));
      return;
    }

    var available = E.availableCredit(state);
    var owed = state.bankLoan;

    var status = el('div', { class: 'bankstatus' });
    status.appendChild(el('div', { class: 'bankline' }, [
      el('span', { text: 'You owe' }),
      el('span', {
        class: owed > 0 ? 'neg' : '',
        text: money(owed) + (owed > 0 ? '  (' + money(owed / 1000 * 100) + '/mo)' : '')
      })
    ]));
    status.appendChild(el('div', { class: 'bankline' }, [
      el('span', { text: 'You could borrow' }),
      el('span', { text: money(available) })
    ]));
    host.appendChild(status);

    var take = el('button', { onclick: openLoanDialog, text: 'Take a loan…' });
    if (available < 1000) {
      take.disabled = true;
      take.title = 'You have reached your borrowing limit of ' + money(E.creditLimit(state)) + '.';
    }
    host.appendChild(el('div', { class: 'buttons' }, [take]));
    host.appendChild(el('div', {
      class: 'hint',
      text: owed > 0
        ? 'Repay from the Liabilities list in your financial statement. Each ' +
          money(1000) + ' repaid removes ' + money(100) + ' a month.'
        : 'Interest only: ' + money(100) + ' a month per ' + money(1000) + ' borrowed, ' +
          'until the principal is repaid.'
    }));
  }

  function renderLog() {
    var host = $('#log');
    clear(host);
    for (var i = state.log.length - 1; i >= 0; i--) {
      var entry = state.log[i];
      host.appendChild(el('div', { class: entry.type }, [
        el('span', { class: 't', text: 'm' + entry.turn }),
        entry.text
      ]));
    }
  }

  function renderInvariants() {
    var problems = E.checkInvariants(state);
    var b = $('#invariant-banner');
    if (!problems.length) {
      b.classList.add('hidden');
      return;
    }
    b.classList.remove('hidden');
    b.textContent = 'Internal check failed (please report with seed ' + state.seed + '): ' + problems.join(' | ');
  }

  /* ------------------------------------------------------------------ *
   * Setup dialog
   * ------------------------------------------------------------------ */

  function openSetup() {
    var dlg = $('#setup');
    var sel = $('#prof-select');
    if (!sel.options.length) {
      D.PROFESSIONS.forEach(function (p) {
        sel.appendChild(el('option', { value: p.id, text: p.name }));
      });
      D.DREAMS.forEach(function (d) {
        $('#dream-select').appendChild(el('option', { value: d.id, text: d.name + ' - ' + money(d.cost) }));
      });
      sel.addEventListener('change', renderProfPreview);
      sel.value = 'teacher';
    }
    renderProfPreview();
    dlg.showModal();
  }

  function renderProfPreview() {
    var p = E.findById(D.PROFESSIONS, $('#prof-select').value) || D.PROFESSIONS[0];
    var expenses = p.taxes + p.home.payment + p.school.payment + p.car.payment +
      p.creditCard.payment + p.retail.payment + p.other;
    var host = $('#prof-preview');
    clear(host);
    [
      ['Salary', money(p.salary)],
      ['Total expenses', money(expenses)],
      ['Monthly cash flow', money(p.salary - expenses)],
      ['Savings to start', money(p.savings)],
      ['Cost per child', money(p.childCost) + ' / month']
    ].forEach(function (r) {
      host.appendChild(el('div', {}, [el('span', { text: r[0] }), el('span', { text: r[1] })]));
    });
  }

  function startGame() {
    if (state && !E.isOver(state) && state.months > 0 &&
        !window.confirm('Abandon the current game at month ' + state.months + '?')) {
      return;
    }
    var seedRaw = $('#seed-input').value.trim();
    state = E.createGame({
      seed: seedRaw === '' ? null : seedRaw,
      professionId: $('#prof-select').value,
      dreamId: $('#dream-select').value
    });
    undoStack = [];
    lastPendingKey = null;
    $('#setup').close();
    renderBank();
    render();
    settleToken();
  }

  /* ------------------------------------------------------------------ *
   * Save / load
   * ------------------------------------------------------------------ */

  function exportGame() {
    var blob = new Blob([E.serialize(state)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: 'cashflow-seed-' + state.seed + '-month-' + state.months + '.json' });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importGame(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        state = E.deserialize(String(reader.result));
        undoStack = [];
        lastPendingKey = null;
        $('#setup').close();
        renderBank();
        render();
      } catch (e) {
        showBanner('Could not import: ' + e.message);
      }
    };
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------------ *
   * Wiring
   * ------------------------------------------------------------------ */

  function init() {
    $('#new-btn').addEventListener('click', openSetup);
    $('#undo-btn').addEventListener('click', undo);
    $('#export-btn').addEventListener('click', exportGame);
    $('#import-input').addEventListener('change', function (e) {
      if (e.target.files[0]) importGame(e.target.files[0]);
      e.target.value = '';
    });
    $('#start-btn').addEventListener('click', function (e) { e.preventDefault(); startGame(); });
    $('#random-seed-btn').addEventListener('click', function (e) {
      e.preventDefault();
      $('#seed-input').value = String(window.CF.randomSeed());
    });

    /* Keep the token glued to its square whenever the board moves under it.
     *
     * A window-resize listener is not enough: the board is centred, so it also
     * shifts sideways when a scrollbar appears because the page grew — which
     * happens constantly as cards come and go. ResizeObserver catches every
     * cause, including font loading and panel reflow. */
    if (window.ResizeObserver) {
      var reposition = function () { if (state && !moving) placeToken(tokenAt, false); };
      var ro = new ResizeObserver(reposition);
      /* Watch the WRAPPER, not just the board. The board is capped at a fixed
       * max-width and centred, so when a scrollbar appears the board's size
       * does not change at all -- only its left offset does, and a
       * size-only observer never fires. The wrapper does change width. */
      ro.observe($('#board-wrap'));
      ro.observe($('#board'));
    }
    window.addEventListener('resize', function () {
      if (state && !moving) placeToken(tokenAt, false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'r' && state && E.canRoll(state)) {
        doRoll(E.diceOptions(state)[0]);
      } else if (e.key === 'u') {
        undo();
      }
    });

    // Resume automatically if a save exists, otherwise open setup.
    var existing = null;
    try { existing = localStorage.getItem(SAVE_KEY); } catch (e) { /* private mode */ }
    if (existing) {
      try {
        state = E.deserialize(existing);
        renderBank();
        render();
        settleToken();
        return;
      } catch (e) { /* fall through to setup */ }
    }
    openSetup();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
