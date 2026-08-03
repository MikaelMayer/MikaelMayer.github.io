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

  /* ------------------------------------------------------------------ *
   * Actions: every mutation goes through here so undo always works.
   * ------------------------------------------------------------------ */

  function snapshot() {
    undoStack.push(E.serialize(state));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  }

  function showError(msg) {
    var b = $('#error-banner');
    b.textContent = msg;
    b.classList.remove('hidden');
    clearTimeout(showError._t);
    showError._t = setTimeout(function () { b.classList.add('hidden'); }, 5000);
  }

  function doAction(type, payload) {
    snapshot();
    var res = E.act(state, type, payload);
    if (!res.ok) {
      undoStack.pop();          // nothing changed, so nothing to undo
      showError(res.error);
      return false;
    }
    render();
    return true;
  }

  function doRoll(dice) {
    snapshot();
    try {
      E.roll(state, dice);
    } catch (e) {
      undoStack.pop();
      showError(e.message);
      return;
    }
    render();
  }

  function undo() {
    if (!undoStack.length) return;
    state = JSON.parse(undoStack.pop());
    render();
  }

  /* ------------------------------------------------------------------ *
   * Render
   * ------------------------------------------------------------------ */

  function render() {
    if (!state) return;
    renderHeader();
    renderBoard();
    renderStatement();
    renderPending();
    renderAssets();
    renderBank();
    renderLog();
    renderInvariants();
    maybeScrollToAction();
  }

  /* On a phone the columns stack, so a new card can land below the fold and
   * look like nothing happened. Bring it into view -- but only when the
   * decision itself has changed, so the page never moves under a player who is
   * deliberately reading their financial statement. */
  var lastPendingKey = null;

  function pendingKey() {
    var p = state.pending;
    if (!p) return state.phase === 'ratrace' || state.phase === 'fasttrack' ? null : 'over:' + state.phase;
    return p.kind + ':' + (p.card ? p.card.id : p.title || '');
  }

  function maybeScrollToAction() {
    var key = pendingKey();
    var changed = key !== lastPendingKey;
    lastPendingKey = key;
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
      var node = el('div', {
        class: 'sq ' + type + (i === pos ? ' here' : '') + (mine ? ' mine' : ''),
        style: 'grid-row:' + cell[0] + ';grid-column:' + cell[1],
        title: label
      }, [
        el('span', { class: 'lbl-full', text: label }),
        el('span', { class: 'lbl-short', text: short })
      ]);
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
      centre.appendChild(el('div', { class: 'sub', text: 'Monthly cash flow' }));
      var cf = el('div', { class: 'big' });
      cf.appendChild(signed(s.cashflow));
      centre.appendChild(cf);
      centre.appendChild(el('div', {
        class: 'sub',
        text: 'Passive ' + money(s.passiveIncome) + ' of ' + money(s.totalExpenses) + ' needed'
      }));
      var bar = el('div', { class: 'progress' });
      var pct = s.totalExpenses > 0 ? Math.min(100, (s.passiveIncome / s.totalExpenses) * 100) : 0;
      bar.appendChild(el('i', { style: 'width:' + pct.toFixed(1) + '%' }));
      centre.appendChild(bar);
    } else {
      var f = E.ftStats(state);
      centre.appendChild(el('div', { class: 'sub', text: 'Cash Flow Day income' }));
      centre.appendChild(el('div', { class: 'big', text: money(f.totalIncome) }));
      centre.appendChild(el('div', {
        class: 'sub',
        text: 'New investment income ' + money(f.addedIncome) + ' of ' +
          money(E.constants.FAST_TRACK_CASHFLOW_GOAL)
      }));
      var bar2 = el('div', { class: 'progress' });
      var pct2 = Math.min(100, (f.addedIncome / E.constants.FAST_TRACK_CASHFLOW_GOAL) * 100);
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

  function renderStatement() {
    var s = E.stats(state);
    var head = $('#headline');
    clear(head);

    function box(k, v, cls) {
      var b = el('div', { class: 'box' }, [el('div', { class: 'k', text: k })]);
      var val = el('div', { class: 'v' + (cls ? ' ' + cls : '') });
      val.appendChild(typeof v === 'string' ? document.createTextNode(v) : v);
      b.appendChild(val);
      return b;
    }

    head.appendChild(box('Cash', money(state.cash)));
    if (state.phase === 'fasttrack' || state.phase === 'won') {
      var f = E.ftStats(state);
      head.appendChild(box('Cash Flow Day', money(f.totalIncome), 'pos'));
    } else {
      head.appendChild(box('Monthly cash flow', signed(s.cashflow)));
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
      row('Bank loan', money(p.bankLoan), true),
      row('Total expenses', money(s.totalExpenses), false, true)
    ]));

    st.appendChild(group('Liabilities', [
      row('Home mortgage', money(state.profession.home.liability), true),
      state.profession.school.liability ? row('School loan', money(state.profession.school.liability), true) : null,
      row('Car loan', money(state.profession.car.liability), true),
      row('Credit cards', money(state.profession.creditCard.liability), true),
      row('Retail debt', money(state.profession.retail.liability), true),
      row('Bank loan', money(state.bankLoan), true),
      row('Property mortgages', money(propertyDebt()), true)
    ]));
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

    var p = state.pending;
    if (!p) {
      host.appendChild(rollCard());
      return;
    }

    switch (p.kind) {
      case 'chooseDeck': return host.appendChild(chooseDeckCard(p));
      case 'deal': return host.appendChild(dealCard(p));
      case 'charity': return host.appendChild(simpleCard(p, 'Donate ' + money(p.amount), 'charityDonate', 'Decline'));
      case 'doodadOptional': return host.appendChild(optionalDoodadCard(p));
      case 'notice': return host.appendChild(noticeCard(p));
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
      var qty = el('input', { type: 'number', id: 'qty', min: '1', value: String(Math.min(maxBuy || 1, 10)) });
      buttons.appendChild(qty);
      var stockBuy = el('button', {
        class: 'primary',
        onclick: function () { doAction('buyStock', { qty: qty.value }); },
        text: maxBuy < 1 ? 'Cannot afford a share' : 'Buy'
      });
      if (maxBuy < 1) stockBuy.disabled = true;
      buttons.appendChild(stockBuy);
      if (shares > 0) {
        buttons.appendChild(el('button', {
          onclick: function () { doAction('sellStock', { qty: qty.value }); },
          text: 'Sell'
        }));
        buttons.appendChild(el('button', {
          class: 'ghost',
          onclick: function () { doAction('sellStock', { qty: shares }); },
          text: 'Sell all ' + shares
        }));
      }
      card.appendChild(cardFooter(card, buttons, 'Pass'));
      if (c.price >= c.range[1] * 0.8) {
        card.appendChild(el('div', { class: 'hint', text: 'This price is near the top of its range.' }));
      } else if (c.price <= c.range[0] * 1.5) {
        card.appendChild(el('div', { class: 'hint', text: 'This price is near the bottom of its range.' }));
      }
      return card;
    }

    if (c.kind === 'gold') {
      card.appendChild(terms([
        ['Price per coin', money(c.unitPrice)],
        ['Maximum', c.maxQty + ' coins'],
        ['Monthly income', 'none']
      ]));
      var maxCoins = Math.floor(state.cash / c.unitPrice);
      var gq = el('input', { type: 'number', id: 'qty', min: '1', max: String(c.maxQty), value: '1' });
      buttons.appendChild(gq);
      var goldBuy = el('button', {
        class: 'primary',
        onclick: function () { doAction('buyGold', { qty: gq.value }); },
        text: maxCoins < 1 ? 'Cannot afford a coin' : 'Buy coins'
      });
      if (maxCoins < 1) goldBuy.disabled = true;
      buttons.appendChild(goldBuy);
      card.appendChild(cardFooter(card, buttons, 'Pass'));
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
      buttons.appendChild(el('button', { onclick: function () { doAction('buyDeal'); }, text: 'Do it anyway' }));
      card.appendChild(cardFooter(card, buttons, 'Walk away'));
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
    var buyBtn = el('button', {
      class: 'primary',
      onclick: function () { doAction('buyDeal'); },
      text: outOfReach ? 'Out of reach' : 'Buy'
    });
    if (outOfReach) buyBtn.disabled = true;
    buttons.appendChild(buyBtn);
    card.appendChild(cardFooter(card, buttons, 'Pass'));
    if (short > 0) {
      card.appendChild(el('div', {
        class: 'hint',
        text: short > credit
          ? 'You are short ' + money(short) + ' and the bank will only lend another ' +
            money(credit) + '. This one is out of reach today.'
          : 'You are short ' + money(short) + '. Buying anyway means a bank loan at $100 a month ' +
            'per $1,000 - that interest comes straight off your cash flow.'
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

  /* A bill that has already been paid. One button, and it says plainly why
   * there was nothing to decide -- so that the doodads you CAN refuse read as
   * a genuine choice rather than an inconsistency. */
  function noticeCard(p) {
    return el('div', { class: 'card ' + (p.cls || 'info') }, [
      el('span', { class: 'tagline', text: 'Bill — already paid' }),
      el('h3', { text: p.title }),
      el('p', { text: p.text }),
      p.amount ? terms([['Paid', money(p.amount)], ['Cash left', money(state.cash)]]) : null,
      el('div', { class: 'buttons' }, [
        el('button', { class: 'primary', onclick: function () { doAction('acknowledge'); }, text: 'Continue' })
      ])
    ]);
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
      el('div', { class: 'buttons' }, [
        el('button', { class: 'primary', onclick: function () { doAction(yesAction); }, text: yesLabel }),
        el('button', { class: 'ghost', onclick: function () { doAction('acknowledge'); }, text: noLabel })
      ])
    ]);
  }

  function sellAssetCard(p) {
    var card = el('div', { class: 'card info' }, [
      el('h3', { text: p.title }),
      el('p', { text: p.text })
    ]);
    p.offers.forEach(function (o) {
      var gain = o.price - o.cost;
      card.appendChild(terms([
        [o.name, ''],
        ['Sale price', money(o.price)],
        ['Mortgage cleared', money(o.mortgage)],
        ['Cash to you', money(o.netCash)],
        ['Against purchase price', (gain >= 0 ? '+' : '') + money(gain)],
        ['Passive income lost', money(o.cashflowLost) + ' / month']
      ]));
      card.appendChild(el('div', { class: 'buttons' }, [
        el('button', {
          class: 'primary',
          onclick: function () { doAction('sellAsset', { assetId: o.assetId }); },
          text: 'Sell ' + o.name
        })
      ]));
    });
    card.appendChild(el('div', { class: 'buttons' }, [
      el('button', { class: 'ghost', onclick: function () { doAction('acknowledge'); }, text: 'Keep everything' })
    ]));
    card.appendChild(el('div', {
      class: 'hint',
      text: 'A lump sum is not the same as income. Selling raises cash but lowers the number that gets you out of the Rat Race.'
    }));
    return card;
  }

  function sellGoldCard(p) {
    var qty = el('input', { type: 'number', id: 'qty', min: '1', max: String(p.maxQty), value: String(p.maxQty) });
    return el('div', { class: 'card gold' }, [
      el('h3', { text: p.title }),
      el('p', { text: p.text }),
      terms([['Price per coin', money(p.unitPrice)], ['Coins you own', String(p.maxQty)]]),
      el('div', { class: 'buttons' }, [
        qty,
        el('button', { class: 'primary', onclick: function () { doAction('sellGold', { qty: qty.value }); }, text: 'Sell coins' }),
        el('button', { class: 'ghost', onclick: function () { doAction('acknowledge'); }, text: 'Hold' })
      ])
    ]);
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

    var items = [];

    for (var sym in state.stocks) {
      var h = state.stocks[sym];
      items.push([sym + ' - ' + D.STOCK_SYMBOLS[sym].name, h.shares + ' shares, paid ' + money(h.invested),
        D.STOCK_SYMBOLS[sym].dividend ? money(h.shares * D.STOCK_SYMBOLS[sym].dividend) + '/mo' : '']);
    }

    if (state.phase === 'fasttrack' || state.phase === 'won') {
      state.ftInvestments.forEach(function (i) {
        items.push([i.name, money(i.cost), money(i.cashflow) + '/mo']);
      });
    }

    state.assets.forEach(function (a) {
      if (a.category === 'gold') {
        items.push([a.name, a.qty + ' coins, paid ' + money(a.cost), '']);
      } else {
        items.push([a.name,
          money(a.cost) + (a.mortgage ? ', ' + money(a.mortgage) + ' owed' : ' owned outright'),
          money(a.cashflow) + '/mo']);
      }
    });

    if (!items.length) {
      host.appendChild(el('div', { class: 'empty', text: 'Nothing yet. Every Opportunity square is a chance to start.' }));
      return;
    }
    items.forEach(function (it) {
      host.appendChild(el('div', { class: 'item' }, [
        el('span', { class: 'n', text: it[0] }),
        el('span', { class: 'm', text: it[1] }),
        el('span', { class: 'm ' + (it[2] ? 'pos' : ''), text: it[2] })
      ]));
    });
  }

  function renderBank() {
    var host = $('#bank');
    clear(host);

    if (state.phase !== 'ratrace') {
      host.appendChild(el('div', {
        class: 'empty',
        text: state.phase === 'bankrupt'
          ? 'The bank is closed to you.'
          : 'There is no borrowing on the Fast Track. Investments are bought with cash.'
      }));
      return;
    }

    var amt = el('input', { type: 'number', id: 'loan-amount', min: '1000', step: '1000', value: '1000' });
    host.appendChild(el('div', { class: 'buttons' }, [
      amt,
      el('button', { onclick: function () { doAction('borrow', { amount: amt.value }); }, text: 'Borrow' }),
      el('button', { onclick: function () { doAction('repay', { amount: amt.value }); }, text: 'Repay' })
    ]));
    host.appendChild(el('div', {
      class: 'hint',
      text: '$1,000 blocks at $100 a month each - 120% a year, the most expensive money in the game. ' +
        'You owe ' + money(state.bankLoan) + ' of a ' + money(E.creditLimit(state)) +
        ' limit, so you can still borrow ' + money(E.availableCredit(state)) + '.'
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

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, E.serialize(state));
      showError('Game saved to this browser.');
    } catch (e) {
      showError('Could not save: ' + e.message);
    }
  }

  function load() {
    try {
      var text = localStorage.getItem(SAVE_KEY);
      if (!text) { showError('No saved game found.'); return; }
      state = E.deserialize(text);
      undoStack = [];
      lastPendingKey = null;
      $('#setup').close();
      renderBank();
      render();
    } catch (e) {
      showError('Could not load: ' + e.message);
    }
  }

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
        showError('Could not import: ' + e.message);
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
    $('#save-btn').addEventListener('click', save);
    $('#load-btn').addEventListener('click', load);
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
