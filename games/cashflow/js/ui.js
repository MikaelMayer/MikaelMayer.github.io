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
  var T = window.CF.i18n;
  var t = T.t;
  var money = T.money;
  var pct = T.pct;   // locale-aware: $1,000 or 1 000 $

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
    OPPORTUNITY: 'Deal',
    PAYDAY: 'PAYDAY',
    MARKET: 'Market',
    DOODAD: 'Expense',
    CHARITY: 'Charity',
    BABY: 'Baby',
    DOWNSIZED: 'Downsized'
  };

  // Only the squares whose names do not fit a small cell need an alias.
  var SQUARE_SHORT = {
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

  /* Tap a term, get the term explained. Same gesture as tapping a board
   * square, and the explanation lands in the same place, so there is one idea
   * to learn rather than two.
   *
   * These describe the SYSTEM, never the move. "Passive income comes from
   * rent, dividends, interest and business profit" is a rule; "buy this
   * 8-plex" would be advice, and the player is here to work that out. */
  var TERM_HELP = {
    'Passive income': 'Money that arrives whether or not you go to work: rent from property, dividends from shares, interest, and profit from businesses you own. Your salary is not passive income. When this figure passes your total expenses, you are out of the Rat Race.',
    'Total expenses': 'Everything you must pay every month: taxes, the payment on each debt, living costs, the cost of any children, and interest on loans you have taken. Clearing a debt in full removes its payment from this figure permanently.',
    'Cash': 'Money on hand. You buy with it and bills come out of it. It is not income: a large cash balance does not by itself bring you any closer to leaving the Rat Race.',
    'Monthly cash flow': 'Total income minus total expenses. This is the amount you collect each time you pass a PAYDAY square. It includes your salary, which is why it is not the figure that ends the Rat Race.',
    'Total income': 'Your salary plus your passive income.',
    'Salary': 'What your profession pays each month. It stops if you stop working, so it does not count towards leaving the Rat Race.',
    'Interest / dividends': 'Monthly income from shares that pay a dividend, and from certificates of deposit.',
    'Real estate': 'The combined monthly cash flow of the properties you own, after their mortgage payments are deducted.',
    'Business': 'The combined monthly income of the businesses you own.',
    'Assets': 'What you own. Some of it pays you every month; some of it pays nothing until you sell it for more than you paid.',
    'Liabilities': 'What you owe. Each one has a matching monthly payment in the Expenses list. Paying a debt off in full removes that payment for the rest of the game.',
    'Loans': 'Money you have borrowed. Every $1,000 costs $100 a month, every month, until you repay the principal.',
    'Taxes': 'Deducted from your salary every month. It does not change as you play.',
    'Cash Flow Day income': 'What you collect each time you pass or land on a Cash Flow Day square: the income you carried out of the Rat Race, plus anything the investments you have bought here produce.'
  };

  /* An explainer is { title, body: [paragraph, ...] }, so the same card can
   * show a fixed glossary entry or one generated from the player's own
   * figures -- how a percentage was computed, what a particular debt would
   * cost to clear. */
  var termInfo = null;

  function explain(title, body, tagline) {
    squareInfo = null;
    termInfo = { title: title, body: body.filter(Boolean), tagline: tagline || t('Financial term') };
    render();
  }

  function closeExplain() {
    termInfo = null;
    squareInfo = null;
    var dlg = $('#explain');
    if (dlg && dlg.open) dlg.close();
  }

  /* Fills the dialog and opens it, or closes it when there is nothing to
   * explain. Called from render(), so it has to tolerate being called
   * repeatedly while already open. */
  function renderExplain() {
    var dlg = $('#explain');
    if (!dlg) return;
    var info = termInfo || squareInfo;
    if (!info) {
      if (dlg.open) dlg.close();
      return;
    }

    var host = $('#explain-body');
    clear(host);
    host.appendChild(el('span', { class: 'tagline', text: info.tagline }));
    host.appendChild(el('h3', { id: 'explain-title', text: info.title }));
    info.body.forEach(function (para) {
      host.appendChild(el('p', { text: para }));
    });
    host.appendChild(el('div', { class: 'dlg-actions' }, [
      el('button', { class: 'primary', onclick: closeExplain, text: t('Close') })
    ]));

    if (!dlg.open) {
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
      if (!dlg._wired) {
        // Esc and backdrop clicks close the dialog without going through the
        // button, so the state they leave behind has to be cleared too.
        dlg.addEventListener('close', function () { termInfo = null; squareInfo = null; });
        dlg.addEventListener('click', function (e) { if (e.target === dlg) closeExplain(); });
        dlg._wired = true;
      }
    }
  }

  /* Wraps a label in a button when we have something to say about it, and
   * leaves it as plain text when we do not -- so nothing looks tappable
   * unless it is. */
  function term(label) {
    if (!TERM_HELP[label]) return t(label);
    var b = el('button', {
      class: 'term',
      onclick: function () { explain(t(label), [t(TERM_HELP[label])]); },
      title: t('What does this mean?')
    }, [t(label)]);
    b.type = 'button';
    return b;
  }

  /* An annual rate makes debts comparable. A mortgage at 11% and a retail
   * account at 60% look identical as monthly payments; as percentages they
   * do not. Computed, not stored: payment x 12 / balance. */
  function annualRate(payment, balance) {
    if (!payment || !balance) return null;
    return (payment * 12 / balance) * 100;
  }

  function rateText(payment, balance) {
    var r = annualRate(payment, balance);
    return r === null ? '' : t('{pct}%/yr', { pct: pct(r, r < 10 ? 1 : 0) });
  }

  /* Every expense line explains what it is and how, or whether, it ends.
   * Stating that a debt can be cleared is a rule of the game; which debt to
   * clear first is the player's problem. */
  function explainExpense(key, label, amount) {
    var slot = state.profession[key];
    var body = [];

    if (key === 'taxes') {
      body.push(t('Deducted from your salary every month. It does not change as you play and cannot be removed.'));
    } else if (key === 'other') {
      body.push(t('Day-to-day living costs, plus the monthly cost of anything you accepted that carried one. Living costs cannot be removed.'));
    } else if (key === 'children') {
      body.push(t('Each child costs {$each} a month for the rest of the game. This cannot be removed.',
        { each: state.profession.childCost }));
    } else if (key === 'loans') {
      body.push(t('Interest on money you have borrowed: {$per} a month for every {$unit}.', { per: 100, unit: 1000 }));
      body.push(t('Repay the principal from the Liabilities list below. Every {$unit} you repay removes {$per} a month.', { unit: 1000, per: 100 }));
      body.push(t('You currently owe {$owed}.', { owed: state.bankLoan }));
    } else if (slot) {
      var rate = annualRate(slot.payment, slot.liability);
      body.push(t('The monthly payment on this debt. The balance is {$balance}, so the payment is costing you about {pct}% a year.',
        { balance: slot.liability, pct: rate === null ? 0 : pct(rate, rate < 10 ? 1 : 0) }));
      body.push(t('Pay the {$balance} off in full from the Liabilities list below and this line disappears for the rest of the game. Debts cannot be part-paid.',
        { balance: slot.liability }));
    }
    body.push(t('It is part of the {$total} you must cover every month.', { total: E.stats(state).totalExpenses }));
    explain(label, body);
  }

  var squareInfo = null;

  function explainSquare(type) {
    termInfo = null;
    squareInfo = {
      title: t(SQUARE_LABEL[type]),
      body: [t(SQUARE_HELP[type])],
      tagline: t('Board square')
    };
    render();
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
      if (entry.type === 'rules') continue;         // explained in its own dialog
      receipt.entries.push(entry);
    }
  }

  /* Returns something renderable later rather than a finished string: a
   * translation key for a board square, or a content id for a Fast Track
   * square. Resolving at capture time froze the receipt in whichever language
   * the turn happened in, so switching language left "Marche" sitting above
   * English text. */
  function currentSquare() {
    if (state.phase === 'fasttrack' || state.phase === 'won') {
      var sq = D.FAST_TRACK_BOARD[state.ftPosition];
      if (sq.type === 'INVESTMENT') return { investment: sq.investment };
      if (sq.type === 'DREAM') return { dream: sq.dream };
      return { label: sq.label || sq.type };
    }
    var type = D.RAT_RACE_BOARD[state.position];
    var key = SQUARE_LABEL[type];
    return key ? { key: key, type: type } : null;
  }

  function squareText(sq) {
    if (!sq) return '';
    if (sq.key) return t(sq.key);
    if (sq.investment) return T.field(E.findById(D.FT_INVESTMENTS, sq.investment), 'name');
    if (sq.dream) return T.field(E.findById(D.DREAMS, sq.dream), 'name');
    return sq.label ? T.maybe(sq.label) : '';
  }

  function doAction(type, payload) {
    snapshot();
    var mark = state.log.length;
    var phaseBefore = state.phase;
    var res = E.act(state, type, payload);
    if (!res.ok) {
      undoStack.pop();          // nothing changed, so nothing to undo
      cardError = res.k ? t(res.k, res.p) : res.error;
      render();
      return false;
    }
    cardError = null;
    recordSince(mark);
    render();
    if (phaseBefore === 'ratrace' && state.phase === 'fasttrack') openFastTrackDialog();
    return true;
  }

  function doRoll(dice) {
    if (moving) return;                 // ignore taps while the token is walking
    squareInfo = null;
    termInfo = null;
    snapshot();
    beginTurn();
    var phaseBefore = state.phase;
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
    receipt.square = currentSquare();

    var to = (state.phase === 'fasttrack' || state.phase === 'won') ? state.ftPosition : state.position;
    var entered = phaseBefore === 'ratrace' && state.phase === 'fasttrack';
    // Draw the board first so the squares and the dice exist.
    moving = true;
    render();
    tumbleDice(state.lastRoll || [], function () {
      moving = false;
      if (to !== from && !E.isOver(state) && !entered) {
        // Walk the token across the squares, then redraw so the landing
        // square lights up.
        walkToken(from, to, render);
      } else {
        render();
        if (entered) openFastTrackDialog();
      }
    });
  }

  /* Which finished game has already been announced, so a redraw does not
   * reopen the dialog every time the statement is touched. */
  var announced = null;

  function maybeAnnounceEnd() {
    if (!E.isOver(state)) { announced = null; return; }
    var key = state.seed + ':' + state.months + ':' + state.phase;
    if (announced === key) return;
    announced = key;
    openEndDialog();
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
      // Before anything draws: the end-of-game card reports this total.
      if (state.phase === 'fasttrack' || state.phase === 'won') awardStar(state.profession.id);
      renderHeader();
      renderBoard();
      renderStatement();
      renderPending();
      renderBank();
      renderLog();
      renderInvariants();
      renderExplain();
      maybeAnnounceEnd();
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
        label = t(SQUARE_LABEL[type]);
        short = SQUARE_SHORT[type] ? t(SQUARE_SHORT[type]) : label;
      } else if (type === 'INVESTMENT') {
        var inv = E.findById(D.FT_INVESTMENTS, sq.investment);
        label = T.field(inv, 'name');
        short = T.field(inv, 'short') || T.field(inv, 'name');
      } else if (type === 'DREAM') {
        var dr = E.findById(D.DREAMS, sq.dream);
        mine = dr.id === state.dream.id;
        label = (mine ? '★ ' : '') + T.field(dr, 'name');
        short = (mine ? '★ ' : '') + (T.field(dr, 'short') || T.field(dr, 'name'));
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
        (function (ty) { node.addEventListener('click', function () { explainSquare(ty); }); })(type);
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

    /* Sit in the bottom-right corner, sized against the square, rather than
     * dead centre. A token in the middle covers the one thing the square is
     * there to tell you -- its name. */
    var size = Math.max(9, Math.min(18, sqRect.width * 0.32));
    token.style.width = size + 'px';
    token.style.height = size + 'px';

    var inset = size / 2 + 1;
    var x = sqRect.left - wrapRect.left + sqRect.width - inset;
    var y = sqRect.top - wrapRect.top + sqRect.height - inset;

    token.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px) translate(-50%,-50%)';
    tokenAt = index;
  }

  /* A die that simply appears showing 4 has not been rolled; it has been
   * assigned. Tumbling it for about a second, settling, and only then moving
   * the token separates the two events -- what you rolled, and what it did to
   * you -- which are otherwise a single instantaneous jump.
   *
   * This randomness is presentation only. It never touches state.rngState, so
   * a seed still reproduces the game exactly. */
  function tumbleDice(faces, done) {
    var host = document.querySelector('#board .dice');
    if (!host || prefersReducedMotion()) { done(); return; }

    function paint(values) {
      clear(host);
      values.forEach(function (v) { host.appendChild(dieFace(v)); });
    }

    host.classList.add('rolling');
    var duration = 600 + Math.floor(Math.random() * 400);   // 0.6s - 1.0s
    var started = Date.now();
    var timer = setInterval(function () {
      if (Date.now() - started >= duration) {
        clearInterval(timer);
        host.classList.remove('rolling');
        paint(faces);                       // the face that actually counts
        setTimeout(done, 500);              // let it register before anything moves
        return;
      }
      paint(faces.map(function () { return 1 + Math.floor(Math.random() * 6); }));
    }, 70);
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function walkToken(from, to, done) {
    var len = boardLength();
    var steps = (to - from + len) % len;
    if (steps === 0 || prefersReducedMotion()) {
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
  /* Money going round, not money going up: a ring with two gaps and two
   * arrowheads, with the coin it moves in the middle. Inline so it works
   * offline from a file:// URL, and vector so it is sharp at every size. */
  var LOGO_SVG = "<svg class=\"mark\" viewBox=\"0 0 100 100\" aria-hidden=\"true\" focusable=\"false\"><g fill=\"none\" stroke=\"currentColor\" stroke-width=\"9\" stroke-linecap=\"butt\"><path d=\"M 82.8 41.2 A 34 34 0 0 0 22.1 30.5\"/><path d=\"M 17.2 58.8 A 34 34 0 0 0 77.9 69.5\"/></g><g fill=\"currentColor\"><path d=\"M 18.5 37.3 L 19.1 20.1 L 32.0 32.6 Z\"/><path d=\"M 81.5 62.7 L 80.9 79.9 L 68.0 67.4 Z\"/></g><circle cx=\"50\" cy=\"50\" r=\"15\" fill=\"currentColor\" opacity=\".16\"/><circle cx=\"50\" cy=\"50\" r=\"15\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"4\"/><circle cx=\"50\" cy=\"50\" r=\"6.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\"/></svg>";

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
      centre.appendChild(el('div', { class: 'big', text: t('You win') }));
      centre.appendChild(el('div', {
        class: 'sub',
        text: t(state.result.how === 'dream' ? 'Dream bought in {months} months.' : 'Fast Track income goal reached in {months} months.', { months: state.result.months })
      }));
      centre.appendChild(el('button', { class: 'primary', onclick: openSetup, text: t('Play again') }));
      return centre;
    }

    if (state.phase === 'bankrupt') {
      centre.appendChild(el('div', { class: 'big neg', text: t('Bankrupt') }));
      centre.appendChild(el('div', { class: 'sub', text: t('Month {n}.', { n: state.result.months }) }));
      centre.appendChild(el('button', { class: 'primary', onclick: openSetup, text: t('New game') }));
      return centre;
    }

    /* The centre of the board is not a second financial statement.
     *
     * It used to repeat passive income, the gap and a bare percentage, all of
     * which live in the statement where the numbers belong. What is left here
     * is what only the board can say: which month it is, what you just rolled,
     * and any temporary state you are under. */
    if (state.phase === 'ratrace' || state.phase === 'fasttrack') {
      var logo = el('div', { class: 'logo' });
      logo.innerHTML = LOGO_SVG;
      logo.appendChild(el('div', { class: 'wordmark' }, [
        el('span', { class: 'logo-cash', text: 'CASH' }),
        el('span', { class: 'logo-flow', text: 'FLOW' })
      ]));
      centre.appendChild(logo);
      centre.appendChild(statusChips());
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
        text: state.charityTurns > 1
          ? t('Dice choice: this turn and {n} more', { n: state.charityTurns - 1 })
          : t('Dice choice: this turn')
      }));
    }
    if (state.skipTurns > 0) {
      wrap.appendChild(el('span', { class: 'chip bad', text: state.skipTurns > 1
        ? t('Out of work: {n} turns lost', { n: state.skipTurns })
        : t('Out of work: {n} turn lost', { n: state.skipTurns }) }));
    }
    /* Children and loans are not chips: both have their own line in the
     * statement, and repeating them here was part of what made the middle of
     * the board feel like a duplicate sheet. Only temporary states appear. */
    return wrap;
  }

  function renderStatement() {
    var s = E.stats(state);
    var head = $('#headline');
    clear(head);

    function box(k, v, cls, sub) {
      var b = el('div', { class: 'box' + (cls === 'hero' ? ' hero' : '') }, [
        el('div', { class: 'k' }, [termFor(k)])
      ]);
      var val = el('div', { class: 'v' + (cls && cls !== 'hero' ? ' ' + cls : '') });
      val.appendChild(typeof v === 'string' ? document.createTextNode(v) : v);
      b.appendChild(val);
      if (sub) b.appendChild(el('div', { class: 'boxsub', text: sub }));
      return b;
    }

    if (state.phase === 'fasttrack' || state.phase === 'won') {
      var f = E.ftStats(state);
      var ftGoal = E.fastTrackGoal(state);
      head.appendChild(box(t('Cash'), money(state.cash),
        state.cash >= state.dream.cost ? 'hero' : null,
        state.cash >= state.dream.cost
          ? t('enough for your dream')
          : t('{$gap} short of your dream', { gap: state.dream.cost - state.cash })));
      /* Two ways to win, two boxes, and this is the one you can measure
       * progress along. Landing on your dream is a matter of the dice; adding
       * income is a matter of what you buy. */
      var ftBox = box(t('Cash Flow Day'), money(f.totalIncome), 'hero',
        f.addedIncome >= ftGoal
          ? t('You have added enough to win')
          : t('{$gap} of new income until you win', { gap: ftGoal - f.addedIncome }));
      ftBox.className += ' wide';

      var ftPct = ftGoal > 0
        ? Math.min(100, (f.addedIncome / ftGoal) * 100) : 0;
      var ftBar = el('div', {
        class: 'progress inbox', role: 'progressbar',
        'aria-valuemin': '0', 'aria-valuemax': String(ftGoal),
        'aria-valuenow': String(f.addedIncome),
        'aria-valuetext': t('{$added} of {$goal} new income', { added: f.addedIncome, goal: ftGoal })
      });
      ftBar.appendChild(el('i', { style: 'width:' + ftPct.toFixed(1) + '%' }));
      ftBox.appendChild(ftBar);
      ftBox.appendChild(el('div', { class: 'barends' }, [
        el('span', { text: money(f.addedIncome) }),
        el('span', { text: t('the {$goal} of new income you need', { goal: ftGoal }) })
      ]));
      head.appendChild(ftBox);
    } else {
      /* The win condition, side by side, as the first thing in the panel --
       * because "passive income vs total expenses" IS the game, and it used to
       * be a 13px grey subline while cash flow got two large displays. */
      var gap = s.totalExpenses - s.passiveIncome;
      /* Distance to the goal, named by its destination rather than by what is
       * missing. "$950 short" and "$950 until financial freedom" are the same
       * arithmetic; only one of them reads as a failure. */
      var passiveBox = box(t('Passive income'), money(s.passiveIncome), 'hero',
        gap > 0 ? t('{$gap} until financial freedom', { gap: gap })
                : t('You are financially free'));
      passiveBox.className += ' wide';

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

      /* The ends of the bar say what the ends mean. A bare percentage did not
       * say what it was a percentage of, which is exactly what made it
       * unreadable. */
      /* The right end of the bar names the target, which is what the removed
       * "Total expenses" box used to say and the only thing it contributed. */
      passiveBox.appendChild(el('div', { class: 'barends' }, [
        el('span', { text: money(0) }),
        el('span', { text: t('your {$total} of monthly expenses', { total: s.totalExpenses }) })
      ]));
      head.appendChild(passiveBox);
      head.appendChild(box(t('Cash'), money(state.cash)));
      head.appendChild(box(t('Monthly cash flow'), signed(s.cashflow), null, t('Income minus expenses, monthly')));
    }

    var st = $('#statement');
    clear(st);

    if (state.phase === 'fasttrack' || state.phase === 'won') {
      var ft = E.ftStats(state);
      var goal = E.fastTrackGoal(state);

      st.appendChild(group(t('Cash Flow Day income'), [
        row(t('Carried from the Rat Race'), money(ft.baseIncome), true),
        row(t('From investments bought here'), money(ft.investmentIncome), true),
        row(t('Total per Cash Flow Day'), money(ft.totalIncome), false, true)
      ]));

      /* The Rat Race portfolio is not shown here: it no longer produces
       * anything on its own, it was converted into the income above, and
       * listing it again reads as though it were still working for you. */
      var inv = el('div', { class: 'group assets' }, [
        el('div', { class: 'row' }, [el('span', { class: 'label', text: t('Investments') })])
      ]);
      if (!state.ftInvestments.length) {
        inv.appendChild(el('div', { class: 'empty', text: t('None yet. Land on an investment square to buy one.') }));
      } else {
        state.ftInvestments.forEach(function (i) {
          inv.appendChild(el('div', { class: 'item' }, [
            el('span', { class: 'n', text: T.field(i, 'name') }),
            el('span', { class: 'm', text: money(i.cost) }),
            el('span', { class: 'm pos', text: t('{$amount}/mo', { amount: i.cashflow }) })
          ]));
        });
      }
      st.appendChild(inv);

      /* The dream name is a sentence, not a label, so it gets a row that lets
       * it wrap. A plain terms row pins its value to one line and squeezes the
       * label into a column one character wide. */
      var win = el('div', { class: 'group' }, [
        el('div', { class: 'row' }, [el('span', { class: 'label', text: t('Two ways to win') })])
      ]);
      win.appendChild(el('div', { class: 'winline' }, [
        el('span', { class: 'winname', text: '★ ' + T.field(state.dream, 'name') }),
        el('span', { class: 'winval', text: money(state.dream.cost) })
      ]));
      win.appendChild(row(t('\u00a0\u00a0cash needed'),
        state.cash >= state.dream.cost ? t('you can afford it')
          : t('{$amount} more', { amount: state.dream.cost - state.cash }), true));
      win.appendChild(el('div', { class: 'winline' }, [
        el('span', { class: 'winname', text: t('or new investment income') }),
        el('span', { class: 'winval', text: money(goal) })
      ]));
      win.appendChild(row(t('\u00a0\u00a0so far'), money(ft.addedIncome), true));
      st.appendChild(win);
      return;
    }

    /* Passive income is a subtotal of the lines above it; total income is the
     * sum of everything. The grand total is drawn heavier so the arithmetic
     * of the section is legible at a glance. */
    var incomeGroup = group(t('Monthly income'), [
      row(t('Salary'), money(s.salary), true),
      row(t('Interest / dividends'), money(s.interestDividends), true),
      row(t('Real estate'), money(s.realEstateIncome), true),
      row(t('Business'), money(s.businessIncome), true),
      row(t('Passive income'), money(s.passiveIncome), false, true)
    ]);
    var totalIncomeRow = row(t('Total income'), money(s.totalIncome), false, true);
    totalIncomeRow.className += ' grand';
    incomeGroup.appendChild(totalIncomeRow);
    st.appendChild(incomeGroup);

    /* Only expenses you actually have.
     *
     * A debt you have cleared should leave the sheet, not sit there at $0 --
     * seeing the line vanish is the reward for paying it off, and a statement
     * full of zeroes buries the numbers that still matter. */
    var p = s.expenseParts;

    /* Each expense explains itself, including whether it can be got rid of.
     * "Clear the balance and this line disappears" is a rule of the game, not
     * a suggestion about what to do next. */
    function expense(key, label, amount) {
      if (!amount) return null;
      var r = el('div', { class: 'row sub' }, [
        el('span', {}, [el('button', {
          class: 'term',
          onclick: function () { explainExpense(key, label, amount); },
          title: t('What does this mean?')
        }, [label])]),
        el('span', { text: money(amount) })
      ]);
      return r;
    }

    var expenseGroup = group(t('Monthly expenses'), [
      expense('taxes', t('Taxes'), p.taxes),
      expense('home', t('Home mortgage'), p.home),
      expense('school', t('School loan'), p.school),
      expense('car', t('Car loan'), p.car),
      expense('creditCard', t('Credit cards'), p.creditCard),
      expense('retail', t('Retail'), p.retail),
      expense('other', t('Other'), p.other),
      state.children > 0 ? expense('children', t('Children ({n})', { n: state.children }), p.children) : null,
      expense('loans', t('Loans'), p.bankLoan)
    ]);
    var totalExpRow = row(t('Total expenses'), money(s.totalExpenses), false, true);
    totalExpRow.className += ' grand';
    expenseGroup.appendChild(totalExpRow);

    /* Cash flow is the difference between the two totals above, so it reads
     * as the bottom line of the subtraction rather than as a separate
     * headline figure elsewhere on the page. */
    var cashflowRow = el('div', { class: 'row total cashflow' }, [
      el('span', {}, [term('Monthly cash flow')]),
      el('span', { class: s.cashflow >= 0 ? 'pos' : 'neg', text: money(s.cashflow) })
    ]);
    expenseGroup.appendChild(cashflowRow);
    expenseGroup.appendChild(el('div', {
      class: 'hint',
      text: t('Total income minus total expenses. This is what each PAYDAY pays you.')
    }));
    st.appendChild(expenseGroup);

    /* Assets first, then liabilities: the two sides of the balance sheet,
     * in the order a financial statement puts them. */
    var assetsHost = el('div', { class: 'group assets' });
    assetsHost.appendChild(el('div', { class: 'row' }, [
      el('span', { class: 'label' }, [term('Assets')])
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
      el('div', { class: 'row' }, [el('span', { class: 'label' }, [term('Liabilities')])])
    ]);

    Object.keys(E.LIABILITY_NAMES).forEach(function (which) {
      var slot = state.profession[which];
      if (!slot.liability && !slot.payment) return;
      liabilities.appendChild(liabilityRow(
        capitalise(t(E.LIABILITY_NAMES[which])), slot.liability, slot.payment,
        slot.liability > 0 ? function () { openPayoffDialog(which); } : null,
        slot.liability > state.cash
      ));
    });

    if (state.bankLoan > 0) {
      liabilities.appendChild(liabilityRow(t('Loans'), state.bankLoan, p.bankLoan, openRepayLoanDialog, state.cash < 1000
      ));
    }

    if (propertyDebt() > 0) {
      liabilities.appendChild(liabilityRow(t('Property mortgages'), propertyDebt(), 0, null, false,
        'Cleared when you sell the property'));
    }
    st.appendChild(liabilities);
  }

  function capitalise(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function liabilityRow(label, balance, payment, onPay, disabled, note) {
    var rate = rateText(payment, balance);
    var r = el('div', { class: 'row sub liab' }, [
      el('span', { class: 'liabname', text: label }),
      el('span', { class: 'liabrate', text: rate }),
      el('span', { class: 'liabnum', text: money(balance) })
    ]);
    if (onPay) {
      var b = el('button', { class: 'tiny', onclick: onPay, text: t('Repay') });
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
      el('span', { class: 'label' }, [termFor(title)])
    ])]);
    rows.forEach(function (r) { if (r) g.appendChild(r); });
    return g;
  }

  function row(label, value, sub, total) {
    return el('div', { class: 'row' + (sub ? ' sub' : '') + (total ? ' total' : '') }, [
      el('span', {}, [termFor(label)]),
      el('span', { text: value })
    ]);
  }

  /* row() is called with an already-translated label, so look the term up by
   * matching against the English keys we know. */
  function termFor(translatedLabel) {
    for (var key in TERM_HELP) {
      if (t(key) === translatedLabel) return term(key);
    }
    return translatedLabel;
  }

  /* ------------------------------------------------------------------ *
   * The action area: either "roll" or whatever decision is pending.
   * ------------------------------------------------------------------ */

  function ladderNote() {
    var done = earnedStars().length;
    var total = D.PROFESSIONS.length;
    var next = nextProfession();
    var note = el('div', { class: 'hint ladder' });
    note.appendChild(el('div', {
      text: t('Professions beaten: {done} of {total}.', { done: done, total: total })
    }));
    if (next) {
      note.appendChild(el('div', {
        text: t('Not yet beaten: {name}, number {n} of {total} by difficulty.',
          { name: T.field(next, 'name'), n: next.difficulty || total, total: total })
      }));
    } else {
      note.appendChild(el('div', { text: t('Every profession has been beaten.') }));
    }
    return note;
  }

  function renderPending() {
    var host = $('#action');
    clear(host);

    /* Mid-roll: the dice are still turning or the token is still walking.
     * There is nothing to decide until it lands, and showing the card early
     * gave away the square before the token got there. */
    if (moving) return;

    if (state.phase === 'bankrupt') {
      host.appendChild(el('div', { class: 'card danger' }, [
        el('h3', { text: t('Bankrupt in {months} months', { months: state.result.months }) }),
        el('p', {
          text: t('You could not pay for {reason}, and there was nothing left to sell or borrow against. Use Undo to go back and take a different turn, or start again.', { reason: state.result.reason })
        }),
        ladderNote(),
        el('div', { class: 'buttons' }, [
          el('button', { class: 'primary', onclick: openSetup, text: t('New game') }),
          el('button', { onclick: undo, text: t('Undo the last move') })
        ])
      ]));
      return;
    }

    if (state.phase === 'won') {
      host.appendChild(el('div', { class: 'card gold' }, [
        el('h3', { text: t('Game over - you win') }),
        el('p', {
          text: state.result.how === 'dream'
            ? t('You bought your dream in {months} months.', { months: state.result.months })
            : t('You added {$income} a month of investment income in {months} months.',
                { income: E.ftStats(state).addedIncome, months: state.result.months })
        }),
        ladderNote(),
        el('div', { class: 'buttons' }, [
          el('button', { class: 'primary', onclick: openSetup, text: t('New game') })
        ])
      ]));
      return;
    }

    var p = state.pending;
    if (!p) {
      // What just happened, then what to do next.
      if (receipt && receipt.entries.length) host.appendChild(receiptCard());
      host.appendChild(rollCard());
      return;
    }

    /* Money collected passing a payday happened before this card was drawn
     * and is not part of it, but it did just happen to you. */
    var passed = paydayBlock();
    if (passed) host.appendChild(passed);

    switch (p.kind) {
      case 'chooseDeck': return host.appendChild(chooseDeckCard(p));
      case 'deal': return host.appendChild(dealCard(p));
      case 'charity': return host.appendChild(simpleCard(p, t('Donate {$amount}', { amount: p.amount }), 'charityDonate', t('Decline')));
      case 'doodadOptional': return host.appendChild(optionalDoodadCard(p));
      case 'bill': return host.appendChild(billCard(p));
      case 'sellAsset': return host.appendChild(sellAssetCard(p));
      case 'sellGold': return host.appendChild(sellGoldCard(p));
      case 'ftInvestment': return host.appendChild(ftInvestmentCard(p));
      case 'ftDream': return host.appendChild(ftDreamCard(p));
      case 'ftCharity': return host.appendChild(simpleCard(p, t('Donate {$amount}', { amount: p.amount }), 'ftCharityDonate', t('Decline')));
      default:
        return host.appendChild(el('div', { class: 'card danger' }, [
          el('h3', { text: t('Unexpected state') }),
          el('p', { text: 'The engine is waiting on "' + p.kind + '", which this interface does not know how to show. Please report this with the seed above.' }),
          el('div', { class: 'buttons' }, [
            el('button', { onclick: function () { doAction('acknowledge'); }, text: t('Continue') })
          ])
        ]));
    }
  }

  /* The turn just played, replayed back. This is the only place a player can
   * see WHY their numbers changed without reading the history log. */
  function entryBlock(cls, caption, entries) {
    var box = el('div', { class: 'receipt-block ' + cls });
    if (caption) box.appendChild(el('div', { class: 'receipt-square', text: caption }));
    entries.forEach(function (entry) {
      box.appendChild(el('div', { class: 'receipt-line ' + entry.type, text: logText(entry) }));
    });
    return box;
  }

  /* The payday part of this turn on its own, for when a card is waiting and
   * the full receipt would be premature. */
  function paydayBlock() {
    if (!receipt || !receipt.entries.length) return null;
    var paid = receipt.entries.filter(function (e) { return e.type === 'payday'; });
    if (!paid.length) return null;
    var wrap = el('div', { class: 'receipt-lines standalone' });
    wrap.appendChild(entryBlock('payday', null, paid));
    return wrap;
  }

  function receiptCard() {
    var cashDelta = state.cash - receipt.cashStart;
    var passiveDelta = E.stats(state).passiveIncome - receipt.passiveStart;
    var tone = cashDelta > 0 ? 'gold' : (cashDelta < 0 ? 'danger' : 'info');

    var card = el('div', { class: 'card receipt ' + tone });

    /* Passing a payday happens on the way to the square, so its lines come
     * first and stand on their own. What the square did comes second, under
     * the name of the square -- which is where naming it is useful, next to
     * the thing it produced, rather than as a heading over the whole turn. */
    var lines = el('div', { class: 'receipt-lines' });
    var onTheWay = [];
    var fromSquare = [];
    receipt.entries.forEach(function (entry) {
      (entry.type === 'payday' ? onTheWay : fromSquare).push(entry);
    });

    // Collected on the way past, before the square was ever reached.
    if (onTheWay.length) lines.appendChild(entryBlock('payday', null, onTheWay));
    if (fromSquare.length) {
      var costly = receipt.entries.some(function (e) { return e.type === 'loss'; });
      var type = (receipt.square && receipt.square.type) || '';
      /* Expense squares are red because they usually cost you something.
       * When one did not, the neutral block tells the truth. */
      if (type === 'DOODAD' && !costly) type = '';
      lines.appendChild(entryBlock('square' + (type ? ' ' + type : ''),
        squareText(receipt.square), fromSquare));
    }
    card.appendChild(lines);

    if (passiveDelta !== 0) {
      card.appendChild(el('div', {
        class: 'hint',
        text: t(passiveDelta > 0
          ? 'Passive income rose {$amount} a month, to {$total}.'
          : 'Passive income fell {$amount} a month, to {$total}.',
          { amount: Math.abs(passiveDelta), total: E.stats(state).passiveIncome })
      }));
    }
    return card;
  }

  function rollCard() {
    var opts = E.diceOptions(state);
    var card = el('div', { class: 'card' }, [
      el('h3', { text: state.skipTurns > 0 ? t('You are out of work') : t('Your move') })
    ]);

    if (state.skipTurns > 0) {
      card.appendChild(el('p', {
        text: t(state.skipTurns > 1 ? 'You lose {n} more turns.' : 'You lose {n} more turn.', { n: state.skipTurns })
      }));
      card.appendChild(el('div', { class: 'buttons' }, [
        el('button', { class: 'primary', onclick: function () { doRoll(1); }, text: t('Sit out a month') })
      ]));
      return card;
    }

    if (state.phase === 'fasttrack') {
      card.appendChild(el('p', { text: t('Roll two dice.') }));
    } else if (opts.length > 1) {
      card.appendChild(el('p', {
        text: t(state.charityTurns > 1
          ? 'Your donation earns you a choice: one die or two, for {n} more turns.'
          : 'Your donation earns you a choice: one die or two, for {n} more turn.',
          { n: state.charityTurns })
      }));
    } else {
      card.appendChild(el('p', { text: t('Roll the die and move.') }));
    }

    var buttons = el('div', { class: 'buttons' });
    opts.forEach(function (n) {
      buttons.appendChild(el('button', {
        class: 'primary',
        onclick: function () { doRoll(n); },
        text: '\uD83C\uDFB2 ' + (n === 1 ? t('Roll 1 die') : t('Roll 2 dice'))
      }));
    });
    card.appendChild(buttons);
    return card;
  }

  function chooseDeckCard(p) {
    return el('div', { class: 'card' }, [
      el('h3', { text: T.maybe(p.title) }),
      el('p', { text: T.maybe(p.text) }),
      el('div', { class: 'buttons' }, [
        el('button', { onclick: function () { doAction('chooseDeck', { deck: 'small' }); }, text: t('Small Deal') }),
        el('button', { onclick: function () { doAction('chooseDeck', { deck: 'big' }); }, text: t('Big Deal') })
      ]),
      el('div', { class: 'hint', text: t('Looking at a deal does not commit you to it.') })
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

  function averagePaid(held) {
    if (!held || !held.shares) return null;
    return held.invested / held.shares;
  }

  /* A free-typed quantity, next to the offered ones.
   *
   * The presets cover the common cases and cannot be typed wrong; they cannot
   * express "97 shares". This adds that without going back to a single shared
   * number box, because it commits to one mode -- buy or sell -- the moment it
   * is used. */
  function customQty(mode, max, unitPrice) {
    var row = el('div', { class: 'qtycustom' });
    var input = el('input', {
      type: 'number', min: '1', max: String(max), step: '1',
      inputmode: 'numeric',
      'aria-label': mode === 'buy' ? t('Number of shares to buy') : t('Number of shares to sell'),
      placeholder: t('or type an amount')
    });
    function use() {
      var n = parseInt(input.value, 10);
      if (!n || n < 1) { cardError = t('Enter how many shares.'); render(); return; }
      if (n > max) {
        cardError = mode === 'buy'
          ? t('You can afford {n} shares at this price.', { n: max })
          : t('You only own {n} shares.', { n: max });
        render();
        return;
      }
      trade = { key: pendingKey(), mode: mode, qty: n };
      cardError = null;
      render();
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); use(); }
    });
    row.appendChild(input);
    row.appendChild(el('button', { class: 'ghost', onclick: use, text: t('Use') }));
    return row;
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
        el('span', { class: 'qty', text: (i === 0 ? (mode === 'sell' ? t('All') + ' ' : t('Max') + ' ') : '') + n }),
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
      [buying ? t('Buying') : t('Selling'),
        t('{n} {unit} at {$price}', { n: qty, unit: qty === 1 ? opts.unit : opts.units, price: opts.unitPrice })],
      [t('Total'), money(total)],
      [t('Cash now'), money(state.cash)],
      [t('Cash after'), money(buying ? state.cash - total : state.cash + total)]
    ];
    if (opts.extraRows) rows = rows.concat(opts.extraRows(qty, buying));

    return el('div', { class: 'confirmstep' }, [
      terms(rows),
      errorSlot(),
      el('div', { class: 'buttons' }, [
        el('button', {
          onclick: function () { opts.onConfirm(qty, buying); },
          text: t(buying ? 'Buy {n} {unit}' : 'Sell {n} {unit}',
            { n: qty, unit: qty === 1 ? opts.unit : opts.units })
        }),
        el('button', {
          class: 'ghost',
          onclick: function () { resetTrade(); render(); },
          text: t('Change amount')
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

  /* The button on a card should say what the card actually does. A card
    * where a friend asks you for money is not a purchase, and labelling it
    * "Buy" describes neither the act nor its consequences. */
  function actionLabel(spec, amount, fallback) {
    if (!spec) return fallback + ' ' + money(amount);
    return spec.replace('%s', money(amount));
  }

  function terms(pairs) {
    var box = el('div', { class: 'terms' });
    pairs.forEach(function (pr) {
      if (!pr) return;
      box.appendChild(el('div', {}, [el('span', { text: pr[0] }), el('span', { text: pr[1] })]));
    });
    return box;
  }

  /* A save stores a copy of the card it is waiting on, so its English title
   * and text are frozen at the moment it was drawn. French is looked up live
   * by id, so editing a card leaves an in-progress game showing the new French
   * against the old English -- which is exactly how it looks when a
   * translation is wrong. Re-read the wording from the catalogue; only the
   * wording, since the saved numbers are what the decision was offered on. */
  function liveCard(c) {
    if (!c || !c.id) return c;
    var decks = [D.SMALL_DEALS, D.BIG_DEALS, D.DOODADS, D.MARKET];
    for (var i = 0; i < decks.length; i++) {
      var found = E.findById(decks[i], c.id);
      if (found) return found;
    }
    return c;
  }

  function dealCard(p) {
    var c = p.card;
    var wording = liveCard(c);
    var card = el('div', { class: 'card' }, [
      el('h3', { text: T.field(wording, 'title') })
    ]);
    var cardText = T.field(wording, 'text');
    if (cardText) card.appendChild(el('p', { text: cardText }));

    var buttons = el('div', { class: 'buttons' });

    if (c.kind === 'stock') {
      var held = state.stocks[c.symbol];
      var shares = held ? held.shares : 0;
      var maxBuy = Math.floor(state.cash / c.price);
      /* Two boxes, because these are two different subjects. The first is
       * about the company and is the same for every player; the second is
       * about this player and is the same for every company. Reading them as
       * one list invited comparing a dividend with a share count. */
      card.appendChild(terms([
        [t('Price per share'), money(c.price)],
        [t('Dividend'), c.dividend ? t('{$amount} / share / month', { amount: c.dividend }) : t('none')],
        c.dividend ? [t('Dividend yield at this price'),
          t('{pct}%/yr', { pct: pct((c.dividend * 12 / c.price) * 100) })] : null,
        [t('Trading range'), money(c.range[0]) + ' - ' + money(c.range[1])]
      ]));

      var avg = averagePaid(held);
      var position = [
        [t('You own'), t('{n} shares', { n: shares })],
        avg === null ? null : [t('Average price you paid'), money(Math.round(avg))],
        avg === null ? null : [t('Total invested'), money(held.invested)],
        [t('You can afford'), t('{n} shares', { n: maxBuy })]
      ];
      var posBox = terms(position);
      posBox.className += ' position';
      card.appendChild(el('div', { class: 'poshead', text: t('Your position') }));
      card.appendChild(posBox);
      /* Preset amounts rather than one shared number field.
       *
       * The old card had a single input used by Buy, Sell and Sell-all, which
       * meant the same box could hold a quantity that was legal for one
       * operation and impossible for another, and its default of 10 was
       * absurd on a $5 share you could buy 300 of. Each button now carries
       * its own quantity, so nothing can be typed into the wrong operation. */
      if (maxBuy >= 1) {
        card.appendChild(quantityRow(t('Buy'), buyAmounts(maxBuy), c.price, 'buy'));
        card.appendChild(customQty('buy', maxBuy, c.price));
      } else {
        card.appendChild(el('div', { class: 'hint', text: t('One share costs {$price} and you have {$cash}.', { price: c.price, cash: state.cash }) }));
      }
      if (shares > 0) {
        card.appendChild(quantityRow(t('Sell'), sellAmounts(shares), c.price, 'sell'));
        card.appendChild(customQty('sell', shares, c.price));
      }

      if (trade.qty > 0) {
        card.appendChild(confirmTrade({
          unitPrice: c.price, unit: t('share'), units: t('shares'),
          extraRows: function (qty, buying) {
            var after = buying ? shares + qty : shares - qty;
            var out = [];
            var paid = averagePaid(held);
            if (paid !== null) {
              out.push([t('Average price you paid'), money(Math.round(paid))]);
              if (!buying) {
                out.push([t('Price now'), money(c.price)]);
              }
            }
            out.push([t('Shares after'), String(after)]);
            if (c.dividend) {
              out.push([t('Monthly income from these'), money(shares * c.dividend) + '  →  ' + money(after * c.dividend)]);
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
        el('button', { class: 'ghost', onclick: function () { doAction('pass'); }, text: t('Pass') })
      ]));
      var span = c.range[1] - c.range[0];
      var pctOfRange = span > 0 ? Math.round(((c.price - c.range[0]) / span) * 100) : 0;
      card.appendChild(el('div', {
        class: 'hint',
        text: t('At {$price}, this is {pct}% of the way up its {$low} to {$high} range.',
          { price: c.price, pct: pctOfRange, low: c.range[0], high: c.range[1] })
      }));
      return card;
    }

    if (c.kind === 'gold') {
      card.appendChild(terms([
        [t('Price per coin'), money(c.unitPrice)],
        [t('Maximum'), t('{n} coins', { n: c.maxQty })],
        [t('Monthly income'), 'none']
      ]));
      var maxCoins = Math.min(c.maxQty, Math.floor(state.cash / c.unitPrice));
      if (maxCoins >= 1) {
        var coinAmounts = [];
        for (var n = maxCoins; n >= 1 && coinAmounts.length < 5; n--) coinAmounts.push(n);
        card.appendChild(quantityRow(t('Buy'), coinAmounts, c.unitPrice, 'buy'));
      } else {
        card.appendChild(el('div', { class: 'hint', text: t('One coin costs {$price} and you have {$cash}.', { price: c.unitPrice, cash: state.cash }) }));
      }

      if (trade.qty > 0) {
        card.appendChild(confirmTrade({
          unitPrice: c.unitPrice, unit: t('coin'), units: t('coins'),
          extraRows: function () { return [[t('Monthly income from these'), money(0)]]; },
          onConfirm: function (qty) { doAction('buyGold', { qty: qty }); }
        }));
      } else {
        card.appendChild(errorSlot());
      }

      card.appendChild(el('div', { class: 'buttons' }, [
        el('button', { class: 'ghost', onclick: function () { doAction('pass'); }, text: t('Pass') })
      ]));
      return card;
    }

    if (c.kind === 'cd') {
      card.appendChild(terms([
        [t('Cost'), money(c.cost)],
        [t('Monthly income'), money(c.cashflow)],
        [t('Annual return'), t('{pct}%', { pct: pct((c.cashflow * 12 / c.cost) * 100) })]
      ]));
      var cdBuy = el('button', {
        class: 'primary',
        onclick: function () { doAction('buyDeal'); },
        text: state.cash < c.cost ? t('Not enough cash') : t('Buy')
      });
      if (state.cash < c.cost) cdBuy.disabled = true;
      buttons.appendChild(cdBuy);
      card.appendChild(cardFooter(card, buttons, 'Pass'));
      return card;
    }

    if (c.kind === 'trap') {
      card.appendChild(terms([
        [t('Cost'), money(c.cost)],
        [t('Monthly income'), money(0)],
        c.addExpense ? [t('Added monthly expense'), money(c.addExpense)] : null,
        [t('Cash now'), money(state.cash)],
        [t('Cash if you buy'), money(state.cash - c.cost)]
      ]));
      var trapBtn = el('button', {
        onclick: function () { doAction('buyDeal'); },
        text: actionLabel(c.action, c.cost, 'Buy for')
      });
      if (c.cost > state.cash) { trapBtn.disabled = true; trapBtn.title = 'Not enough cash'; }
      buttons.appendChild(trapBtn);
      buttons.appendChild(el('button', { onclick: function () { doAction('pass'); }, text: t('Pass') }));
      card.appendChild(errorSlot());
      card.appendChild(buttons);
      return card;
    }

    // Real estate and businesses
    var roi = c.down > 0 ? (c.cashflow * 12 / c.down) * 100 : 0;
    var termsBox = terms([
      [t('Price'), money(c.cost)],
      [t('Down payment'), money(c.down)],
      [t('Mortgage / financed'), money(c.mortgage)],
      [t('Monthly cash flow'), money(c.cashflow)],
      [t('Your cash'), money(state.cash)]
    ]);
    /* The return is the one figure on this card that is derived rather than
     * printed, so it is the one worth being able to open up. */
    termsBox.appendChild(el('div', {}, [
      el('span', {}, [el('button', {
        class: 'term',
        onclick: function () {
          explain(t('Cash-on-cash return'), [
            t('What the money you actually put in earns you in a year, ignoring the part the mortgage pays for.'),
            t('Monthly cash flow x 12 / down payment: {$cf} x 12 / {$down} = {pct}% a year.',
              { cf: c.cashflow, down: c.down, pct: pct(roi) }),
            t('It says nothing about whether the price is fair, or what the property might later sell for.')
          ]);
        },
        title: t('What does this mean?')
      }, [t('Cash-on-cash return')])]),
      el('span', { text: t('{pct}% a year', { pct: pct(roi) }) })
    ]));
    card.appendChild(termsBox);
    var short = Math.max(0, c.down - state.cash);
    var credit = E.availableCredit(state);
    var outOfReach = short > credit;
    /* No option on this card is highlighted: whether a deal is worth taking
     * is the judgement the player is here to practise. */
    var buyBtn = el('button', {
      class: '',
      onclick: function () { doAction('buyDeal'); },
      text: t('Buy for {$amount}', { amount: c.down })
    });
    if (short > 0) buyBtn.disabled = true;
    buttons.appendChild(buyBtn);

    if (short > 0 && short <= credit) {
      buttons.appendChild(el('button', { onclick: openLoanDialog, text: t('Take a loan…') }));
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
      el('span', { class: 'tagline', text: t('An expense you have to pay') }),
      el('h3', { text: T.maybe(p.title) })
    ]);
    if (p.text) card.appendChild(el('p', { text: T.maybe(p.text) }));

    card.appendChild(terms([
      [t('Amount'), money(p.amount)],
      [t('Cash before'), money(state.cash)],
      ['Cash after', short ? money(0) : money(after)]
    ]));
    card.appendChild(errorSlot());
    card.appendChild(el('div', { class: 'buttons' }, [
      el('button', {
        class: 'primary',
        onclick: function () { doAction('payBill'); },
        text: t('Pay {$amount}', { amount: p.amount })
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
      el('span', { class: 'tagline', text: t('Accept or decline') }),
      el('h3', { text: T.maybe(p.title) }),
      p.text ? el('p', { text: T.maybe(p.text) }) : null,
      terms([
        [t('Cost'), money(p.amount)],
        [t('Cash now'), money(state.cash)],
        [t('Cash if you buy'), money(state.cash - p.amount)],
        p.addExpense ? [t('Monthly expenses if you buy'), money(s.totalExpenses) + '  →  ' + money(s.totalExpenses + p.addExpense)] : null,
        p.addExpense ? [t('Monthly cash flow if you buy'), money(s.cashflow) + '  →  ' + money(s.cashflow - p.addExpense)] : null,
        [t('If you decline'), 'no change']
      ]),
      errorSlot(),
      el('div', { class: 'buttons' }, [
        el('button', {
          onclick: function () { doAction('doodadAccept'); },
          text: actionLabel(p.action, p.amount, 'Buy for')
        }),
        el('button', { onclick: function () { doAction('acknowledge'); }, text: t('Decline') })
      ])
    ]);
  }

  function simpleCard(p, yesLabel, yesAction, noLabel, cls) {
    return el('div', { class: 'card' + (cls ? ' ' + cls : ' info') }, [
      el('h3', { text: T.maybe(p.title) }),
      el('p', { text: T.maybe(p.text) }),
      /* You cannot judge a donation without knowing what it leaves you. */
      p.amount !== undefined ? terms([
        [t('Cost'), money(p.amount)],
        p.addExpense ? [t('Added monthly expense'), money(p.addExpense)] : null,
        [t('Your cash'), money(state.cash)],
        [t('Cash if you accept'), money(state.cash - p.amount)]
      ]) : null,
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
      el('h3', { text: T.maybe(p.title) }),
      el('p', { text: T.maybe(p.text) })
    ]);

    var offers = p.offers.slice().sort(function (a, b) { return b.netCash - a.netCash; });

    offers.forEach(function (o) {
      var gain = o.price - o.cost;
      var loss = o.netCash < 0;
      var row = el('div', { class: 'offer' + (loss ? ' loss' : '') }, [
        el('div', { class: 'offername', text: o.name }),
        el('div', { class: 'offerfacts' }, [
          el('span', { class: loss ? 'neg' : 'pos', text: (o.netCash >= 0 ? '+' : '') + money(o.netCash) + ' ' + t('cash') }),
          el('span', { class: 'neg', text: t('−{$amount}/mo income', { amount: o.cashflowLost }) }),
          el('span', { class: 'muted', text: t(gain >= 0 ? 'gain {$gain} vs the {$paid} you paid' : 'loss {$gain} vs the {$paid} you paid', { gain: Math.abs(gain), paid: o.cost })})
        ]),
        el('button', {
          onclick: function () { doAction('sellAsset', { assetId: o.assetId }); },
          text: t('Sell')
        })
      ]);
      card.appendChild(row);
    });

    card.appendChild(errorSlot());
    card.appendChild(el('div', { class: 'buttons' }, [
      el('button', { onclick: function () { doAction('acknowledge'); }, text: t('Sell nothing') })
    ]));
    card.appendChild(el('div', {
      class: 'hint',
      text: t('A sale raises cash once and removes that property\'s monthly income from then on.')
    }));
    return card;
  }

  function sellGoldCard(p) {
    var card = el('div', { class: 'card gold' }, [
      el('h3', { text: T.maybe(p.title) }),
      el('p', { text: T.maybe(p.text) }),
      terms([[t('Price per coin'), money(p.unitPrice)], [t('Coins you own'), String(p.maxQty)]])
    ]);
    var amounts = [];
    for (var n = p.maxQty; n >= 1 && amounts.length < 5; n--) amounts.push(n);
    card.appendChild(quantityRow(t('Sell'), amounts, p.unitPrice, 'sell'));

    if (trade.qty > 0) {
      card.appendChild(confirmTrade({
        unitPrice: p.unitPrice, unit: t('coin'), units: t('coins'),
        extraRows: function (qty) { return [[t('Coins left'), String(p.maxQty - qty)]]; },
        onConfirm: function (qty) { doAction('sellGold', { qty: qty }); }
      }));
    } else {
      card.appendChild(errorSlot());
    }

    card.appendChild(el('div', { class: 'buttons' }, [
      el('button', { onclick: function () { doAction('acknowledge'); }, text: t('Sell none') })
    ]));
    return card;
  }

  function ftInvestmentCard(p) {
    return el('div', { class: 'card' }, [
      el('h3', { text: T.maybe(p.title) }),
      el('p', { text: T.maybe(p.text) }),
      terms([
        [t('Cost (cash)'), money(p.cost)],
        [t('Monthly cash flow'), money(p.cashflow)],
        [t('Annual return'), t('{pct}%', { pct: pct((p.cashflow * 12 / p.cost) * 100) })],
        [t('Your cash'), money(state.cash)]
      ]),
      errorSlot(),
      el('div', { class: 'buttons' }, [
        el('button', { onclick: function () { doAction('buyInvestment'); }, text: t('Buy for {$amount}', { amount: p.cost }) }),
        el('button', { onclick: function () { doAction('acknowledge'); }, text: t('Pass') })
      ])
    ]);
  }

  function ftDreamCard(p) {
    return el('div', { class: 'card gold' }, [
      el('h3', { text: T.maybe(p.title) }),
      el('p', { text: T.maybe(p.text) }),
      terms([[t('Cost'), money(p.cost)], [t('Your cash'), money(state.cash)]]),
      errorSlot(),
      el('div', { class: 'buttons' }, [
        el('button', { onclick: function () { doAction('buyDream'); }, text: t('Buy for {$amount}', { amount: p.cost }) }),
        el('button', { onclick: function () { doAction('acknowledge'); }, text: t('Not yet') })
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
      var avgHeld = averagePaid(h);
      var row = [sym + ' — ' + meta.name,
        avgHeld === null
          ? t('{n} shares', { n: h.shares })
          : t('{n} shares at {$avg} each, {$paid} in total',
              { n: h.shares, avg: Math.round(avgHeld), paid: h.invested }),
        monthly];
      (monthly > 0 ? earning : speculative).push(row);
    }

    if (state.phase === 'fasttrack' || state.phase === 'won') {
      state.ftInvestments.forEach(function (i) {
        earning.push([i.name, money(i.cost), i.cashflow]);
      });
    }

    state.assets.forEach(function (a) {
      if (a.category === 'gold') {
        speculative.push([T.maybe(a.name), t('{n} coins, paid {$paid}', { n: a.qty, paid: a.cost }), 0]);
      } else {
        var detail = a.mortgage
          ? t('{$cost}, {$owed} owed', { cost: a.cost, owed: a.mortgage })
          : t('{$cost}, owned outright', { cost: a.cost });
        (a.cashflow > 0 ? earning : speculative).push([a.name, detail, a.cashflow]);
      }
    });

    if (!earning.length && !speculative.length) {
      host.appendChild(el('div', { class: 'empty', text: t('Nothing yet. Every Opportunity square is a chance to start.') }));
      return;
    }

    function section(title, rows, note) {
      if (!rows.length) return;
      var total = rows.reduce(function (sum, r) { return sum + r[2]; }, 0);
      host.appendChild(el('div', { class: 'assetgroup' }, [
        el('span', { text: title }),
        el('span', { class: total > 0 ? 'pos' : '', text: total > 0 ? t('{$amount}/mo', { amount: total }) : '' })
      ]));
      rows.forEach(function (r) {
        host.appendChild(el('div', { class: 'item' }, [
          el('span', { class: 'n', text: r[0] }),
          el('span', { class: 'm', text: r[1] }),
          el('span', { class: 'm ' + (r[2] > 0 ? 'pos' : 'muted'), text: t('{$amount}/mo', { amount: r[2] > 0 ? r[2] : 0 }) })
        ]));
      });
      if (note) host.appendChild(el('div', { class: 'hint', text: note }));
    }

    section(t('Producing monthly income'), earning);
    section(t('Producing no monthly income'), speculative);
  }

  /* ------------------------------------------------------------------ *
   * Loans
   *
   * Taking on debt is always a deliberate, separate act with its own dialog.
   * Buying something can never quietly create a loan -- a player who ends up
   * paying 120% a year has to have chosen to.
   * ------------------------------------------------------------------ */

  /* The amount dialogs always open at the smallest step.
   *
   * They used to remember the last amount, so after borrowing $3,000 and
   * finding it short, reopening the dialog was already armed at $3,000 --
   * one tap from borrowing that much again by accident. Starting at the
   * minimum makes every increase a deliberate act. */
  var LOAN_STEP = 1000;

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
        el('button', { class: 'primary', onclick: close, text: t('Close') })
      ]));
      if (!dlg.open) dlg.showModal();
      return;
    }

    var valueNode = el('span', { class: 'stepval', 'aria-live': 'polite', text: money(value) });
    var summary = el('div', { class: 'terms' });
    var confirm = el('button', { class: 'primary', text: t('') });

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
    }

    function bump(delta) {
      value = Math.max(opts.min, Math.min(opts.max, value + delta));
      refresh();
    }

    body.appendChild(el('div', { class: 'stepper' }, [
      el('button', { onclick: function () { bump(-opts.step); }, 'aria-label': 'Less', text: t('−') }),
      valueNode,
      el('button', { onclick: function () { bump(opts.step); }, 'aria-label': 'More', text: t('+') })
    ]));
    body.appendChild(el('div', { class: 'buttons quickrow' }, [
      el('button', { class: 'tiny', onclick: function () { value = opts.min; refresh(); }, text: t('Min') }),
      el('button', { class: 'tiny', onclick: function () { value = opts.max; refresh(); }, text: t('Max {$amount}', { amount: opts.max }) })
    ]));
    body.appendChild(summary);
    confirm.addEventListener('click', function () {
      if (opts.onConfirm(value)) close();
    });
    body.appendChild(el('div', { class: 'dlg-actions' }, [
      el('button', { class: 'ghost', onclick: close, text: t('Cancel') }),
      confirm
    ]));

    refresh();
    if (!dlg.open) dlg.showModal();
  }

  function openLoanDialog() {
    var available = E.availableCredit(state);
    var s = E.stats(state);
    amountDialog({
      title: t('Take a loan'),
      note: 'Interest only: ' + money(100) + ' a month for every ' + money(1000) +
        ' borrowed, which is 120% a year. The payment continues every month until you ' +
        'repay the principal.',
      blocked: 'You have no borrowing capacity left.',
      min: 1000, max: Math.floor(available / 1000) * 1000, step: 1000,
      initial: LOAN_STEP,
      summary: function (v) {
        var extra = (v / 1000) * 100;
        return [
          [t('Cash afterwards'), money(state.cash) + '  →  ' + money(state.cash + v)],
          [t('Monthly expenses'), money(s.totalExpenses) + '  →  ' + money(s.totalExpenses + extra)],
          [t('Monthly cash flow'), money(s.cashflow) + '  →  ' + money(s.cashflow - extra)]
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
      title: t('Repay loans'),
      note: 'You owe ' + money(state.bankLoan) + ', which costs ' +
        money(state.bankLoan / 1000 * 100) + ' a month. Each ' + money(1000) +
        ' repaid removes ' + money(100) + ' a month from your expenses.',
      blocked: 'You need at least ' + money(1000) + ' in cash to repay a block.',
      min: 1000, max: max, step: 1000,
      initial: LOAN_STEP,
      summary: function (v) {
        var freed = (v / 1000) * 100;
        return [
          [t('Cash afterwards'), money(state.cash) + '  →  ' + money(state.cash - v)],
          [t('Loans left'), money(state.bankLoan) + '  →  ' + money(state.bankLoan - v)],
          [t('Monthly cash flow'), money(s.cashflow) + '  →  ' + money(s.cashflow + freed)]
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
    body.appendChild(el('h2', { text: t('Pay off your {debt}', { debt: name }) }));
    body.appendChild(el('p', {
      class: 'dlg-note',
      text: t('This debt can only be cleared in full. Doing so removes its {$payment} monthly payment for the rest of the game.', { payment: slot.payment })
    }));
    body.appendChild(terms([
      [t('Balance to clear'), money(slot.liability)],
      [t('Your cash'), money(state.cash)],
      ['Cash afterwards', afford ? money(state.cash - slot.liability) : '—'],
      [t('Monthly expenses'), money(s.totalExpenses) + '  →  ' + money(s.totalExpenses - slot.payment)],
      [t('Monthly cash flow'), money(s.cashflow) + '  →  ' + money(s.cashflow + slot.payment)]
    ]));
    if (!afford) {
      body.appendChild(el('p', {
        class: 'dlg-note',
        text: t('You are {$amount} short of clearing it.', { amount: slot.liability - state.cash })
      }));
    }
    body.appendChild(el('div', { class: 'dlg-actions' }, [
      el('button', { class: 'ghost', onclick: function () { dlg.close(); }, text: t('Cancel') }),
      afford ? el('button', {
        class: 'primary',
        onclick: function () {
          if (doAction('repayLiability', { which: which })) dlg.close();
        },
        text: t('Pay off {$amount}', { amount: slot.liability })
      }) : null
    ]));
    if (!dlg.open) dlg.showModal();
  }


  /* A summary and one way in. Taking a loan happens in its own dialog, and
   * repaying happens from the Liabilities list beside the debt itself. */
  /* Leaving the Rat Race changes the rules, so it gets its own dialog rather
    * than three more lines in the turn receipt. The receipt reports what you
    * did; this explains what the game now is. */
  function openFastTrackDialog() {
    var dlg = $('#money-dialog');
    var body = $('#money-dialog-body');
    var f = E.ftStats(state);
    var goal = E.fastTrackGoal(state);

    clear(body);
    body.appendChild(el('h2', { text: t('Out of the Rat Race in {months} months', { months: state.months }) }));
    body.appendChild(el('p', {
      class: 'dlg-note',
      text: t('Your passive income overtook your expenses, so the Rat Race is finished. From here the game is a different one.')
    }));

    body.appendChild(el('div', { class: 'ftrules' }, [
      el('h3', { text: t('What carries over') }),
      terms([
        [t('Cash Flow Day income'), money(f.baseIncome)],
        [t('Cash to start'), money(state.cash)]
      ]),
      el('p', {
        class: 'dlg-note',
        text: t('Everything you built in the Rat Race - the properties, the businesses, the shares - became that monthly income. Your old salary, expenses and debts are gone.')
      }),

      el('h3', { text: t('What changes') }),
      el('ul', {}, [
        el('li', { text: t('You roll two dice instead of one.') }),
        el('li', { text: t('Investments are bought with cash. There are no loans here.') }),
        el('li', { text: t('You collect your Cash Flow Day income each time you pass or land on a Cash Flow Day square.') })
      ]),

      el('h3', { text: t('Two ways to win') }),
      el('ul', {}, [
        el('li', {}, [
          el('span', { text: t('Land on your dream, {name}, and pay {$cost}.',
            { name: T.field(state.dream, 'name'), cost: state.dream.cost }) })
        ]),
        el('li', { text: t('Or add {$goal} a month of new investment income.', { goal: goal }) })
      ]),
      el('p', {
        class: 'dlg-note',
        text: t('Your dream is the gold square on the board. Only that one wins the game for you; the others belong to nobody.')
      })
    ]));

    body.appendChild(el('div', { class: 'dlg-actions' }, [
      el('button', { class: 'primary', onclick: function () { dlg.close(); }, text: t('Start the Fast Track') })
    ]));
    if (!dlg.open) {
      window.scrollTo(0, 0);
      dlg.showModal();
    }
  }

  /* The game is over: say so where it cannot be missed, rather than only in
   * a card in a column and a line in the middle of the board. */
  function openEndDialog() {
    var dlg = $('#money-dialog');
    var body = $('#money-dialog-body');
    var won = state.phase === 'won';

    clear(body);
    body.appendChild(el('h2', {
      text: won ? t('You win') : t('Bankrupt')
    }));
    body.appendChild(el('p', {
      class: 'dlg-note',
      text: won
        ? (state.result.how === 'dream'
            ? t('You bought your dream in {months} months.', { months: state.result.months })
            : t('You added {$income} a month of investment income in {months} months.',
                { income: E.ftStats(state).addedIncome, months: state.result.months }))
        : t('You could not pay for {reason}, and there was nothing left to sell or borrow against.',
            { reason: state.result.reason })
    }));
    body.appendChild(ladderNote());
    body.appendChild(el('div', { class: 'dlg-actions' }, [
      el('button', { class: 'primary', onclick: function () { dlg.close(); openSetup(); }, text: t('New game') }),
      el('button', { onclick: function () { dlg.close(); }, text: t('Close') })
    ]));
    if (!dlg.open) {
      window.scrollTo(0, 0);
      dlg.showModal();
    }
  }

  function renderBank() {
    var host = $('#bank');
    clear(host);

    if (state.phase !== 'ratrace') {
      host.appendChild(el('div', {
        class: 'empty',
        text: state.phase === 'bankrupt'
          ? t('No one will lend to you now.')
          : t('There are no loans on the Fast Track. Investments are bought with cash.')
      }));
      return;
    }

    var available = E.availableCredit(state);
    var owed = state.bankLoan;

    var status = el('div', { class: 'bankstatus' });
    status.appendChild(el('div', { class: 'bankline' }, [
      el('span', { text: t('You owe') }),
      el('span', {
        class: owed > 0 ? 'neg' : '',
        text: money(owed) + (owed > 0 ? '  (' + money(owed / 1000 * 100) + '/mo)' : '')
      })
    ]));
    status.appendChild(el('div', { class: 'bankline' }, [
      el('span', { text: t('You could borrow') }),
      el('span', { text: money(available) })
    ]));
    host.appendChild(status);

    var take = el('button', { onclick: openLoanDialog, text: t('Take a loan…') });
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

  /* Log entries carry their key and params, so history and receipts render in
   * the language that is active now rather than the one they happened in.
   * Entries from older saves only have .text; fall back to that. */
  function logText(entry) {
    return entry.k ? t(entry.k, entry.p) : (entry.text || '');
  }

  function renderLog() {
    var host = $('#log');
    clear(host);
    for (var i = state.log.length - 1; i >= 0; i--) {
      var entry = state.log[i];
      host.appendChild(el('div', { class: entry.type }, [
        el('span', { class: 't', text: 'm' + entry.turn }),
        logText(entry)
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

  /* Rebuilt rather than built once, so the profession and dream lists follow a
   * language change instead of staying in whichever language the page loaded
   * in. `force` keeps the current selections while relabelling them. */
  /* Professions double as levels, so the game remembers which ones you have
   * got out of the Rat Race with. Kept separately from the save, because it
   * outlives any one game. */
  var STARS_KEY = 'cashflow-solo-stars';

  function earnedStars() {
    try {
      var raw = localStorage.getItem(STARS_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Object.prototype.toString.call(list) === '[object Array]' ? list : [];
    } catch (e) { return []; }
  }

  function awardStar(id) {
    if (!id) return false;
    var list = earnedStars();
    if (list.indexOf(id) !== -1) return false;
    list.push(id);
    try { localStorage.setItem(STARS_KEY, JSON.stringify(list)); } catch (e) { /* private mode */ }
    return true;
  }

  function professionsByDifficulty() {
    return D.PROFESSIONS.slice().sort(function (a, b) {
      return (a.difficulty || 99) - (b.difficulty || 99);
    });
  }

  /* The easiest profession you have not beaten yet. */
  function nextProfession() {
    var done = earnedStars();
    var list = professionsByDifficulty();
    for (var i = 0; i < list.length; i++) {
      if (done.indexOf(list[i].id) === -1) return list[i];
    }
    return null;
  }

  function buildSetupOptions(force) {
    var sel = $('#prof-select');
    var dream = $('#dream-select');
    if (!sel) return;
    if (sel.options.length && !force) return;

    var suggested = nextProfession();
    var keepProf = sel.value || (suggested ? suggested.id : 'police-officer');
    var keepDream = dream.value;

    clear(sel);
    clear(dream);
    var done = earnedStars();
    professionsByDifficulty().forEach(function (p, i) {
      var star = done.indexOf(p.id) !== -1 ? ' \u2605' : '';
      sel.appendChild(el('option', {
        value: p.id,
        text: (i + 1) + ' \u00b7 ' + T.field(p, 'name') + star
      }));
    });
    D.DREAMS.forEach(function (d) {
      dream.appendChild(el('option', {
        value: d.id,
        text: T.field(d, 'name') + ' - ' + money(d.cost)
      }));
    });
    sel.value = keepProf;
    if (keepDream) dream.value = keepDream;
    if (!sel._wired) {
      sel.addEventListener('change', renderProfPreview);
      sel._wired = true;
    }
    renderProfPreview();
  }

  function openSetup() {
    buildSetupOptions(false);
    renderProfPreview();
    $('#setup').showModal();
  }

  function renderProfPreview() {
    var p = E.findById(D.PROFESSIONS, $('#prof-select').value) || D.PROFESSIONS[0];
    var expenses = p.taxes + p.home.payment + p.school.payment + p.car.payment +
      p.creditCard.payment + p.retail.payment + p.other;
    var host = $('#prof-preview');
    clear(host);
    [
      [t('Salary'), money(p.salary)],
      [t('Total expenses'), money(expenses)],
      [t('Monthly cash flow'), money(p.salary - expenses)],
      [t('Savings to start'), money(p.savings)],
      [t('Cost per child'), t('{$amount} / month', { amount: p.childCost })]
    ].forEach(function (r) {
      host.appendChild(el('div', {}, [el('span', { text: r[0] }), el('span', { text: r[1] })]));
    });
  }

  function setupLink() {
    var base = location.origin + location.pathname;
    return base + '?seed=' + encodeURIComponent(state.seed) +
      '&prof=' + encodeURIComponent(state.profession.id) +
      '&dream=' + encodeURIComponent(state.dream.id);
  }

  /* Reads a shared link. Anything missing falls back to the normal defaults,
   * so a truncated or hand-edited URL still starts a game rather than failing. */
  function setupFromUrl() {
    if (!location.search) return null;
    var q = {};
    location.search.replace(/^\?/, '').split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv[0]) q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    if (!q.seed) return null;
    return { seed: q.seed, professionId: q.prof || '', dreamId: q.dream || '' };
  }

  /* Clipboard access can be refused; showing the link is the fallback that
   * always works. */
  function showLink(url) {
    explain(t('Share this game'), [
      t('Anyone who opens this link starts from the same seed, profession and dream, and can make different choices from there.'),
      url
    ], t('Share'));
  }

  function shareSetup() {
    if (!state) return;
    var url = setupLink();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        showBanner(t('Link copied. Anyone who opens it starts this same game.'));
      }, function () { showLink(url); });
    } else {
      showLink(url);
    }
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

  /* Static text in index.html carries data-t with its English inside; this
   * swaps in the active language and runs again whenever the player changes
   * it. Keeping the English in the markup means the page is readable and
   * usable even if the translation files never load. */
  function applyStaticText() {
    var nodes = document.querySelectorAll('[data-t]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n.getAttribute('data-t-src')) n.setAttribute('data-t-src', n.textContent.trim());
      n.textContent = t(n.getAttribute('data-t-src'));
    }
    document.title = t('CASHFLOW Solo');
  }

  function buildLanguagePicker() {
    var sel = $('#lang-select');
    if (!sel) return;
    clear(sel);
    T.supported.forEach(function (code) {
      var o = el('option', { value: code, text: CF_langName(code) });
      if (code === T.lang()) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      T.setLang(sel.value);
      applyStaticText();
      buildLanguagePicker();
      if (state) { renderBank(); render(); }
      buildSetupOptions(true);
    });
  }

  function CF_langName(code) {
    return (window.CF.langNames && window.CF.langNames[code]) || code;
  }

  function init() {
    applyStaticText();
    buildLanguagePicker();
    $('#new-btn').addEventListener('click', openSetup);
    $('#undo-btn').addEventListener('click', undo);
    $('#export-btn').addEventListener('click', exportGame);
    $('#import-input').addEventListener('change', function (e) {
      if (e.target.files[0]) importGame(e.target.files[0]);
      e.target.value = '';
    });
    $('#start-btn').addEventListener('click', function (e) { e.preventDefault(); startGame(); });
    var shareBtn = $('#share-btn');
    if (shareBtn) shareBtn.addEventListener('click', function (e) { e.preventDefault(); shareSetup(); });
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

    var existing = null;
    try { existing = localStorage.getItem(SAVE_KEY); } catch (e) { /* private mode */ }

    /* A shared link names a starting position. With no game in progress it
     * simply starts it; with one in progress it fills the setup dialog and
     * waits, because someone else's link is not a reason to throw away the
     * game you are in the middle of. */
    var shared = setupFromUrl();
    if (shared) {
      buildSetupOptions(true);
      $('#seed-input').value = shared.seed;
      if (shared.professionId) $('#prof-select').value = shared.professionId;
      if (shared.dreamId) $('#dream-select').value = shared.dreamId;
      renderProfPreview();
      if (!existing) { startGame(); return; }
      $('#setup').showModal();
      return;
    }

    // Resume automatically if a save exists, otherwise open setup.
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
