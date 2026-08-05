/* CASHFLOW Solo -- game engine.
 *
 * Design rules this file follows, because they are what keep it bug-free:
 *
 *  1. All state lives in one plain-JSON object. No DOM, no timers, no globals.
 *     That makes it saveable, testable and undoable by deep-copy.
 *  2. All randomness goes through state.rngState. Same seed + same actions =
 *     same game, every time. Bug reports are reproducible.
 *  3. Money is integer dollars. Never a float, never a rounding surprise.
 *  4. Exactly one place can be waiting for the player: state.pending. If it is
 *     null the player may roll; if it is set, the only legal moves are the ones
 *     it lists. This is what stops the "stuck board" class of bug.
 *  5. Derived numbers (income, expenses, cash flow) are computed from assets on
 *     every read -- never stored and incrementally patched. Incremental
 *     bookkeeping is where financial sims drift out of balance.
 *  6. checkInvariants() re-verifies the whole financial statement after every
 *     action. If the engine ever contradicts itself, the UI says so loudly
 *     instead of quietly paying you the wrong salary.
 */
(function (global) {
  'use strict';

  var D = global.CF.data;
  var makeRng = global.CF.makeRng;

  /* Every player-visible string in this file is a translation key with named
   * placeholders. Log entries keep the key and its params alongside the
   * rendered English, so switching language re-renders past turns rather than
   * leaving them stranded in the language they happened in. */
  var T = global.CF.i18n;
  var t = T.t;

  var MAX_CHILDREN = 3;
  var LOAN_UNIT = 1000;          // Bank lends in $1,000 blocks
  var LOAN_RATE_PER_UNIT = 100;  // ...at $100/month interest per block (10%)
  var FAST_TRACK_MULTIPLIER = 100;
  /* Winning the Fast Track on cash flow means DOUBLING the income you arrived
   * with -- you must add at least as much again as the Rat Race handed you.
   *
   * A flat target does not hold up: a player who escapes with $350,000 a month
   * clears a fixed $50,000 with one purchase, while a player who escapes with
   * $10,000 has to work for it. Scaling the goal to what you arrived with asks
   * the same effort of everyone. The floor keeps a very small escape from
   * having a trivial second act. */
  var FAST_TRACK_CASHFLOW_GOAL = 50000;   // the floor, not the whole rule

  function fastTrackGoal(state) {
    return Math.max(FAST_TRACK_CASHFLOW_GOAL, state.ftBaseIncome);
  }

  /* Total bank debt is capped at this many months of total income.
   *
   * Without a cap, a player whose expenses exceed their income borrows to make
   * payday, which raises their expenses, which makes the next payday worse --
   * debt compounds until the numbers exceed what a double can represent
   * exactly and the statement quietly stops adding up. A credit limit turns
   * that silent corruption into the outcome it actually is: the bank stops
   * lending, and if you still cannot pay, you are bankrupt. */
  var CREDIT_MULTIPLE = 10;

  // Defensive ceiling. Nothing in a correct game comes near it.
  var SANE_MAX = 1e12;

  /* The consumer debts a player starts with. Each can be cleared outright,
   * which removes its monthly payment for the rest of the game. */
  var LIABILITY_NAMES = {
    home: 'home mortgage',
    school: 'school loan',
    car: 'car loan',
    creditCard: 'credit cards',
    retail: 'retail debt'
  };

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function rngFor(state) {
    var rng = makeRng(state.rngState);
    return {
      rng: rng,
      commit: function () { state.rngState = rng.getState(); }
    };
  }

  // Locale-aware: $1,000 in English, 1 000 $ in French.
  var money = T.money;

  // Names that live in data.js and have a translation keyed by card id.
  function name(obj) { return T.field(obj, 'title') || T.field(obj, 'name'); }

  /* For log params only: keep the card, not its name. name() is still right
   * for anything rendered once, now, in the current language. */
  function ref(obj, field) {
    if (!obj || !obj.id) return field ? (obj && obj[field]) || '' : name(obj);
    var f = field || (obj.title !== undefined ? 'title' : 'name');
    return { id: obj.id, f: f, en: obj[f] };
  }

  function log(state, key, params, type) {
    if (typeof params === 'string') { type = params; params = null; }
    state.log.push({
      turn: state.months,
      k: key,
      p: params || null,
      text: t(key, params),          // rendered now, for old readers and exports
      type: type || 'info'
    });
    if (state.log.length > 500) state.log.shift();
  }

  /* Throw a player-facing error carrying its key, so the interface can render
   * it in the current language rather than the one it was written in. */
  function fail(key, params) {
    var e = new Error(t(key, params));
    e.k = key;
    e.p = params || null;
    throw e;
  }

  /* ------------------------------------------------------------------ *
   * Deck handling -- draw pile plus discard, reshuffled when exhausted.
   * ------------------------------------------------------------------ */

  function makeDeck(cards, rng) {
    return { draw: rng.shuffle(cards.map(function (c) { return c.id; })), discard: [] };
  }

  function drawCard(state, deckName, catalogue) {
    var deck = state.decks[deckName];
    if (deck.draw.length === 0) {
      if (deck.discard.length === 0) {
        // Cannot happen with the shipped content, but never hand back
        // undefined -- that is how a null card crashes a board.
        throw new Error('Deck "' + deckName + '" is empty and has no discards.');
      }
      var r = rngFor(state);
      deck.draw = r.rng.shuffle(deck.discard);
      deck.discard = [];
      r.commit();
    }
    var id = deck.draw.shift();
    deck.discard.push(id);
    var card = findById(catalogue, id);
    if (!card) throw new Error('Unknown card id: ' + id);
    return clone(card);
  }

  function findById(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Derived financials -- always recomputed, never cached.
   * ------------------------------------------------------------------ */

  function stockIncome(state) {
    var total = 0;
    for (var sym in state.stocks) {
      var meta = D.STOCK_SYMBOLS[sym];
      if (meta && meta.dividend) total += state.stocks[sym].shares * meta.dividend;
    }
    return total;
  }

  function assetIncome(state, category) {
    var total = 0;
    for (var i = 0; i < state.assets.length; i++) {
      var a = state.assets[i];
      if (a.category === category) total += a.cashflow;
    }
    return total;
  }

  function stats(state) {
    var p = state.profession;

    var interestDividends = stockIncome(state) + assetIncome(state, 'paper');
    var realEstateIncome = assetIncome(state, 'realestate');
    var businessIncome = assetIncome(state, 'business');
    var passive = interestDividends + realEstateIncome + businessIncome;
    var totalIncome = p.salary + passive;

    var childExpense = state.children * p.childCost;
    var bankLoanPayment = (state.bankLoan / LOAN_UNIT) * LOAN_RATE_PER_UNIT;

    var expenseParts = {
      taxes: p.taxes,
      home: p.home.payment,
      school: p.school.payment,
      car: p.car.payment,
      creditCard: p.creditCard.payment,
      retail: p.retail.payment,
      other: p.other + state.extraExpenses,
      children: childExpense,
      bankLoan: bankLoanPayment
    };
    var totalExpenses = 0;
    for (var k in expenseParts) totalExpenses += expenseParts[k];

    return {
      salary: p.salary,
      interestDividends: interestDividends,
      realEstateIncome: realEstateIncome,
      businessIncome: businessIncome,
      passiveIncome: passive,
      totalIncome: totalIncome,
      expenseParts: expenseParts,
      totalExpenses: totalExpenses,
      cashflow: totalIncome - totalExpenses,
      // The only thing that matters: does money you don't work for cover your life?
      escaped: passive > totalExpenses
    };
  }

  function ftStats(state) {
    var invIncome = 0;
    for (var i = 0; i < state.ftInvestments.length; i++) {
      invIncome += state.ftInvestments[i].cashflow;
    }
    return {
      baseIncome: state.ftBaseIncome,
      investmentIncome: invIncome,
      totalIncome: state.ftBaseIncome + invIncome,
      // Winning condition #2 is measured on income ADDED since arriving.
      addedIncome: invIncome
    };
  }

  /* ------------------------------------------------------------------ *
   * Cash movement. Every dollar in or out of the player goes through here.
   * ------------------------------------------------------------------ */

  function credit(state, amount, reason) {
    if (amount <= 0) return;
    state.cash += amount;
    log(state, '+{$amount}  {reason}', { amount: amount, reason: reason }, 'gain');
  }

  /* How much the bank is willing to lend you in total, based on what you earn.
   * On the Fast Track there is no borrowing at all -- you buy with cash. */
  function creditLimit(state) {
    if (state.phase !== 'ratrace') return 0;
    var s = stats(state);
    return Math.max(0, Math.floor(s.totalIncome * CREDIT_MULTIPLE / LOAN_UNIT) * LOAN_UNIT);
  }

  function availableCredit(state) {
    return Math.max(0, creditLimit(state) - state.bankLoan);
  }

  /* ---- Forced liquidation ------------------------------------------
   *
   * The table rule is "if you cannot pay, sell assets; if you still cannot
   * pay, you are bankrupt". A solo player facing a bill they cannot cover has
   * no real choice about it, so the engine does it for them and says exactly
   * what it sold and why, rather than either deadlocking or wiping them out.
   *
   * A hurried sale is a bad sale: property goes for 80% of what you paid.
   * Shares, gold and certificates are liquid and come back at cost. */
  var DISTRESS_FACTOR = 0.8;

  function liquidationValue(asset) {
    if (asset.category === 'gold' || asset.category === 'paper') return asset.cost;
    var proceeds = Math.round(asset.cost * DISTRESS_FACTOR) - asset.mortgage;
    return proceeds > 0 ? proceeds : 0;   // you cannot dump a property for less than its debt
  }

  function liquidationCandidates(state) {
    var out = [];
    for (var sym in state.stocks) {
      var h = state.stocks[sym];
      var meta = D.STOCK_SYMBOLS[sym];
      if (h.invested > 0) {
        out.push({
          type: 'stock', key: sym, name: h.shares + ' ' + sym + ' shares',
          value: h.invested, cashflow: h.shares * (meta ? meta.dividend : 0)
        });
      }
    }
    for (var i = 0; i < state.assets.length; i++) {
      var a = state.assets[i];
      var v = liquidationValue(a);
      if (v > 0) out.push({ type: 'asset', key: a.id, name: a.name, value: v, cashflow: a.cashflow });
    }
    // Sell the least productive holding first: the one earning the least per
    // dollar it would release. Ties break on name so the choice is repeatable.
    out.sort(function (x, y) {
      var rx = x.cashflow / Math.max(1, x.value);
      var ry = y.cashflow / Math.max(1, y.value);
      if (rx !== ry) return rx - ry;
      return String(x.key) < String(y.key) ? -1 : 1;
    });
    return out;
  }

  /* What a forced sale could actually raise, for the interface to warn with.
   * Same candidates and same values the forced sale itself would use, so the
   * warning cannot disagree with what then happens. */
  function sellableValue(state) {
    var list = liquidationCandidates(state);
    var total = 0;
    for (var i = 0; i < list.length; i++) total += list[i].value;
    return { count: list.length, value: total };
  }

  function liquidate(state, candidate, reason) {
    if (candidate.type === 'stock') {
      delete state.stocks[candidate.key];
      state.cash += candidate.value;
      log(state, 'Forced sale: sold {name} for {$value} to cover {reason}.', { name: candidate.name, value: candidate.value, reason: reason }, 'loss');
      return;
    }
    for (var i = 0; i < state.assets.length; i++) {
      if (state.assets[i].id === candidate.key) {
        var a = state.assets[i];
        state.assets.splice(i, 1);
        state.cash += candidate.value;
        log(state, 'Forced sale: sold {name} for {$value} (80% of what you paid) to cover {reason}. Passive income falls by {$lost}/mo.', { name: ref(a), value: candidate.value, reason: reason, lost: a.cashflow }, 'loss');
        return;
      }
    }
    throw new Error('Liquidation target vanished: ' + candidate.key);
  }

  /* Sell holdings until cash plus remaining credit covers `amount`. */
  function liquidateFor(state, amount, reason) {
    var guard = 0;
    while (state.cash + availableCredit(state) < amount) {
      if (++guard > 500) throw new Error('Liquidation did not terminate.');
      var candidates = liquidationCandidates(state);
      if (!candidates.length) return false;
      liquidate(state, candidates[0], reason);
    }
    return true;
  }

  /* Thrown when a required payment cannot be met. Caught at the two public
   * entry points (roll and act) so the rest of the turn stops cleanly instead
   * of running on against a dead player. */
  function bankrupt(state, reason) {
    state.phase = 'bankrupt';
    state.pending = null;
    state.result = { how: 'bankrupt', months: state.months, reason: reason };
    log(state, 'BANKRUPT. You could not pay for {reason}, you had {$cash} in cash, and you can borrow no more against {$income} a month of income.', { reason: reason, cash: state.cash, income: stats(state).totalIncome }, 'loss');
    var err = new Error('BANKRUPT');
    err.bankrupt = true;
    throw err;
  }

  /* Pay `amount`. If cash is short, the bank lends the shortfall rounded up to
   * the next $1,000 -- the same thing a table banker does, and it guarantees
   * cash can never go negative and a required payment can never deadlock.
   *
   * `voluntary` marks payments the player chose to make (a purchase, a
   * donation). Those are refused with an explanation when credit runs out.
   * Everything else is a bill that must be paid, and failing to pay it is
   * bankruptcy. */
  function debit(state, amount, reason, voluntary) {
    if (amount <= 0) return 0;
    var borrowed = 0;
    if (state.cash < amount) {
      var needed = Math.ceil((amount - state.cash) / LOAN_UNIT) * LOAN_UNIT;
      var available = availableCredit(state);
      if (needed > available) {
        if (voluntary) {
          fail('That needs {$amount}, you have {$cash} in cash, and you can borrow at most another {$available} against your income.', { amount: amount, cash: state.cash, available: available });
        }
        // A bill you must pay. Sell what you have to before giving up.
        liquidateFor(state, amount, reason);
        if (state.cash >= amount) {
          state.cash -= amount;
          log(state, '-{$amount}  {reason}', { amount: amount, reason: reason }, 'loss');
          return 0;
        }
        needed = Math.ceil((amount - state.cash) / LOAN_UNIT) * LOAN_UNIT;
        available = availableCredit(state);
        if (needed > available) return bankrupt(state, reason);
      }
      borrowed = needed;
      state.bankLoan += borrowed;
      state.cash += borrowed;
      log(state, 'Forced loan of {$borrowed} to cover {reason} (adds {$monthly}/mo to expenses).', { borrowed: borrowed, reason: reason, monthly: borrowed / LOAN_UNIT * LOAN_RATE_PER_UNIT }, 'loan');
    }
    state.cash -= amount;
    log(state, '-{$amount}  {reason}', { amount: amount, reason: reason }, 'loss');
    return borrowed;
  }

  /* ------------------------------------------------------------------ *
   * Setup
   * ------------------------------------------------------------------ */

  function createGame(opts) {
    /* createGame(1234) is the obvious way to ask for a seeded game, and it
     * used to be the one way to silently NOT get one: a number has no .seed,
     * so the game came back randomly seeded and looked deterministic until
     * you compared two of them. Reproducing a reported game from its seed is
     * the point of having seeds, so the shorthand is accepted rather than
     * quietly ignored. */
    if (typeof opts === 'number' || typeof opts === 'string') opts = { seed: opts };
    opts = opts || {};
    var seed = (opts.seed === undefined || opts.seed === null || opts.seed === '')
      ? global.CF.randomSeed() : (parseInt(opts.seed, 10) || 0);

    var profession = findById(D.PROFESSIONS, opts.professionId) || D.PROFESSIONS[0];
    var dream = findById(D.DREAMS, opts.dreamId) || D.DREAMS[0];

    var rng = makeRng(seed);
    var state = {
      version: 1,
      seed: seed,
      rngState: 0,           // set below, after deck shuffling consumes the rng
      phase: 'ratrace',      // ratrace | fasttrack | won
      months: 0,             // turns taken; the score is how few you need
      position: 0,
      cash: profession.savings,
      children: 0,
      refused: 0,            // total value of optional doodads declined
      extraExpenses: 0,      // permanent monthly expenses picked up along the way
      bankLoan: 0,
      charityTurns: 0,       // turns remaining where you may roll 1 or 2 dice
      skipTurns: 0,          // downsized
      profession: clone(profession),
      dream: clone(dream),
      stocks: {},            // symbol -> {shares, invested}
      assets: [],            // real estate / businesses / paper
      ftInvestments: [],
      ftBaseIncome: 0,
      ftPosition: 0,
      nextAssetId: 1,
      pending: null,
      lastRoll: null,
      decks: {
        small: makeDeck(D.SMALL_DEALS, rng),
        big: makeDeck(D.BIG_DEALS, rng),
        doodad: makeDeck(D.DOODADS, rng),
        market: makeDeck(D.MARKET, rng)
      },
      log: [],
      result: null
    };
    state.rngState = rng.getState();

    log(state, 'Game {seed} begins. {job}, take-home {$salary}/mo, savings {$savings}.', { seed: seed, job: ref(profession, 'name'), salary: profession.salary, savings: profession.savings }, 'system');
    log(state, 'Dream: {name} ({$cost}).', { name: ref(dream, 'name'), cost: dream.cost }, 'system');
    var s = stats(state);
    log(state, 'Starting monthly cash flow: {$cf}. Passive income: {$passive} against {$expenses} of expenses.', { cf: s.cashflow, passive: s.passiveIncome, expenses: s.totalExpenses }, 'system');
    return state;
  }

  /* ------------------------------------------------------------------ *
   * Turn flow
   * ------------------------------------------------------------------ */

  function isOver(state) {
    return state.phase === 'won' || state.phase === 'bankrupt';
  }

  function canRoll(state) {
    return !isOver(state) && state.pending === null;
  }

  function diceOptions(state) {
    if (state.phase === 'fasttrack') return [2];
    return state.charityTurns > 0 ? [1, 2] : [1];
  }

  /* `forcedDice` is an optional array of die faces. The game never passes it;
   * the test suite and any scripted teaching scenario do, so that a specific
   * square can be reached on purpose. */
  function roll(state, diceCount, forcedDice) {
    try {
      rollInner(state, diceCount, forcedDice);
    } catch (e) {
      if (!e.bankrupt) throw e;
    }
  }

  function rollInner(state, diceCount, forcedDice) {
    if (!canRoll(state)) fail('You cannot roll right now.');
    var allowed = diceOptions(state);
    if (forcedDice) diceCount = forcedDice.length;
    if (allowed.indexOf(diceCount) === -1) diceCount = allowed[0];

    state.months += 1;
    if (state.charityTurns > 0) state.charityTurns -= 1;

    if (state.skipTurns > 0) {
      state.skipTurns -= 1;
      state.lastRoll = null;
      log(state, 'Turn lost. {n} to go.', { n: state.skipTurns }, 'system');
      return;
    }

    var dice = [];
    var total = 0;
    if (forcedDice) {
      for (var f = 0; f < forcedDice.length; f++) {
        var v = forcedDice[f];
        if (!(v >= 1 && v <= 6 && Math.floor(v) === v)) throw new Error('Forced die out of range: ' + v);
        dice.push(v);
        total += v;
      }
    } else {
      var r = rngFor(state);
      for (var i = 0; i < diceCount; i++) {
        var d = r.rng.die();
        dice.push(d);
        total += d;
      }
      r.commit();
    }
    state.lastRoll = dice;
    log(state, 'Rolled {dice} = {total}.', { dice: dice.join(' + '), total: total }, 'roll');

    if (state.phase === 'ratrace') moveRatRace(state, total);
    else moveFastTrack(state, total);

    /* Escape is checked after player actions, and today only an action can
     * raise passive income -- splits exist, but none of them touch a
     * dividend-paying symbol. That is a property of the current card set, not
     * a rule, so check here too rather than leaving a trap for whoever adds
     * the first dividend split. */
    afterAction(state);
  }

  function moveRatRace(state, steps) {
    var board = D.RAT_RACE_BOARD;
    for (var i = 0; i < steps; i++) {
      state.position = (state.position + 1) % board.length;
      // Payday is collected when you pass it as well as when you land on it,
      // including the final square of the move.
      if (board[state.position] === 'PAYDAY') payday(state);
    }
    resolveRatRaceSquare(state, board[state.position]);
  }

  function payday(state) {
    var s = stats(state);
    if (s.cashflow >= 0) {
      state.cash += s.cashflow;
      log(state, 'You passed PAYDAY and collected {$amount}.', { amount: s.cashflow }, 'payday');
      return;
    }
    /* Expenses outran income. When there is cash to cover it this is just a
     * payment; when there is not, debit() handles borrowing, forced sales and
     * bankruptcy exactly as before, and says so in its own line. */
    var owed = -s.cashflow;
    if (state.cash >= owed) {
      state.cash -= owed;
      log(state, 'You passed PAYDAY. Your expenses came to {$amount} more than your income.',
        { amount: owed }, 'payday');
      return;
    }
    debit(state, owed, 'PAYDAY (your expenses exceed your income)');
  }

  function resolveRatRaceSquare(state, type) {
    switch (type) {
      case 'PAYDAY':
        // Already paid during movement.
        break;
      case 'OPPORTUNITY':
        state.pending = {
          kind: 'chooseDeck',
          title: 'Deal',
          text: t('Take a Small Deal or a Big Deal? Big Deals need more money down and pay far more.')
        };
        break;
      case 'DOODAD':
        drawDoodad(state);
        break;
      case 'MARKET':
        drawMarket(state);
        break;
      case 'CHARITY':
        var s = stats(state);
        state.pending = {
          kind: 'charity',
          title: 'Charity',
          amount: Math.round(s.totalIncome * 0.1),
          text: t('Donate 10% of your total income ({$amount}) and for the next 3 turns you may roll one die or two. More choices, more opportunities.', { amount: Math.round(s.totalIncome * 0.1) })
        };
        break;
      case 'BABY':
        if (state.children >= MAX_CHILDREN) {
          log(state, 'A new baby - but you already have {max} children, the maximum. No change.', { max: MAX_CHILDREN }, 'system');
        } else {
          state.children += 1;
          log(state, 'A baby arrives. Child expenses rise by {$cost}/mo (now {n} children).', { cost: state.profession.childCost, n: state.children }, 'system');
        }
        break;
      case 'DOWNSIZED':
        state.pending = {
          kind: 'bill', title: 'You lost your job',
          text: 'You still owe a full month of everything: taxes, the mortgage, the loans, the lot. ' +
            'You will also lose your next two turns.',
          amount: stats(state).totalExpenses,
          reason: t('Lost your job - one month of expenses'),
          then: 'downsize'
        };
        break;
      default:
        throw new Error('Unknown square type: ' + type);
    }
    if (state.pending === null) afterAction(state);
  }

  /* ------------------------------------------------------------------ *
   * Cards
   * ------------------------------------------------------------------ */

  function drawDoodad(state) {
    var card = drawCard(state, 'doodad', D.DOODADS);
    var amount = card.amount;
    if (card.perChild) {
      amount = card.amount * state.children;
      if (amount === 0) {
        log(state, '{title} - you have no children, so there is nothing to pay.', { title: ref(card) }, 'system');
        return;
      }
    }
    if (card.optional) {
      state.pending = {
        kind: 'doodadOptional', id: card.id, title: card.title, text: card.text || '',
        amount: amount, addExpense: card.addExpense || 0, action: card.action || null
      };
      return;
    }

    /* A compulsory expense is still an action. The player has to press Pay --
     * they see the amount, their cash before, and their cash after, and then
     * they hand the money over. Deducting it for them and reporting it as
     * "already paid" is both confusing and a wasted teaching moment. */
    state.pending = {
      kind: 'bill', id: card.id, title: card.title, text: card.text || '',
      amount: amount, reason: 'Expense: ' + card.title
    };
  }

  /* Who a market cost actually lands on. Naming the group is what turns
   * "this does not touch you" into an explanation the player can act on:
   * it tells them what they would need to own for it to matter. */
  var WHO_IT_HITS = {
    perProperty: 'people who own property',
    perBusiness: 'people who own a business',
    ifAnyRental: 'landlords with tenants'
  };

  function drawMarket(state) {
    var card = drawCard(state, 'market', D.MARKET);

    if (card.kind === 'none') {
      log(state, '{title}. {text}', { title: ref(card), text: ref(card, 'text') }, 'system');
      return;
    }

    if (card.kind === 'cost') {
      var count = 0;
      if (card.scope === 'perProperty') count = countAssets(state, 'realestate');
      else if (card.scope === 'perBusiness') count = countAssets(state, 'business');
      else if (card.scope === 'ifAnyRental') count = countAssets(state, 'realestate') > 0 ? 1 : 0;
      if (count === 0) {
        log(state, '{title} - a cost for {who}. You have none, so you pay nothing.', { title: ref(card), who: { k: WHO_IT_HITS[card.scope] } }, 'system');
        return;
      }
      state.pending = {
        kind: 'bill', id: card.id, title: card.title, amount: card.amount * count,
        text: T.field(card, 'text'),
        reason: name(card)
      };
      return;
    }

    if (card.kind === 'goldbuyer') {
      var coins = totalGold(state);
      if (coins === 0) {
        log(state, '{title} - {text} You own no gold coins to sell.',
          { title: ref(card), text: ref(card, 'text') }, 'system');
        return;
      }
      state.pending = {
        kind: 'sellGold', id: card.id, title: card.title, text: card.text || '',
        unitPrice: card.unitPrice, maxQty: coins
      };
      return;
    }

    // kind === 'buyer'
    var offers = buildOffers(state, card);
    if (offers.length === 0) {
      log(state, '{title} - {text} You own nothing this buyer wants.',
        { title: ref(card), text: ref(card, 'text') }, 'system');
      return;
    }
    state.pending = {
      kind: 'sellAsset', id: card.id, title: card.title, text: card.text || '', offers: offers
    };
  }

  function countAssets(state, category) {
    var n = 0;
    for (var i = 0; i < state.assets.length; i++) {
      if (state.assets[i].category === category) n++;
    }
    return n;
  }

  function totalGold(state) {
    var n = 0;
    for (var i = 0; i < state.assets.length; i++) {
      if (state.assets[i].category === 'gold') n += state.assets[i].qty;
    }
    return n;
  }

  function offerPrice(card, asset) {
    switch (card.priceMode) {
      case 'flat': return card.amount;
      case 'perUnit': return card.amount * (asset.units || 1);
      case 'perAcre': return card.amount * (asset.acres || 0);
      case 'cashflowMultiple': return card.amount * asset.cashflow;
      case 'costPlusPct': return Math.round(asset.cost * (100 + card.amount) / 100);
      default: throw new Error('Unknown priceMode: ' + card.priceMode);
    }
  }

  function buildOffers(state, card) {
    var offers = [];
    for (var i = 0; i < state.assets.length; i++) {
      var a = state.assets[i];
      if (a.category !== 'realestate' && a.category !== 'business') continue;
      if (!card.match.any && a.propType !== card.match.propType) continue;
      var price = offerPrice(card, a);
      offers.push({
        assetId: a.id,
        name: a.name,
        price: price,
        mortgage: a.mortgage,
        netCash: price - a.mortgage,
        cashflowLost: a.cashflow,
        cost: a.cost
      });
    }
    // A "buyer for any property" card is a single buyer: one sale only.
    if (card.match.any) {
      return offers.map(function (o) { o.singleOnly = true; return o; });
    }
    return offers;
  }

  /* ------------------------------------------------------------------ *
   * Deal presentation
   * ------------------------------------------------------------------ */

  function presentDeal(state, deckName) {
    var catalogue = deckName === 'small' ? D.SMALL_DEALS : D.BIG_DEALS;
    var card = drawCard(state, deckName, catalogue);
    log(state, deckName === 'small' ? 'Small Deal: {title}' : 'Big Deal: {title}', { title: ref(card) }, 'card');

    if (card.kind === 'split') {
      applySplit(state, card);
      afterAction(state);
      return;
    }
    state.pending = { kind: 'deal', card: card, deck: deckName };
  }

  function applySplit(state, card) {
    var holding = state.stocks[card.symbol];
    if (!holding || holding.shares === 0) {
      log(state, '{title} - you own none.', { title: ref(card) }, 'system');
      return;
    }
    var before = holding.shares;
    holding.shares = Math.floor(holding.shares * card.ratio);
    log(state, '{symbol}: {before} shares become {after}. Your total value is unchanged.', { symbol: card.symbol, before: before, after: holding.shares }, 'system');
    if (holding.shares === 0) delete state.stocks[card.symbol];
  }

  /* ------------------------------------------------------------------ *
   * Player actions. Every one of these validates before it mutates.
   * ------------------------------------------------------------------ */

  var actions = {

    chooseDeck: function (state, payload) {
      var deck = payload.deck === 'big' ? 'big' : 'small';
      state.pending = null;
      presentDeal(state, deck);
    },

    pass: function (state) {
      var p = state.pending;
      if (p && p.kind === 'deal') log(state, 'Passed on {title}.', { title: ref(p.card) }, 'system');
      state.pending = null;
      afterAction(state);
    },

    buyStock: function (state, payload) {
      var card = requirePending(state, 'deal').card;
      if (card.kind !== 'stock') throw new Error('Not a stock card.');
      var qty = intOrThrow(payload.qty, 'quantity');
      if (qty <= 0) fail('Choose at least one.');
      var cost = qty * card.price;
      if (cost > state.cash) {
        fail('That costs {$cost} and you have {$cash}. Shares are bought with cash. Buy fewer.', { cost: cost, cash: state.cash });
      }
      state.cash -= cost;
      var h = state.stocks[card.symbol] || (state.stocks[card.symbol] = { shares: 0, invested: 0 });
      h.shares += qty;
      h.invested += cost;
      log(state, 'Bought {qty} {symbol} at {$price} = {$cost}.', { qty: qty, symbol: card.symbol, price: card.price, cost: cost }, 'loss');
      state.pending = null;
      afterAction(state);
    },

    sellStock: function (state, payload) {
      var card = requirePending(state, 'deal').card;
      if (card.kind !== 'stock') throw new Error('Not a stock card.');
      var h = state.stocks[card.symbol];
      if (!h || h.shares === 0) fail('You own no {symbol}.', { symbol: card.symbol });
      var qty = intOrThrow(payload.qty, 'quantity');
      if (qty <= 0 || qty > h.shares) fail('You own {n} shares.', { n: h.shares });
      var proceeds = qty * card.price;
      var costBasis = Math.round(h.invested * (qty / h.shares));
      h.invested -= costBasis;
      h.shares -= qty;
      if (h.shares === 0) delete state.stocks[card.symbol];
      credit(state, proceeds, 'Sold ' + qty + ' ' + card.symbol + ' at ' + money(card.price) +
        ' (cost basis ' + money(costBasis) + ', ' +
        (proceeds >= costBasis ? 'gain ' : 'loss ') + money(Math.abs(proceeds - costBasis)) + ')');
      state.pending = null;
      afterAction(state);
    },

    buyGold: function (state, payload) {
      var card = requirePending(state, 'deal').card;
      if (card.kind !== 'gold') throw new Error('Not a gold card.');
      var qty = intOrThrow(payload.qty, 'quantity');
      if (qty <= 0 || qty > card.maxQty) fail('You may buy 1 to {n} coins.', { n: card.maxQty });
      var cost = qty * card.unitPrice;
      if (cost > state.cash) fail('That costs {$cost} and you have {$cash}.', { cost: cost, cash: state.cash });
      state.cash -= cost;
      state.assets.push({
        id: state.nextAssetId++, category: 'gold', name: 'Gold coins',
        qty: qty, cost: cost, unitPrice: card.unitPrice, cashflow: 0, mortgage: 0
      });
      log(state, 'Bought {qty} gold coins for {$cost}. They pay nothing until you sell them.', { qty: qty, cost: cost }, 'loss');
      state.pending = null;
      afterAction(state);
    },

    buyDeal: function (state) {
      var pending = requirePending(state, 'deal');
      var card = pending.card;
      if (card.kind === 'stock' || card.kind === 'gold' || card.kind === 'split') {
        throw new Error('Use the specific action for this card type.');
      }

      if (card.kind === 'trap') {
        // Traps are cash out for nothing (or worse, a recurring expense).
        if (card.cost > state.cash) {
          fail('You need {$need} in cash and you have {$cash}.', { need: card.cost, cash: state.cash });
        }
        debit(state, card.cost, card.title, true);
        if (card.addExpense) {
          state.extraExpenses += card.addExpense;
          log(state, 'Monthly expenses rise by {$amount} - permanently.', { amount: card.addExpense }, 'loss');
        }
        state.pending = null;
        afterAction(state);
        return;
      }

      if (card.kind === 'cd') {
        if (card.cost > state.cash) {
          fail('That needs {$need} in cash and you have {$cash}.', { need: card.cost, cash: state.cash });
        }
        state.cash -= card.cost;
        state.assets.push({
          id: state.nextAssetId++, category: 'paper', name: card.title,
          cost: card.cost, mortgage: 0, cashflow: card.cashflow, propType: 'paper', units: 1
        });
        log(state, 'Bought {title} for {$cost}. Adds {$cf}/mo.', { title: ref(card), cost: card.cost, cf: card.cashflow }, 'gain');
        state.pending = null;
        afterAction(state);
        return;
      }

      /* Real estate and businesses are paid for in cash.
        *
        * Buying used to quietly borrow the shortfall, which meant a single tap
        * on Buy could create thousands of dollars of debt at 120% a year
        * without the player ever choosing to take a loan. Taking on debt has
        * to be its own deliberate act. */
      if (card.down > state.cash) {
        fail('You need {$need} in cash and you have {$cash}. Take a loan first if you want this deal.', { need: card.down, cash: state.cash });
      }
      state.cash -= card.down;
      log(state, '-{$amount}  Down payment on {title}', { amount: card.down, title: ref(card) }, 'loss');
      var category = card.kind === 'business' ? 'business' : 'realestate';
      state.assets.push({
        id: state.nextAssetId++,
        category: category,
        propType: card.propType,
        name: card.title,
        cost: card.cost,
        down: card.down,
        mortgage: card.mortgage,
        cashflow: card.cashflow,
        units: card.units || 1,
        acres: card.acres || 0
      });
      log(state, 'Bought {title} ({$cost}, {$financed} financed). Adds {$cf}/mo passive income.', { title: ref(card), cost: card.cost, financed: card.mortgage, cf: card.cashflow }, card.cashflow >= 0 ? 'gain' : 'loss');
      state.pending = null;
      afterAction(state);
    },

    charityDonate: function (state) {
      var p = requirePending(state, 'charity');
      debit(state, p.amount, t('Charitable donation'), true);
      state.charityTurns = 3;
      log(state, 'For the next 3 turns you may roll one die or two.', null, 'gain');
      state.pending = null;
      afterAction(state);
    },

    /* A bill you cannot refuse -- but you still hand the money over yourself.
     * The engine never quietly takes it. */
    payBill: function (state) {
      var p = requirePending(state, 'bill');
      debit(state, p.amount, p.reason || p.title);
      state.pending = null;
      if (p.then === 'downsize') {
        state.skipTurns = 2;
        log(state, 'You lose your next 2 turns.', null, 'system');
      }
      afterAction(state);
    },

    doodadAccept: function (state) {
      var p = requirePending(state, 'doodadOptional');
      debit(state, p.amount, p.title, true);
      if (p.addExpense) {
        state.extraExpenses += p.addExpense;
        log(state, 'Monthly expenses rise by {$amount} - permanently.', { amount: p.addExpense }, 'loss');
      }
      state.pending = null;
      afterAction(state);
    },

    sellAsset: function (state, payload) {
      var p = requirePending(state, 'sellAsset');
      var offer = null;
      for (var i = 0; i < p.offers.length; i++) {
        if (p.offers[i].assetId === payload.assetId) offer = p.offers[i];
      }
      if (!offer) throw new Error('No such offer.');

      var idx = -1;
      for (var j = 0; j < state.assets.length; j++) {
        if (state.assets[j].id === offer.assetId) idx = j;
      }
      if (idx === -1) fail('You no longer own that.');

      var asset = state.assets[idx];
      var net = offer.price - asset.mortgage;
      // Check affordability before touching anything, so a sale that cannot be
      // closed leaves the portfolio exactly as it was.
      if (net < 0 && state.cash + availableCredit(state) < -net) {
        fail('Closing that sale would cost you {$amount} to clear the mortgage, and you cannot raise it.', { amount: -net });
      }
      if (net >= 0) {
        credit(state, net, 'Sold ' + asset.name + ' for ' + money(offer.price) +
          ' less ' + money(asset.mortgage) + ' mortgage');
      } else {
        debit(state, -net, 'Sold ' + asset.name + ' at a loss - the sale price did not clear the mortgage', true);
      }
      var gain = offer.price - asset.cost;
      log(state, gain >= 0 ? 'Capital gain {$gain} against a purchase price of {$cost}. Passive income falls by {$lost}/mo.' : 'Capital loss {$gain} against a purchase price of {$cost}. Passive income falls by {$lost}/mo.', { gain: Math.abs(gain), cost: asset.cost, lost: asset.cashflow }, gain >= 0 ? 'gain' : 'loss');
      state.assets.splice(idx, 1);

      // A single named buyer buys one property; a general market buys as many
      // as you care to sell, so keep the remaining offers open.
      if (offer.singleOnly) {
        state.pending = null;
      } else {
        var remaining = p.offers.filter(function (o) { return o.assetId !== offer.assetId; });
        if (remaining.length === 0) state.pending = null;
        else state.pending = { kind: 'sellAsset', id: p.id, title: p.title, text: p.text, offers: remaining };
      }
      afterAction(state);
    },

    sellGold: function (state, payload) {
      var p = requirePending(state, 'sellGold');
      var qty = intOrThrow(payload.qty, 'quantity');
      if (qty <= 0 || qty > p.maxQty) fail('You own {n} coins.', { n: p.maxQty });

      var remaining = qty;
      var basis = 0;
      for (var i = state.assets.length - 1; i >= 0 && remaining > 0; i--) {
        var a = state.assets[i];
        if (a.category !== 'gold') continue;
        var take = Math.min(a.qty, remaining);
        basis += take * a.unitPrice;
        a.qty -= take;
        remaining -= take;
        if (a.qty === 0) state.assets.splice(i, 1);
        else a.cost = a.qty * a.unitPrice;
      }
      var proceeds = qty * p.unitPrice;
      credit(state, proceeds, 'Sold ' + qty + ' gold coins at ' + money(p.unitPrice) +
        ' (paid ' + money(basis) + ', ' + (proceeds >= basis ? 'gain ' : 'loss ') +
        money(Math.abs(proceeds - basis)) + ')');
      state.pending = null;
      afterAction(state);
    },

    /* --- Bank, available any time it is your move --- */

    borrow: function (state, payload) {
      var amount = intOrThrow(payload.amount, 'amount');
      if (amount <= 0 || amount % LOAN_UNIT !== 0) {
        fail('Loans come in {$unit} blocks.', { unit: LOAN_UNIT });
      }
      var available = availableCredit(state);
      if (amount > available) {
        fail('You can borrow at most another {$available}. Your borrowing limit is {months} months of total income ({$limit}) and you already owe {$owed}.', { available: available, months: CREDIT_MULTIPLE, limit: creditLimit(state), owed: state.bankLoan });
      }
      state.bankLoan += amount;
      state.cash += amount;
      log(state, 'Took a loan of {$amount}. Expenses rise by {$monthly}/mo until the principal is repaid.', { amount: amount, monthly: amount / LOAN_UNIT * LOAN_RATE_PER_UNIT }, 'loan');
      afterAction(state);
    },

    repay: function (state, payload) {
      var amount = intOrThrow(payload.amount, 'amount');
      if (amount <= 0 || amount % LOAN_UNIT !== 0) {
        fail('Repay in {$unit} blocks.', { unit: LOAN_UNIT });
      }
      if (amount > state.bankLoan) fail('You only owe {$owed}.', { owed: state.bankLoan });
      if (amount > state.cash) fail('You only have {$cash} in cash.', { cash: state.cash });
      state.cash -= amount;
      state.bankLoan -= amount;
      log(state, 'Repaid {$amount} of loans. Expenses fall by {$monthly}/mo.', { amount: amount, monthly: amount / LOAN_UNIT * LOAN_RATE_PER_UNIT }, 'gain');
      afterAction(state);
    },

    /* Clear a consumer debt outright.
     *
     * Paying off the car loan removes the car payment, which is the whole
     * point: every debt you retire lowers the bar you have to clear to leave
     * the Rat Race. These are all-or-nothing -- you cannot part-pay a car
     * loan and get a smaller payment -- whereas `repay` handles loans, which
     * come in $1,000 blocks. */
    repayLiability: function (state, payload) {
      var which = payload.which;
      var slot = state.profession[which];
      if (!slot || typeof slot.liability !== 'number') {
        fail('There is no such debt.');
      }
      if (slot.liability <= 0) fail('That is already paid off.');
      if (slot.liability > state.cash) {
        fail('Clearing that costs {$cost} and you have {$cash}.', { cost: slot.liability, cash: state.cash });
      }
      var freed = slot.payment;
      state.cash -= slot.liability;
      log(state, '-{$amount}  Paid off {debt} in full. Expenses fall by {$freed}/mo.', { amount: slot.liability, debt: t(LIABILITY_NAMES[which]), freed: freed }, 'gain');
      slot.liability = 0;
      slot.payment = 0;
      afterAction(state);
    },

    /* --- Fast Track --- */

    buyInvestment: function (state) {
      var p = requirePending(state, 'ftInvestment');
      var inv = findById(D.FT_INVESTMENTS, p.investmentId);
      if (state.cash < inv.cost) {
        fail('That costs {$cost} and you have {$cash}. On the Fast Track you buy with cash.', { cost: inv.cost, cash: state.cash });
      }
      state.cash -= inv.cost;
      state.ftInvestments.push({ id: inv.id, name: inv.name, cost: inv.cost, cashflow: inv.cashflow });
      log(state, 'Bought {title} for {$cost}. Adds {$cf}/mo.', { title: ref(inv, 'name'), cost: inv.cost, cf: inv.cashflow }, 'gain');
      state.pending = null;
      afterAction(state);
    },

    buyDream: function (state) {
      var p = requirePending(state, 'ftDream');
      var dream = findById(D.DREAMS, p.dreamId);
      if (state.cash < dream.cost) {
        fail('Your dream costs {$cost} and you have {$cash}.', { cost: dream.cost, cash: state.cash });
      }
      state.cash -= dream.cost;
      log(state, 'You bought your dream: {name}.', { name: ref(dream, 'name') }, 'gain');
      state.pending = null;
      win(state, 'dream');
    },

    ftCharityDonate: function (state) {
      var p = requirePending(state, 'ftCharity');
      if (state.cash < p.amount) fail('You do not have {$amount} in cash for that donation.', { amount: p.amount });
      debit(state, p.amount, t('Charitable donation'), true);
      state.pending = null;
      afterAction(state);
    },

    acknowledge: function (state) {
      /* Refusing a luxury is the single behaviour the optional-doodad split
       * exists to teach, and it used to leave no trace anywhere. Record it, so
       * the player can see what their discipline was worth. */
      var p = state.pending;
      /* A bill is the one pending state that cannot be dismissed. Without this
       * guard the generic "continue" action would clear it and the player
       * would simply never pay, which is both a rules hole and a silent
       * difficulty cliff. */
      if (p && p.kind === 'bill') {
        fail('This one has to be paid.');
      }
      if (p && p.kind === 'doodadOptional') {
        state.refused = (state.refused || 0) + p.amount;
        if (state.refused === p.amount) {
          log(state, 'Declined {title} ({$amount}).',
            { title: p.title, amount: p.amount }, 'system');
        } else {
          log(state, 'Declined {title} ({$amount}). Total declined this game: {$total}.',
            { title: p.title, amount: p.amount, total: state.refused }, 'system');
        }
      }
      state.pending = null;
      afterAction(state);
    }
  };

  function requirePending(state, kind) {
    if (!state.pending || state.pending.kind !== kind) {
      fail('That action is not available right now.');
    }
    return state.pending;
  }

  function intOrThrow(v, label) {
    var n = typeof v === 'number' ? v : parseInt(v, 10);
    if (!isFinite(n) || Math.floor(n) !== n) throw new Error('Invalid ' + label + '.');
    return n;
  }

  /* Single entry point for the UI. Returns {ok, error}. Never throws at the
   * caller -- an illegal click is a message, not a broken board. */
  function act(state, type, payload) {
    var fn = actions[type];
    if (!fn) return { ok: false, error: 'Unknown action: ' + type };
    try {
      fn(state, payload || {});
      return { ok: true };
    } catch (e) {
      // Bankruptcy is an outcome, not a rejected click: the state it left
      // behind is the correct one and the UI should render it.
      if (e.bankrupt) return { ok: true, bankrupt: true };
      return { ok: false, error: e.message, k: e.k || null, p: e.p || null };
    }
  }

  /* ------------------------------------------------------------------ *
   * After every action: check for escape, then check the books.
   * ------------------------------------------------------------------ */

  function afterAction(state) {
    if (state.phase === 'ratrace') {
      var s = stats(state);
      if (s.escaped) enterFastTrack(state, s);
    } else if (state.phase === 'fasttrack') {
      afterFastTrack(state);
    }
  }

  function enterFastTrack(state, s) {
    state.phase = 'fasttrack';
    state.ftPosition = 0;
    state.ftBaseIncome = s.passiveIncome * FAST_TRACK_MULTIPLIER;
    // Keep whatever you saved in the Rat Race and add the same amount again as
    // starting capital. Deleting a player's hard-won cash reads as a bug even
    // when it is a rule.
    state.cash += s.passiveIncome * FAST_TRACK_MULTIPLIER;
    state.pending = null;
    state.skipTurns = 0;
    state.charityTurns = 0;
    log(state, 'OUT OF THE RAT RACE in {months} months. Passive income {$passive} beats expenses of {$expenses}.', { months: state.months, passive: s.passiveIncome, expenses: s.totalExpenses }, 'win');
    /* Typed 'rules' rather than 'system': this is an explanation of how the
     * game now works, not something that happened this turn. The interface
     * keeps it out of the turn receipt and puts it in a dialog of its own. */
    log(state, 'Fast Track: your Cash Flow Day income is {$income} and you start with the same amount in cash.', { income: state.ftBaseIncome }, 'rules');
    log(state, 'Win by buying your dream ({name}, {$cost}) or by doubling your Cash Flow Day income - adding another {$goal}/mo of investment income.', { name: ref(state.dream, 'name'), cost: state.dream.cost, goal: fastTrackGoal(state) }, 'rules');
  }

  function moveFastTrack(state, steps) {
    var board = D.FAST_TRACK_BOARD;
    for (var i = 0; i < steps; i++) {
      state.ftPosition = (state.ftPosition + 1) % board.length;
      if (board[state.ftPosition].type === 'CASHFLOW_DAY') {
        credit(state, ftStats(state).totalIncome, 'CASH FLOW DAY');
      }
    }
    resolveFastTrackSquare(state, board[state.ftPosition]);
  }

  function resolveFastTrackSquare(state, sq) {
    switch (sq.type) {
      case 'CASHFLOW_DAY':
        break; // paid during movement
      case 'INVESTMENT':
        var inv = findById(D.FT_INVESTMENTS, sq.investment);
        state.pending = {
          kind: 'ftInvestment', investmentId: inv.id, title: inv.name,
          cost: inv.cost, cashflow: inv.cashflow,
          text: t('{$cost} in cash buys {$cf} a month.', { cost: inv.cost, cf: inv.cashflow })
        };
        break;
      case 'DREAM':
        var dream = findById(D.DREAMS, sq.dream);
        if (dream.id === state.dream.id) {
          state.pending = {
            kind: 'ftDream', dreamId: dream.id, title: 'Your dream: ' + dream.name,
            cost: dream.cost,
            text: t('This is the dream you chose. Buy it for {$cost} and you win.', { cost: dream.cost })
          };
        } else {
          log(state, "Someone else's dream: {name}. Not yours - keep moving.", { name: ref(dream, 'name') }, 'system');
        }
        break;
      case 'SETBACK':
        applySetback(state, sq);
        break;
      default:
        throw new Error('Unknown fast track square: ' + sq.type);
    }
    if (state.pending === null) afterFastTrack(state);
  }

  function applySetback(state, sq) {
    if (sq.setback === 'divorce') {
      var all = state.cash;
      state.cash = 0;
      log(state, '{label}: {text} Lost {$amount}.', { label: t(sq.label), text: t(sq.text), amount: all }, 'loss');
    } else if (sq.setback === 'charity') {
      var amount = Math.round(ftStats(state).totalIncome * 0.1);
      state.pending = { kind: 'ftCharity', title: 'Charity', amount: amount, text: sq.text };
    } else {
      var half = Math.floor(state.cash / 2);
      state.cash -= half;
      log(state, '{label}: {text} Lost {$amount}.', { label: t(sq.label), text: t(sq.text), amount: half }, 'loss');
    }
  }

  function afterFastTrack(state) {
    if (state.phase !== 'fasttrack') return;
    if (ftStats(state).addedIncome >= fastTrackGoal(state)) win(state, 'cashflow');
  }

  function win(state, how) {
    state.phase = 'won';
    state.pending = null;
    state.result = { how: how, months: state.months };
    if (how === 'dream') {
      log(state, 'YOU WIN. You bought your dream in {months} months.', { months: state.months }, 'win');
    } else {
      log(state, 'YOU WIN. You added {$income} a month of investment income in {months} months.', { income: ftStats(state).addedIncome, months: state.months }, 'win');
    }
  }

  /* ------------------------------------------------------------------ *
   * Invariants. Cheap, and they turn a silent accounting drift into a
   * visible, reportable failure.
   * ------------------------------------------------------------------ */

  function checkInvariants(state) {
    var problems = [];
    function must(cond, msg) { if (!cond) problems.push(msg); }
    function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }

    must(isInt(state.cash), 'Cash is not a whole number: ' + state.cash);
    must(state.cash >= 0, 'Cash went negative: ' + state.cash);
    must(isInt(state.bankLoan) && state.bankLoan >= 0, 'Bank loan invalid: ' + state.bankLoan);
    must(state.bankLoan % LOAN_UNIT === 0, 'Bank loan is not a multiple of ' + LOAN_UNIT);
    must(state.children >= 0 && state.children <= MAX_CHILDREN, 'Child count out of range: ' + state.children);
    must(state.months >= 0, 'Month count negative.');
    must(state.position >= 0 && state.position < D.RAT_RACE_BOARD.length, 'Board position off the board.');
    must(state.ftPosition >= 0 && state.ftPosition < D.FAST_TRACK_BOARD.length, 'Fast Track position off the board.');
    must(state.skipTurns >= 0 && state.charityTurns >= 0, 'Negative turn counter.');
    must(['ratrace', 'fasttrack', 'won', 'bankrupt'].indexOf(state.phase) !== -1,
      'Unknown phase: ' + state.phase);
    // Values this large mean something is compounding out of control; catching
    // it here beats letting the numbers drift past exact integer precision.
    must(state.cash < SANE_MAX && state.bankLoan < SANE_MAX,
      'Numbers have run away (cash ' + state.cash + ', debt ' + state.bankLoan + ').');

    for (var i = 0; i < state.assets.length; i++) {
      var a = state.assets[i];
      must(isInt(a.cashflow), 'Asset "' + a.name + '" has a non-integer cash flow.');
      must(isInt(a.mortgage) && a.mortgage >= 0, 'Asset "' + a.name + '" has an invalid mortgage.');
      if (a.category === 'gold') must(a.qty > 0, 'A gold lot with no coins survived a sale.');
    }
    for (var sym in state.stocks) {
      must(state.stocks[sym].shares > 0, 'Empty holding of ' + sym + ' was not cleaned up.');
      must(isInt(state.stocks[sym].shares), 'Fractional shares of ' + sym + '.');
    }

    var s = stats(state);
    var sum = 0;
    for (var k in s.expenseParts) sum += s.expenseParts[k];
    must(sum === s.totalExpenses, 'Expense parts do not add up to the total.');
    must(s.totalIncome - s.totalExpenses === s.cashflow, 'Cash flow does not equal income minus expenses.');
    must(isInt(s.totalExpenses) && isInt(s.totalIncome), 'Financial statement contains a fractional dollar.');

    // Decks must conserve cards: every id accounted for exactly once.
    var catalogues = { small: D.SMALL_DEALS, big: D.BIG_DEALS, doodad: D.DOODADS, market: D.MARKET };
    for (var name in catalogues) {
      var deck = state.decks[name];
      var total = deck.draw.length + deck.discard.length;
      must(total === catalogues[name].length,
        'Deck "' + name + '" has ' + total + ' cards, expected ' + catalogues[name].length + '.');
    }

    return problems;
  }

  /* ------------------------------------------------------------------ *
   * Save / load
   * ------------------------------------------------------------------ */

  function serialize(state) { return JSON.stringify(state); }

  function deserialize(text) {
    var state = JSON.parse(text);
    if (!state || state.version !== 1) fail('Unrecognised or outdated save file.');
    var problems = checkInvariants(state);
    if (problems.length) fail('Save file is inconsistent: {problem}', { problem: problems[0] });
    return state;
  }

  global.CF.engine = {
    createGame: createGame,
    roll: roll,
    act: act,
    stats: stats,
    ftStats: ftStats,
    creditLimit: creditLimit,
    availableCredit: availableCredit,
    sellableValue: sellableValue,
    isOver: isOver,
    fastTrackGoal: fastTrackGoal,
    canRoll: canRoll,
    diceOptions: diceOptions,
    checkInvariants: checkInvariants,
    serialize: serialize,
    deserialize: deserialize,
    clone: clone,
    money: money,
    findById: findById,
    totalGold: totalGold,
    LIABILITY_NAMES: LIABILITY_NAMES,
    constants: {
      MAX_CHILDREN: MAX_CHILDREN,
      LOAN_UNIT: LOAN_UNIT,
      LOAN_RATE_PER_UNIT: LOAN_RATE_PER_UNIT,
      FAST_TRACK_MULTIPLIER: FAST_TRACK_MULTIPLIER,
      FAST_TRACK_CASHFLOW_GOAL: FAST_TRACK_CASHFLOW_GOAL
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
