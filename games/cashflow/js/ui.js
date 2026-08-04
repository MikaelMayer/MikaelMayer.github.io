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
    DOODAD: 'Doodad',
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
    DOODAD: 'An unplanned expense. Some are bills you simply have to pay — a car repair, a dentist. The expensive ones are luxuries, and you can always turn those down at no cost. This is where most of a paycheque quietly goes.',
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
    squareInfo = null;
    snapshot();
    beginTurn();
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
    render();
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
      renderAssets();
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
        class: 'sq ' + type + (i === pos ? ' here' : '') + (mine ? ' mine' : ''),
        style: 'grid-row:' + cell[0] + ';grid-column:' + cell[1],
        title: explains ? label + ' — tap to see what this square does' : label,
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
      if (i === pos) node.appendChild(el('span', { class: 'pawn' }));
      wrap.appendChild(node);
    }

    wrap.appendChild(renderBoardCentre(n));
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
      state.lastRoll.forEach(function (d) { dice.appendChild(el('div', { class: 'die', text: String(d) })); });
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
      head.appendChild(box('Passive income', money(s.passiveIncome), 'hero',
        gap > 0 ? money(gap) + ' short' : 'you are clear'));
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

    var p = s.expenseParts;
    st.appendChild(group('Expenses', [
      row('Taxes', money(p.taxes), true),
      row('Home mortgage', money(p.home), true),
      p.school ? row('School loan', money(p.school), true) : null,
      row('Car loan', money(p.car), true),
      row('Credit cards', money(p.creditCard), true),
      row('Retail', money(p.retail), true),
      row('Other', money(p.other), true),
      row('Children (' + state.children + ')', money(p.children), true),
      row('Loans', money(p.bankLoan), true),
      row('Total expenses', money(s.totalExpenses), false, true)
    ]));

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

    liabilities.appendChild(liabilityRow(
      'Loans', state.bankLoan, p.bankLoan,
      state.bankLoan > 0 ? openRepayLoanDialog : null,
      state.cash < 1000
    ));

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
          ' a month. That is the number that ends the Rat Race.'
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
        el('button', { class: 'primary', onclick: function () { doAction('chooseDeck', { deck: 'small' }); }, text: 'Small Deal' }),
        el('button', { class: 'primary', onclick: function () { doAction('chooseDeck', { deck: 'big' }); }, text: 'Big Deal' })
      ]),
      el('div', { class: 'hint', text: 'You may always look at a deal and then decline it. Deals cost nothing to read.' })
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

  function quantityRow(label, amounts, unitPrice, onPick) {
    var row = el('div', { class: 'qtyrow' }, [el('span', { class: 'qtylabel', text: label })]);
    amounts.forEach(function (n, i) {
      row.appendChild(el('button', {
        class: i === 0 ? 'primary' : '',
        onclick: function () { onPick(n); },
        title: label + ' ' + n + ' for ' + money(n * unitPrice)
      }, [
        el('span', { class: 'qty', text: (i === 0 ? (label === 'Sell' ? 'All ' : 'Max ') : '') + n }),
        el('span', { class: 'qtycost', text: money(n * unitPrice) })
      ]));
    });
    return row;
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
    var card = el('div', { class: 'card' + (c.kind === 'trap' ? ' danger' : '') }, [
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
        card.appendChild(quantityRow('Buy', buyAmounts(maxBuy), c.price, function (n) {
          doAction('buyStock', { qty: n });
        }));
      } else {
        card.appendChild(el('div', { class: 'hint', text: 'One share costs ' + money(c.price) + ' and you have ' + money(state.cash) + '.' }));
      }
      if (shares > 0) {
        card.appendChild(quantityRow('Sell', sellAmounts(shares), c.price, function (n) {
          doAction('sellStock', { qty: n });
        }));
      }
      card.appendChild(errorSlot());
      card.appendChild(el('div', { class: 'buttons' }, [
        el('button', { class: 'ghost', onclick: function () { doAction('pass'); }, text: 'Pass' })
      ]));
      if (c.price >= c.range[1] * 0.8) {
        card.appendChild(el('div', { class: 'hint', text: 'This price is near the top of its range. A good moment to sell, a poor one to buy.' }));
      } else if (c.price <= c.range[0] * 1.5) {
        card.appendChild(el('div', { class: 'hint', text: 'This price is near the bottom of its range. A good moment to buy, if you can hold it.' }));
      }
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
        card.appendChild(quantityRow('Buy', coinAmounts, c.unitPrice, function (q) {
          doAction('buyGold', { qty: q });
        }));
      } else {
        card.appendChild(el('div', { class: 'hint', text: 'One coin costs ' + money(c.unitPrice) + ' and you have ' + money(state.cash) + '.' }));
      }
      card.appendChild(errorSlot());
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
        c.addExpense ? ['Added monthly expense', money(c.addExpense)] : null
      ]));
      /* Refusing is the right answer and gets the primary button, exactly as
       * on the optional-doodad card. These two cards teach the same lesson and
       * used to give opposite visual instructions. */
      buttons.appendChild(el('button', { class: 'primary', onclick: function () { doAction('pass'); }, text: 'Walk away' }));
      var trapBtn = el('button', { class: 'ghost', onclick: function () { doAction('buyDeal'); }, text: 'Do it anyway' });
      if (c.cost > state.cash) { trapBtn.disabled = true; trapBtn.title = 'Not enough cash'; }
      buttons.appendChild(trapBtn);
      card.appendChild(errorSlot());
      card.appendChild(buttons);
      card.appendChild(el('div', { class: 'hint', text: 'Money out, nothing coming back. An asset puts money in your pocket; this does the opposite.' }));
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
    /* Buy is green only when you can actually pay for it. A deal you cannot
     * afford must not look like the obvious next tap. */
    var buyBtn = el('button', {
      class: short > 0 ? '' : 'primary',
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
          ? 'You are ' + money(short) + ' short, and you could only borrow another ' +
            money(credit) + '. This one is out of reach today.'
          : 'You are ' + money(short) + ' short. You could take a loan to cover it — but a loan ' +
            'costs ' + money(100) + ' a month for every ' + money(1000) + ', every month until you ' +
            'repay it, and that comes straight off the cash flow this deal is meant to add.'
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

  /* A doodad you may refuse. The refusal is the lesson, so it gets equal
   * billing with the purchase rather than being a quiet "no thanks" link. */
  function optionalDoodadCard(p) {
    return el('div', { class: 'card danger' }, [
      el('span', { class: 'tagline', text: 'Your choice — you may refuse this' }),
      el('h3', { text: p.title }),
      el('p', { text: p.text }),
      terms([
        ['Cost', money(p.amount)],
        ['Your cash', money(state.cash)],
        p.addExpense ? ['Added monthly expense', money(p.addExpense) + ' forever'] : null
      ]),
      errorSlot(),
      el('div', { class: 'buttons' }, [
        el('button', { class: 'primary', onclick: function () { doAction('acknowledge'); }, text: 'No thanks' }),
        el('button', { onclick: function () { doAction('doodadAccept'); }, text: 'Buy it (' + money(p.amount) + ')' })
      ]),
      el('div', { class: 'hint', text: 'Refusing costs you nothing. That is the whole point of this square.' })
    ]);
  }

  function simpleCard(p, yesLabel, yesAction, noLabel, cls) {
    return el('div', { class: 'card' + (cls ? ' ' + cls : ' info') }, [
      el('h3', { text: p.title }),
      el('p', { text: p.text }),
      p.amount !== undefined ? terms([['Cost', money(p.amount)], p.addExpense ? ['Added monthly expense', money(p.addExpense)] : null]) : null,
      errorSlot(),
      el('div', { class: 'buttons' }, [
        el('button', { class: 'primary', onclick: function () { doAction(yesAction); }, text: yesLabel }),
        el('button', { class: 'ghost', onclick: function () { doAction('acknowledge'); }, text: noLabel })
      ])
    ]);
  }

  /* Keeping is the default and gets the primary button. Selling is
   * irreversible, lowers the number that wins, and every row spells out what
   * it costs you in monthly income before you can tap it.
   *
   * One compact row per offer rather than a six-row table each: with four
   * houses the old card was 24 term rows and five buttons, and after a sale
   * the card reflowed shorter so the next Sell button landed under the finger
   * that had just tapped one. */
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
          class: loss ? 'danger-btn' : '',
          onclick: function () { doAction('sellAsset', { assetId: o.assetId }); },
          text: loss ? 'Sell at a loss' : 'Sell'
        })
      ]);
      card.appendChild(row);
    });

    card.appendChild(errorSlot());
    card.appendChild(el('div', { class: 'buttons' }, [
      el('button', { class: 'primary', onclick: function () { doAction('acknowledge'); }, text: 'Keep everything' })
    ]));
    card.appendChild(el('div', {
      class: 'hint',
      text: 'A lump sum is not the same as income. Selling raises cash but lowers the number that gets you out of the Rat Race.'
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
    card.appendChild(quantityRow('Sell', amounts, p.unitPrice, function (q) {
      doAction('sellGold', { qty: q });
    }));
    card.appendChild(errorSlot());
    card.appendChild(el('div', { class: 'buttons' }, [
      el('button', { class: 'primary', onclick: function () { doAction('acknowledge'); }, text: 'Hold' })
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
        el('button', { class: 'primary', onclick: function () { doAction('buyInvestment'); }, text: 'Buy' }),
        el('button', { class: 'ghost', onclick: function () { doAction('acknowledge'); }, text: 'Pass' })
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
        el('button', { class: 'primary', onclick: function () { doAction('buyDream'); }, text: 'Buy my dream' }),
        el('button', { class: 'ghost', onclick: function () { doAction('acknowledge'); }, text: 'Not yet' })
      ])
    ]);
  }

  /* ------------------------------------------------------------------ *
   * Portfolio and bank
   * ------------------------------------------------------------------ */

  function renderAssets() {
    var host = $('#assets');
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

    section('Paying you every month', earning);
    section('Pays nothing until you sell it', speculative,
      'These only pay off if someone later pays you more than you did.');
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
      note: 'Loans are interest only. You pay ' + money(100) + ' a month for every ' +
        money(1000) + ' you borrow — 120% a year — and you keep paying it every single ' +
        'month until you repay the principal. Nothing else in this game costs that much.',
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
      note: 'You owe ' + money(state.bankLoan) + ', which costs you ' +
        money(state.bankLoan / 1000 * 100) + ' every month. Every ' + money(1000) +
        ' you clear gives you ' + money(100) + ' a month back, for good.',
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
      text: 'Clearing a debt is all or nothing, and it removes the monthly payment for ' +
        'the rest of the game — a guaranteed ' + money(slot.payment) + ' a month back, for good.'
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
        ? 'Repay loans from the Liabilities list in your financial statement. Every ' +
          money(1000) + ' you clear gives you back ' + money(100) + ' a month.'
        : 'Interest only: ' + money(100) + ' a month for every ' + money(1000) +
          ' borrowed, every month until you repay it.'
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
        return;
      } catch (e) { /* fall through to setup */ }
    }
    openSetup();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
