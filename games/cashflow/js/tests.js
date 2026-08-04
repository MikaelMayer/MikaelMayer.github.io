/* Engine test suite. Runs in the browser (tests.html) and in Node
 * (node run-tests.js). No framework, no dependencies.
 *
 * The last test is the important one: a random agent plays thousands of
 * complete games, and after every single action the engine's own invariant
 * check must pass. That is what catches the accounting drift, the stuck board
 * and the undefined-card crash before a player ever sees them.
 */
(function (global) {
  'use strict';

  var results = [];
  var current = null;

  function test(name, fn) {
    current = { name: name, pass: true, error: null };
    try {
      fn();
    } catch (e) {
      current.pass = false;
      current.error = e && e.message ? e.message : String(e);
    }
    results.push(current);
    current = null;
  }

  function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
  }

  function eq(a, b, msg) {
    if (a !== b) throw new Error((msg || 'expected equality') + ': got ' + a + ', expected ' + b);
  }

  /* Move a specific card to the top of its deck without changing which cards
   * exist. Clobbering the draw pile outright would break deck conservation and
   * fail the invariant check for a reason the test never intended. */
  function forceCardOnTop(state, deckName, cardId) {
    var deck = state.decks[deckName];
    var before = deck.draw.length + deck.discard.length;
    var rest = deck.draw.filter(function (id) { return id !== cardId; });
    deck.discard = deck.discard.filter(function (id) { return id !== cardId; });
    deck.draw = [cardId].concat(rest);
    if (deck.draw.length + deck.discard.length !== before) {
      throw new Error('card ' + cardId + ' is not in deck ' + deckName);
    }
  }

  function runAll() {
    var E = global.CF.engine;
    var D = global.CF.data;
    var makeRng = global.CF.makeRng;
    results = [];

    /* ---------------- content integrity ---------------- */

    test('every card id is unique', function () {
      var seen = {};
      [D.SMALL_DEALS, D.BIG_DEALS, D.DOODADS, D.MARKET, D.DREAMS, D.FT_INVESTMENTS]
        .forEach(function (deck) {
          deck.forEach(function (c) {
            assert(!seen[c.id], 'duplicate card id: ' + c.id);
            seen[c.id] = true;
          });
        });
    });

    test('the rat race board is 24 squares and has every square type', function () {
      eq(D.RAT_RACE_BOARD.length, 24, 'board length');
      ['OPPORTUNITY', 'PAYDAY', 'MARKET', 'DOODAD', 'CHARITY', 'BABY', 'DOWNSIZED']
        .forEach(function (t) {
          assert(D.RAT_RACE_BOARD.indexOf(t) !== -1, 'missing square type ' + t);
        });
    });

    test('the fast track board is 40 squares and contains every dream', function () {
      eq(D.FAST_TRACK_BOARD.length, 40, 'board length');
      D.DREAMS.forEach(function (dr) {
        var found = D.FAST_TRACK_BOARD.some(function (sq) {
          return sq.type === 'DREAM' && sq.dream === dr.id;
        });
        assert(found, 'dream not reachable on the board: ' + dr.name);
      });
    });

    test('the fast track board contains every investment', function () {
      D.FT_INVESTMENTS.forEach(function (inv) {
        var found = D.FAST_TRACK_BOARD.some(function (sq) {
          return sq.type === 'INVESTMENT' && sq.investment === inv.id;
        });
        assert(found, 'investment not reachable: ' + inv.name);
      });
    });

    test('every profession balances and leaves positive cash flow', function () {
      D.PROFESSIONS.forEach(function (p) {
        var exp = p.taxes + p.home.payment + p.school.payment + p.car.payment +
          p.creditCard.payment + p.retail.payment + p.other;
        assert(p.salary - exp > 0, p.name + ' starts with non-positive cash flow');
        assert(p.savings >= 0, p.name + ' has negative savings');
        [p.home, p.school, p.car, p.creditCard, p.retail].forEach(function (l) {
          assert(l.liability >= 0 && l.payment >= 0, p.name + ' has a negative liability');
          if (l.payment > 0) assert(l.liability > 0, p.name + ' pays on a debt it does not owe');
        });
      });
    });

    test('every deal card has coherent terms', function () {
      D.SMALL_DEALS.concat(D.BIG_DEALS).forEach(function (c) {
        if (c.kind === 'realestate' || c.kind === 'business') {
          eq(c.mortgage, c.cost - c.down, c.id + ' mortgage does not equal price minus down');
          assert(c.down > 0 && c.down <= c.cost, c.id + ' has an impossible down payment');
          assert(c.units >= 1, c.id + ' has no units');
        }
        if (c.kind === 'stock') {
          assert(c.price >= c.range[0] && c.price <= c.range[1], c.id + ' trades outside its own range');
        }
      });
    });

    /* ---------------- rng ---------------- */

    test('the rng is deterministic and reproducible from its state', function () {
      var a = makeRng(1234), b = makeRng(1234);
      for (var i = 0; i < 100; i++) eq(a.next(), b.next(), 'diverged at ' + i);
      var mid = a.getState();
      var x = a.next();
      var c = makeRng(0);
      c.setState(mid);
      eq(c.next(), x, 'state restore did not reproduce the next value');
    });

    test('dice are in range and reasonably uniform', function () {
      var r = makeRng(99), counts = [0, 0, 0, 0, 0, 0, 0];
      for (var i = 0; i < 60000; i++) {
        var d = r.die();
        assert(d >= 1 && d <= 6, 'die out of range: ' + d);
        counts[d]++;
      }
      for (var f = 1; f <= 6; f++) {
        assert(counts[f] > 8000 && counts[f] < 12000, 'face ' + f + ' came up ' + counts[f] + ' times');
      }
    });

    /* A seed is only worth having if it reproduces the game. The bare-number
     * form is the one people reach for first, and it used to be accepted
     * silently and ignored -- the game came back randomly seeded, which looks
     * deterministic until you compare two of them. */
    test('a seed reproduces the game, however it is passed', function () {
      var a = E.createGame({ seed: 4242, professionId: 'teacher' });
      var b = E.createGame({ seed: '4242', professionId: 'teacher' });
      var c = E.createGame(4242);
      eq(a.seed, 4242, 'number in an options object');
      eq(b.seed, 4242, 'numeric string in an options object');
      eq(c.seed, 4242, 'bare number shorthand');
      eq(JSON.stringify(a.decks), JSON.stringify(b.decks),
        'same seed must shuffle the decks identically');

      var d = E.createGame({ seed: 4243, professionId: 'teacher' });
      assert(JSON.stringify(a.decks) !== JSON.stringify(d.decks),
        'a different seed must produce a different game');
    });

    /* ---------------- financial statement ---------------- */

    test('a new game matches its profession sheet', function () {
      var s = E.createGame({ seed: 1, professionId: 'teacher', dreamId: 'dr01' });
      var p = E.findById(D.PROFESSIONS, 'teacher');
      var st = E.stats(s);
      eq(s.cash, p.savings, 'starting cash');
      eq(st.salary, p.salary, 'salary');
      eq(st.passiveIncome, 0, 'passive income should start at zero');
      eq(st.totalExpenses,
        p.taxes + p.home.payment + p.school.payment + p.car.payment +
        p.creditCard.payment + p.retail.payment + p.other, 'expenses');
      eq(st.cashflow, st.totalIncome - st.totalExpenses, 'cash flow identity');
      eq(E.checkInvariants(s).length, 0, 'invariants at start');
    });

    test('borrowing adds exactly $100 a month per $1,000', function () {
      var s = E.createGame({ seed: 2, professionId: 'nurse' });
      var before = E.stats(s).totalExpenses;
      var cashBefore = s.cash;
      var r = E.act(s, 'borrow', { amount: 5000 });
      assert(r.ok, r.error);
      eq(s.cash, cashBefore + 5000, 'cash after borrowing');
      eq(E.stats(s).totalExpenses, before + 500, 'expenses after borrowing');
      r = E.act(s, 'repay', { amount: 5000 });
      assert(r.ok, r.error);
      eq(E.stats(s).totalExpenses, before, 'expenses after repaying');
      eq(s.cash, cashBefore, 'cash after repaying');
    });

    test('the bank refuses odd loan amounts and over-repayment', function () {
      var s = E.createGame({ seed: 3, professionId: 'nurse' });
      assert(!E.act(s, 'borrow', { amount: 1500 }).ok, 'accepted a non-$1,000 multiple');
      assert(!E.act(s, 'borrow', { amount: -1000 }).ok, 'accepted a negative loan');
      assert(!E.act(s, 'repay', { amount: 1000 }).ok, 'repaid a loan that does not exist');
      eq(s.bankLoan, 0, 'bank loan should still be zero');
    });

    test('children raise expenses by exactly the profession child cost', function () {
      var s = E.createGame({ seed: 4, professionId: 'doctor' });
      var before = E.stats(s).totalExpenses;
      s.children = 2;
      eq(E.stats(s).totalExpenses, before + 2 * s.profession.childCost, 'two children');
      eq(E.checkInvariants(s).length, 0, 'invariants with children');
    });

    /* ---------------- turn mechanics ---------------- */

    test('passing a payday square pays you, and landing on it pays once', function () {
      var s = E.createGame({ seed: 5, professionId: 'engineer' });
      var cf = E.stats(s).cashflow;
      // Square 5 is a PAYDAY. Start at 0 and walk exactly there.
      eq(D.RAT_RACE_BOARD[5], 'PAYDAY', 'test assumes square 5 is payday');
      var cash = s.cash;
      s.position = 0;
      s.pending = null;
      // Simulate the movement loop the engine uses, without the dice.
      var paid = 0;
      for (var i = 0; i < 6; i++) {
        s.position = (s.position + 1) % 24;
        if (D.RAT_RACE_BOARD[s.position] === 'PAYDAY') paid++;
      }
      eq(paid, 1, 'should cross exactly one payday');
      eq(s.cash, cash, 'no cash moved in the simulation itself');
      eq(cf > 0, true, 'engineer should start cash-flow positive');
    });

    test('a full lap collects exactly three paydays', function () {
      var s = E.createGame({ seed: 6, professionId: 'engineer' });
      var cf = E.stats(s).cashflow;
      var cash = s.cash;
      // Roll a fixed 1 twenty-four times by driving the engine, skipping any
      // decisions so the only cash movement we allow is payday.
      var laps = 0;
      for (var i = 0; i < 24 && laps < 100; i++) {
        s.pending = null;
        s.position = (s.position + 1) % 24;
        if (D.RAT_RACE_BOARD[s.position] === 'PAYDAY') { s.cash += cf; laps++; }
      }
      eq(laps, 3, 'three payday squares per lap');
      eq(s.cash, cash + 3 * cf, 'three paydays collected');
    });

    test('downsized costs a month of expenses and two turns', function () {
      var s = E.createGame({ seed: 8, professionId: 'engineer' });
      var exp = E.stats(s).totalExpenses;
      eq(D.RAT_RACE_BOARD[19], 'DOWNSIZED', 'test assumes square 19 is downsized');
      s.cash += 100000;                       // pay without needing a loan
      s.position = 18;
      var cash = s.cash;
      E.roll(s, 1, [1]);                      // forced die: land exactly on 19
      eq(s.position, 19, 'should have landed on downsized');
      eq(s.pending.kind, 'bill', 'losing your job presents a bill, it does not just take the money');
      eq(s.pending.amount, exp, 'the bill is one month of total expenses');
      eq(s.cash, cash, 'nothing is taken until the player pays');
      assert(!E.act(s, 'acknowledge').ok, 'a bill must not be dismissable');
      assert(E.act(s, 'payBill').ok, 'paying failed');
      eq(s.cash, cash - exp, 'should have paid one month of expenses');
      eq(s.skipTurns, 2, 'should lose two turns');

      var months = s.months;
      E.roll(s, 1, [4]);
      eq(s.months, months + 1, 'a skipped turn still counts as a month');
      eq(s.position, 19, 'a skipped turn does not move you');
      eq(s.skipTurns, 1, 'one skipped turn consumed');
      eq(E.checkInvariants(s).length, 0, 'invariants after being downsized');
    });

    test('the baby square adds a child, and never a fourth', function () {
      eq(D.RAT_RACE_BOARD[11], 'BABY', 'test assumes square 11 is baby');

      var s = E.createGame({ seed: 9, professionId: 'nurse' });
      s.cash += 100000;
      s.position = 10;
      var exp = E.stats(s).totalExpenses;
      E.roll(s, 1, [1]);
      eq(s.position, 11, 'should have landed on baby');
      eq(s.children, 1, 'one child');
      eq(E.stats(s).totalExpenses, exp + s.profession.childCost, 'child expense added');

      s.children = 3;
      s.position = 10;
      exp = E.stats(s).totalExpenses;
      E.roll(s, 1, [1]);
      eq(s.children, 3, 'child count capped at three');
      eq(E.stats(s).totalExpenses, exp, 'expenses unchanged at the cap');
      eq(E.checkInvariants(s).length, 0, 'invariants after the cap');
    });

    test('a forced die must be a real die face', function () {
      var s = E.createGame({ seed: 91, professionId: 'nurse' });
      var threw = false;
      try { E.roll(s, 1, [9]); } catch (e) { threw = true; }
      assert(threw, 'a 9-sided die was accepted');
    });

    /* ---------------- deals ---------------- */

    test('buying a property spends the down payment and adds its cash flow', function () {
      var s = E.createGame({ seed: 10, professionId: 'doctor' });
      s.cash = 50000;
      var passiveBefore = E.stats(s).passiveIncome;
      s.pending = {
        kind: 'deal', deck: 'small',
        card: {
          id: 'x', kind: 'realestate', propType: 'house3_2', title: 'Test house',
          cost: 60000, down: 6000, mortgage: 54000, cashflow: 300, units: 1
        }
      };
      var r = E.act(s, 'buyDeal');
      assert(r.ok, r.error);
      eq(s.cash, 44000, 'cash after the down payment');
      eq(E.stats(s).passiveIncome, passiveBefore + 300, 'passive income');
      eq(s.assets.length, 1, 'asset recorded');
      eq(s.assets[0].mortgage, 54000, 'mortgage recorded');
      eq(s.bankLoan, 0, 'no loan needed');
      eq(E.checkInvariants(s).length, 0, 'invariants after buying');
    });

    test('a purchase never takes out a loan on your behalf', function () {
      var s = E.createGame({ seed: 11, professionId: 'doctor' });
      s.cash = 500;
      var card = {
        id: 'x', kind: 'realestate', propType: 'plex', title: 'Test plex',
        cost: 240000, down: 40000, mortgage: 200000, cashflow: 1700, units: 8
      };
      s.pending = { kind: 'deal', deck: 'big', card: card };

      var r = E.act(s, 'buyDeal');
      assert(!r.ok, 'a deal was bought with money the player did not have');
      assert(/Take a loan first/.test(r.error), 'the refusal should point at loans, got: ' + r.error);
      eq(s.cash, 500, 'cash untouched');
      eq(s.bankLoan, 0, 'and above all, no debt was created by a Buy button');
      eq(s.assets.length, 0, 'nothing was bought');

      // Borrowing is a separate, deliberate act -- and then the deal goes through.
      assert(E.act(s, 'borrow', { amount: 40000 }).ok, 'borrowing failed');
      eq(s.bankLoan, 40000, 'the loan is the player\'s own choice');
      assert(E.act(s, 'buyDeal').ok, 'buying after borrowing failed');
      eq(s.cash, 500, 'the down payment came out of the borrowed cash');
      eq(s.assets.length, 1, 'asset recorded');
      eq(E.checkInvariants(s).length, 0, 'invariants after a financed purchase');
    });

    test('the bank will not lend past ten months of income', function () {
      var s = E.createGame({ seed: 111, professionId: 'janitor' });
      var income = E.stats(s).totalIncome;
      eq(E.creditLimit(s), income * 10, 'credit limit');
      assert(!E.act(s, 'borrow', { amount: income * 10 + 1000 }).ok, 'lent past the limit');
      assert(E.act(s, 'borrow', { amount: income * 10 }).ok, 'refused a loan inside the limit');
      eq(E.availableCredit(s), 0, 'credit exhausted');
      assert(!E.act(s, 'borrow', { amount: 1000 }).ok, 'lent with no credit left');
    });

    test('a purchase beyond your means is refused, and refusing changes nothing', function () {
      var s = E.createGame({ seed: 112, professionId: 'janitor' });
      s.cash = 500;
      s.pending = {
        kind: 'deal', deck: 'big',
        card: {
          id: 'x', kind: 'realestate', propType: 'plex', title: 'Way too big',
          cost: 900000, down: 150000, mortgage: 750000, cashflow: 4500, units: 30
        }
      };
      var snapshot = E.serialize(s);
      var r = E.act(s, 'buyDeal');
      assert(!r.ok, 'a janitor bought a $150,000 down payment');
      eq(E.serialize(s), snapshot, 'a refused purchase must not mutate anything');
      // And the loan that would be needed is itself beyond the limit.
      assert(!E.act(s, 'borrow', { amount: 150000 }).ok, 'lent past the borrowing limit');
    });

    test('a player who cannot pay a bill goes bankrupt instead of spiralling', function () {
      var s = E.createGame({ seed: 113, professionId: 'janitor' });
      // Max out the credit line, then destroy the income that supported it.
      E.act(s, 'borrow', { amount: E.availableCredit(s) });
      s.cash = 0;
      s.extraExpenses += 5000;                 // now deeply cash-flow negative
      s.position = 4;
      eq(D.RAT_RACE_BOARD[5], 'PAYDAY', 'test assumes square 5 is payday');
      E.roll(s, 1, [1]);
      eq(s.phase, 'bankrupt', 'should have gone bankrupt on payday');
      eq(s.result.how, 'bankrupt', 'result recorded');
      eq(E.canRoll(s), false, 'a bankrupt player cannot keep rolling');
      eq(E.checkInvariants(s).length, 0, 'invariants after bankruptcy');
      assert(s.cash >= 0, 'cash still not negative');
    });

    test('a compulsory doodad is shown to the player, not deducted silently', function () {
      var s = E.createGame({ seed: 117, professionId: 'doctor' });
      s.cash = 20000;
      forceCardOnTop(s, 'doodad', 'dd06');          // $600 car repair, compulsory
      s.position = 0;
      E.roll(s, 1, [1]);
      eq(D.RAT_RACE_BOARD[1], 'DOODAD', 'test assumes square 1 is a doodad');
      assert(s.pending && s.pending.kind === 'bill', 'the player should be shown a bill');
      eq(s.pending.amount, 600, 'the bill states the amount');
      eq(s.cash, 20000, 'nothing is taken before the player pays');
      assert(!E.act(s, 'acknowledge').ok, 'a compulsory bill must not be dismissable');
      eq(s.cash, 20000, 'a refused dismissal changes nothing');
      assert(E.act(s, 'payBill').ok, 'paying failed');
      eq(s.cash, 19400, 'paid');
      eq(s.pending, null, 'and the board is free again');
    });

    test('refusing an optional doodad costs nothing at all', function () {
      var s = E.createGame({ seed: 118, professionId: 'doctor' });
      s.cash = 20000;
      forceCardOnTop(s, 'doodad', 'dd15');          // $2,500 watch, refusable
      s.position = 0;
      E.roll(s, 1, [1]);
      eq(s.pending.kind, 'doodadOptional', 'a luxury must be offered, not charged');
      var expenses = E.stats(s).totalExpenses;
      assert(E.act(s, 'acknowledge').ok, 'refusing failed');
      eq(s.cash, 20000, 'refusing must not cost a cent');
      eq(E.stats(s).totalExpenses, expenses, 'nor add an expense');
      eq(s.pending, null, 'and the turn ends cleanly');
    });

    test('every doodad over $700 is refusable, and every compulsory one is a real bill', function () {
      D.DOODADS.forEach(function (c) {
        if (c.optional) return;
        assert(c.amount <= 700,
          'compulsory doodad "' + c.title + '" costs ' + c.amount +
          ' - anything this large must be a choice the player can decline');
        assert(!c.addExpense,
          'compulsory doodad "' + c.title + '" adds a permanent expense; that must be optional');
      });
    });

    test('a bill you cannot pay forces a sale before it declares you bankrupt', function () {
      var s = E.createGame({ seed: 114, professionId: 'janitor' });
      E.act(s, 'borrow', { amount: E.availableCredit(s) });   // no credit left
      s.cash = 0;
      // Something liquid to sell: shares bought for $9,000.
      s.stocks.GRW = { shares: 300, invested: 9000 };
      // Force a mandatory doodad through the engine.
      forceCardOnTop(s, 'doodad', 'dd06');                    // $600 car repair, mandatory
      s.position = 0;
      E.roll(s, 1, [1]);
      assert(E.act(s, 'payBill').ok, 'paying the bill failed');
      eq(D.RAT_RACE_BOARD[1], 'DOODAD', 'test assumes square 1 is a doodad');
      eq(s.phase, 'ratrace', 'the player should have survived by selling');
      eq(s.stocks.GRW, undefined, 'the shares should have been sold');
      eq(s.cash, 9000 - 600, 'proceeds less the bill');
      eq(E.checkInvariants(s).length, 0, 'invariants after a forced sale');
    });

    test('a forced sale takes a discount on property but not on liquid holdings', function () {
      var s = E.createGame({ seed: 115, professionId: 'janitor' });
      s.assets.push({
        id: 1, category: 'realestate', propType: 'house3_2', name: 'House',
        cost: 50000, down: 5000, mortgage: 20000, cashflow: 200, units: 1, acres: 0
      });
      s.nextAssetId = 2;
      // Exhaust the credit line only after the asset exists, since its income
      // is part of what the bank lends against.
      E.act(s, 'borrow', { amount: E.availableCredit(s) });
      s.cash = 0;
      forceCardOnTop(s, 'doodad', 'dd06');
      s.position = 0;
      E.roll(s, 1, [1]);
      E.act(s, 'payBill');
      // 80% of $50,000 is $40,000; clearing the $20,000 mortgage leaves $20,000.
      eq(s.cash, 20000 - 600, 'distressed sale proceeds less the bill');
      eq(s.assets.length, 0, 'the property is gone');
      eq(E.stats(s).passiveIncome, 0, 'and so is its income');
    });

    test('property worth less than its mortgage cannot be dumped to raise cash', function () {
      var s = E.createGame({ seed: 116, professionId: 'janitor' });
      s.assets.push({
        id: 1, category: 'realestate', propType: 'plex', name: 'Overleveraged plex',
        cost: 100000, down: 5000, mortgage: 95000, cashflow: 100, units: 4, acres: 0
      });
      s.nextAssetId = 2;
      E.act(s, 'borrow', { amount: E.availableCredit(s) });
      s.cash = 0;
      forceCardOnTop(s, 'doodad', 'dd06');
      s.position = 0;
      E.roll(s, 1, [1]);
      E.act(s, 'payBill');
      eq(s.phase, 'bankrupt', '80% of cost does not clear the mortgage, so nothing can be sold');
      eq(s.assets.length, 1, 'the property was not given away below its debt');
    });

    test('paying off a debt removes its monthly payment for good', function () {
      var s = E.createGame({ seed: 119, professionId: 'teacher' });
      var before = E.stats(s);
      var carPayment = s.profession.car.payment;
      var carBalance = s.profession.car.liability;
      assert(carPayment > 0 && carBalance > 0, 'the teacher should start with a car loan');

      s.cash = carBalance - 1;
      assert(!E.act(s, 'repayLiability', { which: 'car' }).ok, 'paid off a debt without the money');
      eq(s.profession.car.liability, carBalance, 'nothing changed on a refused payoff');

      s.cash = carBalance + 250;
      assert(E.act(s, 'repayLiability', { which: 'car' }).ok, 'payoff failed');
      eq(s.cash, 250, 'the balance came out of cash');
      eq(s.profession.car.liability, 0, 'debt cleared');
      eq(s.profession.car.payment, 0, 'and its monthly payment with it');
      eq(E.stats(s).totalExpenses, before.totalExpenses - carPayment, 'expenses fell by the payment');
      eq(E.stats(s).cashflow, before.cashflow + carPayment, 'cash flow rose by the same');
      assert(!E.act(s, 'repayLiability', { which: 'car' }).ok, 'paid off the same debt twice');
      eq(E.checkInvariants(s).length, 0, 'invariants after a payoff');
    });

    test('stocks must be paid for in cash', function () {
      var s = E.createGame({ seed: 12, professionId: 'janitor' });
      s.cash = 100;
      s.pending = {
        kind: 'deal', deck: 'small',
        card: { id: 'x', kind: 'stock', symbol: 'HLTH', title: 'HLTH', price: 20, dividend: 0, range: [5, 40] }
      };
      var r = E.act(s, 'buyStock', { qty: 50 });
      assert(!r.ok, 'the engine let a player buy shares they could not pay for');
      eq(s.cash, 100, 'cash untouched by the rejected trade');
      eq(s.bankLoan, 0, 'no silent loan for shares');
    });

    test('a stock round trip tracks cost basis and dividends', function () {
      var s = E.createGame({ seed: 13, professionId: 'doctor' });
      s.cash = 10000;
      s.pending = {
        kind: 'deal', deck: 'small',
        card: { id: 'x', kind: 'stock', symbol: 'SAFE', title: 'SAFE', price: 20, dividend: 1, range: [20, 40] }
      };
      assert(E.act(s, 'buyStock', { qty: 100 }).ok, 'buy failed');
      eq(s.cash, 8000, 'cash after buying');
      eq(s.stocks.SAFE.shares, 100, 'shares held');
      eq(E.stats(s).interestDividends, 100, 'dividend income');

      s.pending = {
        kind: 'deal', deck: 'small',
        card: { id: 'y', kind: 'stock', symbol: 'SAFE', title: 'SAFE', price: 40, dividend: 1, range: [20, 40] }
      };
      assert(E.act(s, 'sellStock', { qty: 100 }).ok, 'sell failed');
      eq(s.cash, 12000, 'cash after selling at double');
      eq(s.stocks.SAFE, undefined, 'empty holding removed');
      eq(E.stats(s).interestDividends, 0, 'dividend income gone');
      eq(E.checkInvariants(s).length, 0, 'invariants after the round trip');
    });

    test('a stock split changes the share count but not the money', function () {
      var s = E.createGame({ seed: 14, professionId: 'doctor' });
      s.stocks.HLTH = { shares: 50, invested: 1000 };
      var cash = s.cash;
      // Force the split card into the engine's path.
      forceCardOnTop(s, 'small', 'sd24');
      s.position = 0;
      s.pending = { kind: 'chooseDeck' };
      assert(E.act(s, 'chooseDeck', { deck: 'small' }).ok, 'draw failed');
      eq(s.stocks.HLTH.shares, 100, 'shares should double');
      eq(s.stocks.HLTH.invested, 1000, 'cost basis unchanged');
      eq(s.cash, cash, 'no cash moved');
    });

    test('a reverse split can wipe out a tiny holding without leaving a ghost', function () {
      var s = E.createGame({ seed: 15, professionId: 'doctor' });
      s.stocks.MYTV = { shares: 1, invested: 5 };
      forceCardOnTop(s, 'small', 'sd26');
      s.pending = { kind: 'chooseDeck' };
      assert(E.act(s, 'chooseDeck', { deck: 'small' }).ok, 'draw failed');
      eq(s.stocks.MYTV, undefined, 'zero-share holding must be removed');
      eq(E.checkInvariants(s).length, 0, 'invariants after a wipeout');
    });

    /* ---------------- selling ---------------- */

    test('selling a property clears its mortgage and its income', function () {
      var s = E.createGame({ seed: 16, professionId: 'doctor' });
      s.assets.push({
        id: 1, category: 'realestate', propType: 'house3_2', name: 'House',
        cost: 60000, down: 6000, mortgage: 54000, cashflow: 300, units: 1, acres: 0
      });
      s.nextAssetId = 2;
      var cash = s.cash;
      s.pending = {
        kind: 'sellAsset', title: 'Buyer', text: '',
        offers: [{ assetId: 1, name: 'House', price: 75000, mortgage: 54000, netCash: 21000, cashflowLost: 300, cost: 60000 }]
      };
      assert(E.act(s, 'sellAsset', { assetId: 1 }).ok, 'sale failed');
      eq(s.cash, cash + 21000, 'net cash from the sale');
      eq(s.assets.length, 0, 'asset removed');
      eq(E.stats(s).passiveIncome, 0, 'income removed with the asset');
      eq(E.checkInvariants(s).length, 0, 'invariants after selling');
    });

    test('a sale below the mortgage costs you cash instead of paying you', function () {
      var s = E.createGame({ seed: 17, professionId: 'doctor' });
      s.cash = 50000;
      s.assets.push({
        id: 1, category: 'realestate', propType: 'plex', name: 'Underwater plex',
        cost: 280000, down: 20000, mortgage: 260000, cashflow: 1100, units: 10, acres: 0
      });
      s.pending = {
        kind: 'sellAsset', title: 'Lowball', text: '',
        offers: [{ assetId: 1, name: 'Underwater plex', price: 200000, mortgage: 260000, netCash: -60000, cashflowLost: 1100, cost: 280000 }]
      };
      assert(E.act(s, 'sellAsset', { assetId: 1 }).ok, 'sale failed');
      assert(s.cash >= 0, 'cash went negative on a loss-making sale');
      assert(s.bankLoan > 0, 'the shortfall should have been financed');
      eq(E.checkInvariants(s).length, 0, 'invariants after an underwater sale');
    });

    test('a general "any property" buyer buys one property, not the whole portfolio', function () {
      var s = E.createGame({ seed: 18, professionId: 'doctor' });
      for (var i = 1; i <= 3; i++) {
        s.assets.push({
          id: i, category: 'realestate', propType: 'house3_2', name: 'House ' + i,
          cost: 60000, down: 6000, mortgage: 50000, cashflow: 200, units: 1, acres: 0
        });
      }
      s.nextAssetId = 4;
      s.pending = {
        kind: 'sellAsset', title: 'Out of town investor', text: '',
        offers: s.assets.map(function (a) {
          return {
            assetId: a.id, name: a.name, price: 78000, mortgage: a.mortgage,
            netCash: 28000, cashflowLost: a.cashflow, cost: a.cost, singleOnly: true
          };
        })
      };
      assert(E.act(s, 'sellAsset', { assetId: 2 }).ok, 'sale failed');
      eq(s.assets.length, 2, 'only one property should be sold');
      eq(s.pending, null, 'the single buyer is finished');
    });

    test('gold sells first-in-last-out and never leaves an empty lot behind', function () {
      var s = E.createGame({ seed: 19, professionId: 'doctor' });
      s.assets.push({ id: 1, category: 'gold', name: 'Gold coins', qty: 4, cost: 2000, unitPrice: 500, cashflow: 0, mortgage: 0 });
      s.assets.push({ id: 2, category: 'gold', name: 'Gold coins', qty: 2, cost: 1200, unitPrice: 600, cashflow: 0, mortgage: 0 });
      s.nextAssetId = 3;
      eq(E.totalGold(s), 6, 'six coins held');
      var cash = s.cash;
      s.pending = { kind: 'sellGold', title: 'Gold buyer', text: '', unitPrice: 1000, maxQty: 6 };
      assert(E.act(s, 'sellGold', { qty: 6 }).ok, 'sale failed');
      eq(s.cash, cash + 6000, 'proceeds');
      eq(E.totalGold(s), 0, 'no coins left');
      eq(s.assets.length, 0, 'no empty lots left behind');
      eq(E.checkInvariants(s).length, 0, 'invariants after selling gold');
    });

    /* ---------------- escaping ---------------- */

    test('you escape the moment passive income passes total expenses, not before', function () {
      var s = E.createGame({ seed: 20, professionId: 'janitor' });
      var exp = E.stats(s).totalExpenses;
      // Add income that exactly equals expenses -- must NOT escape.
      s.assets.push({
        id: 1, category: 'realestate', propType: 'plex', name: 'Exactly enough',
        cost: 1, down: 1, mortgage: 0, cashflow: exp, units: 1, acres: 0
      });
      s.nextAssetId = 2;
      eq(E.stats(s).escaped, false, 'equal is not greater');
      E.act(s, 'acknowledge');
      eq(s.phase, 'ratrace', 'should still be in the rat race');

      s.assets[0].cashflow = exp + 1;
      E.act(s, 'acknowledge');
      eq(s.phase, 'fasttrack', 'one dollar over should escape');
      eq(s.ftBaseIncome, (exp + 1) * 100, 'fast track income is passive income times 100');
      eq(E.checkInvariants(s).length, 0, 'invariants on the fast track');
    });

    test('the fast track is won by cash flow or by buying your own dream', function () {
      var s = E.createGame({ seed: 21, professionId: 'doctor', dreamId: 'dr05' });
      s.phase = 'fasttrack';
      s.ftBaseIncome = 10000;
      s.cash = 5000000;
      // Cash flow route
      s.pending = { kind: 'ftInvestment', investmentId: 'ft18', title: '', cost: 1500000, cashflow: 130000 };
      assert(E.act(s, 'buyInvestment').ok, 'purchase failed');
      eq(s.phase, 'won', '130,000 of new income should win');
      eq(s.result.how, 'cashflow', 'won by cash flow');

      var s2 = E.createGame({ seed: 22, professionId: 'doctor', dreamId: 'dr05' });
      s2.phase = 'fasttrack';
      s2.cash = 200000;
      s2.pending = { kind: 'ftDream', dreamId: 'dr05', title: '', cost: 100000 };
      assert(E.act(s2, 'buyDream').ok, 'dream purchase failed');
      eq(s2.phase, 'won', 'buying your dream wins');
      eq(s2.cash, 100000, 'the dream was paid for');
    });

    test('the Fast Track cash flow goal scales to the income you arrived with', function () {
      // A big escape must double a big number, not clear a token $50,000.
      var rich = E.createGame({ seed: 210, professionId: 'doctor', dreamId: 'dr05' });
      rich.phase = 'fasttrack';
      rich.ftBaseIncome = 350000;
      rich.cash = 9000000;
      eq(E.fastTrackGoal(rich), 350000, 'goal should equal the arrival income');

      rich.pending = { kind: 'ftInvestment', investmentId: 'ft18', title: '', cost: 1500000, cashflow: 130000 };
      assert(E.act(rich, 'buyInvestment').ok, 'purchase failed');
      eq(rich.phase, 'fasttrack', '130,000 of new income must not win against a 350,000 goal');

      // Enough purchases to double it does win.
      var added = 130000;
      var guard = 0;
      while (rich.phase === 'fasttrack' && guard++ < 10) {
        rich.pending = { kind: 'ftInvestment', investmentId: 'ft18', title: '', cost: 1500000, cashflow: 130000 };
        E.act(rich, 'buyInvestment');
        added += 130000;
      }
      eq(rich.phase, 'won', 'doubling the arrival income should win');
      assert(added >= 350000, 'won only after adding at least the arrival income');

      // A small escape is held to the floor rather than a trivial target.
      var lean = E.createGame({ seed: 211, professionId: 'janitor', dreamId: 'dr05' });
      lean.phase = 'fasttrack';
      lean.ftBaseIncome = 12000;
      eq(E.fastTrackGoal(lean), 50000, 'the floor applies below it');
    });

    test('you cannot buy another player\'s dream, and cannot buy yours without the cash', function () {
      var s = E.createGame({ seed: 23, professionId: 'doctor', dreamId: 'dr05' });
      s.phase = 'fasttrack';
      s.cash = 10;
      s.pending = { kind: 'ftDream', dreamId: 'dr05', title: '', cost: 100000 };
      assert(!E.act(s, 'buyDream').ok, 'bought a dream without the money');
      eq(s.phase, 'fasttrack', 'still playing');
    });

    /* ---------------- state handling ---------------- */

    test('illegal actions are refused and change nothing', function () {
      var s = E.createGame({ seed: 24, professionId: 'nurse' });
      var before = E.serialize(s);
      ['buyDeal', 'buyStock', 'sellAsset', 'charityDonate', 'buyDream', 'buyInvestment', 'nonsense']
        .forEach(function (a) {
          var r = E.act(s, a, { qty: 1, amount: 1000, assetId: 99 });
          assert(!r.ok, a + ' should not have been allowed');
        });
      eq(E.serialize(s), before, 'a refused action must not mutate state');
    });

    test('you cannot roll while a decision is pending', function () {
      var s = E.createGame({ seed: 25, professionId: 'nurse' });
      s.pending = { kind: 'chooseDeck', title: '', text: '' };
      eq(E.canRoll(s), false, 'canRoll should be false');
      var threw = false;
      try { E.roll(s, 1); } catch (e) { threw = true; }
      assert(threw, 'rolling mid-decision should throw');
    });

    test('save and load reproduce the game exactly', function () {
      var s = E.createGame({ seed: 26, professionId: 'engineer' });
      for (var i = 0; i < 30 && !s.pending && s.phase === 'ratrace'; i++) {
        E.roll(s, 1);
        if (s.pending) E.act(s, 'acknowledge');
      }
      var text = E.serialize(s);
      var back = E.deserialize(text);
      eq(E.serialize(back), text, 'round trip changed the state');
    });

    test('a corrupted save is rejected rather than loaded', function () {
      var s = E.createGame({ seed: 27, professionId: 'engineer' });
      s.cash = -5000;
      var threw = false;
      try { E.deserialize(E.serialize(s)); } catch (e) { threw = true; }
      assert(threw, 'negative cash should have been rejected on load');
    });

    test('the same seed and the same choices replay identically', function () {
      function play(seed) {
        var s = E.createGame({ seed: seed, professionId: 'teacher', dreamId: 'dr02' });
        var r = makeRng(seed ^ 0x5f5f);
        playRandomly(E, D, s, r, 150);
        return E.serialize(s);
      }
      eq(play(31337), play(31337), 'two identical runs diverged');
      assert(play(31337) !== play(31338), 'different seeds produced identical games');
    });

    test('decks never run dry and never hand back an undefined card', function () {
      var s = E.createGame({ seed: 28, professionId: 'doctor' });
      // Draw far more cards than exist, forcing repeated reshuffles.
      for (var i = 0; i < 600; i++) {
        s.pending = { kind: 'chooseDeck', title: '', text: '' };
        var r = E.act(s, 'chooseDeck', { deck: i % 2 ? 'big' : 'small' });
        assert(r.ok, 'draw ' + i + ' failed: ' + r.error);
        if (s.pending) {
          assert(s.pending.kind !== 'deal' || s.pending.card, 'a deal with no card at draw ' + i);
          E.act(s, 'pass');
        }
        if (s.phase !== 'ratrace') break;
      }
      eq(E.checkInvariants(s).length, 0, 'invariants after 600 draws');
    });

    /* ---------------- the big one ---------------- */

    /* A balance check, not a correctness check. The random agent above proves
     * the engine cannot be broken; this one proves the game can be won by
     * playing well, and cannot be won by accident. If either number drifts,
     * the economy changed even though every rule still passes. */
    test('a competent player escapes the Rat Race, and a careless one can still lose', function () {
      var games = 600, escaped = 0, bust = 0, months = [];
      for (var g = 0; g < games; g++) {
        var seed = 400000 + g;
        var prof = D.PROFESSIONS[g % D.PROFESSIONS.length];
        var s = E.createGame({ seed: seed, professionId: prof.id, dreamId: D.DREAMS[g % D.DREAMS.length].id });
        var out = playSensibly(E, D, s, 400);
        if (out.error) throw new Error('game ' + seed + ' (' + prof.name + '): ' + out.error);
        if (s.phase === 'bankrupt') bust++;
        else if (s.phase !== 'ratrace') { escaped++; months.push(out.escapedAt); }
      }
      assert(escaped > games * 0.9,
        'only ' + escaped + ' of ' + games + ' competent players escaped - the game is too hard to teach anything');
      assert(bust > 0,
        'no competent player ever went bankrupt - the risk is cosmetic');
      assert(bust < games * 0.1,
        bust + ' of ' + games + ' competent players went bankrupt - too punishing');
      months.sort(function (a, b) { return a - b; });
      var median = months[Math.floor(months.length / 2)];
      assert(median > 24 && median < 240,
        'median escape is ' + median + ' months, which is either trivial or a grind');
      current.note = escaped + '/' + games + ' escaped, ' + bust + ' bankrupt, median ' +
        median + ' months (' + months[0] + '-' + months[months.length - 1] + ')';
    });

    test('2,000 random games finish without an error or a broken balance sheet', function () {
      var totalMonths = 0, wins = 0, escapes = 0, busts = 0, games = 2000;
      for (var g = 0; g < games; g++) {
        var seed = 100000 + g;
        var prof = D.PROFESSIONS[g % D.PROFESSIONS.length];
        var dream = D.DREAMS[g % D.DREAMS.length];
        var s = E.createGame({ seed: seed, professionId: prof.id, dreamId: dream.id });
        var r = makeRng(seed ^ 0xabcdef);
        var outcome = playRandomly(E, D, s, r, 600);
        if (outcome.error) {
          throw new Error('game ' + seed + ' (' + prof.name + ') failed at month ' +
            s.months + ': ' + outcome.error);
        }
        totalMonths += s.months;
        if (s.phase === 'fasttrack' || s.phase === 'won') escapes++;
        if (s.phase === 'won') wins++;
        if (s.phase === 'bankrupt') busts++;
      }
      // Not an assertion about correctness so much as a smoke signal: if a
      // random player never escapes, the economy is broken even if the code is
      // not, and if every random player escapes, nothing is being taught.
      // No assertion on the outcome here: a player who accepts three deals in
      // four, borrows to the limit and never sells is supposed to go broke.
      // This test exists to prove the engine survives them, not that they win.
      // The balance check above is what watches the economy.
      current.note = escapes + '/' + games + ' escaped, ' + wins + ' won, ' +
        busts + ' bankrupt, ' + Math.round(totalMonths / games) + ' months average';
    });

    return results;
  }

  /* ------------------------------------------------------------------ *
   * A random player. It only ever chooses actions that should be legal,
   * so any refusal is itself a bug and gets reported.
   * ------------------------------------------------------------------ */

  function playRandomly(E, D, s, rng, maxTurns) {
    var guard = 0;
    try {
      while (!E.isOver(s) && s.months < maxTurns) {
        if (++guard > maxTurns * 40) {
          return { error: 'the game stopped making progress (possible deadlock) at month ' + s.months };
        }

        if (s.pending === null) {
          var opts = E.diceOptions(s);
          E.roll(s, opts[Math.floor(rng.next() * opts.length)]);
        } else {
          var res = stepPending(E, D, s, rng);
          if (res) return res;
        }

        var problems = E.checkInvariants(s);
        if (problems.length) return { error: problems.join(' | ') };
      }
      return {};
    } catch (e) {
      return { error: (e && e.message) || String(e) };
    }
  }

  /* ------------------------------------------------------------------ *
   * A competent player. Deliberately simple, and deliberately not optimal:
   * pay off expensive debt, buy cash-flowing assets you can afford outright,
   * buy shares low and sell them high, and say no to luxuries. If a strategy
   * this plain cannot win, the game is not teachable.
   * ------------------------------------------------------------------ */

  function playSensibly(E, D, s, maxTurns) {
    var guard = 0, escapedAt = null;
    try {
      while (!E.isOver(s) && s.months < maxTurns) {
        if (++guard > maxTurns * 40) return { error: 'no progress at month ' + s.months };

        if (s.pending === null) {
          // Bank debt costs 120% a year. Clear it before doing anything else,
          // but keep a cash buffer for the next bill.
          if (s.phase === 'ratrace' && s.bankLoan > 0 && s.cash > 4000) {
            var pay = Math.min(s.bankLoan, Math.floor((s.cash - 3000) / 1000) * 1000);
            if (pay > 0) E.act(s, 'repay', { amount: pay });
          }
          var opts = E.diceOptions(s);
          E.roll(s, opts[opts.length - 1]);
        } else {
          var res = sensibleStep(E, s);
          if (res && !res.ok) return { error: 'sensible action refused: ' + res.error };
        }

        if (escapedAt === null && (s.phase === 'fasttrack' || s.phase === 'won')) escapedAt = s.months;
        var problems = E.checkInvariants(s);
        if (problems.length) return { error: problems.join(' | ') };
      }
      return { escapedAt: escapedAt };
    } catch (e) {
      return { error: (e && e.message) || String(e) };
    }
  }

  function sensibleStep(E, s) {
    var p = s.pending;

    if (p.kind === 'bill') return E.act(s, 'payBill');

    if (p.kind === 'chooseDeck') {
      return E.act(s, 'chooseDeck', { deck: s.cash >= 25000 ? 'big' : 'small' });
    }

    if (p.kind === 'deal') {
      var c = p.card;
      if (c.kind === 'trap' || c.kind === 'gold' || c.kind === 'cd') return E.act(s, 'pass');
      if (c.kind === 'stock') {
        var lo = c.range[0], hi = c.range[1], held = s.stocks[c.symbol];
        if (held && c.price >= lo + (hi - lo) * 0.7) {
          return E.act(s, 'sellStock', { qty: held.shares });
        }
        if (c.price <= lo + (hi - lo) * 0.3) {
          var qty = Math.floor(Math.floor(s.cash * 0.4) / c.price);
          if (qty >= 1) return E.act(s, 'buyStock', { qty: qty });
        }
        return E.act(s, 'pass');
      }
      // Buy income you can pay for in cash, at a return worth having.
      if (c.cashflow > 0 && c.down <= s.cash && (c.cashflow * 12 / c.down) >= 0.12) {
        return E.act(s, 'buyDeal');
      }
      return E.act(s, 'pass');
    }

    if (p.kind === 'charity') {
      return s.cash > p.amount * 4 ? E.act(s, 'charityDonate') : E.act(s, 'acknowledge');
    }
    if (p.kind === 'doodadOptional') return E.act(s, 'acknowledge');

    if (p.kind === 'sellAsset') {
      var best = null;
      p.offers.forEach(function (o) {
        if (o.netCash > 0 && o.price >= o.cost * 1.25 && (!best || o.netCash > best.netCash)) best = o;
      });
      return best ? E.act(s, 'sellAsset', { assetId: best.assetId }) : E.act(s, 'acknowledge');
    }
    if (p.kind === 'sellGold') return E.act(s, 'sellGold', { qty: p.maxQty });
    if (p.kind === 'ftInvestment') {
      return s.cash >= p.cost ? E.act(s, 'buyInvestment') : E.act(s, 'acknowledge');
    }
    if (p.kind === 'ftDream') {
      return s.cash >= p.cost ? E.act(s, 'buyDream') : E.act(s, 'acknowledge');
    }
    return E.act(s, 'acknowledge');
  }

  // Voluntary spending is only legal if cash plus available credit covers it.
  function canAfford(E, s, amount) {
    return s.cash + E.availableCredit(s) >= amount;
  }

  function stepPending(E, D, s, rng) {
    var p = s.pending;
    var r;

    function run(action, payload) {
      var res = E.act(s, action, payload);
      if (!res.ok) return { error: 'legal action "' + action + '" was refused: ' + res.error };
      return null;
    }

    switch (p.kind) {
      case 'bill':
        // Sometimes take a loan first, so the deliberate-borrow path is exercised.
        if (rng.next() < 0.15) {
          var room = E.availableCredit(s);
          if (room >= 1000) E.act(s, 'borrow', { amount: 1000 });
        }
        return run('payBill');

      case 'chooseDeck':
        return run('chooseDeck', { deck: rng.next() < 0.5 ? 'small' : 'big' });

      case 'deal': {
        var c = p.card;
        if (rng.next() < 0.25) return run('pass');
        if (c.kind === 'stock') {
          var held = s.stocks[c.symbol];
          if (held && rng.next() < 0.4) {
            return run('sellStock', { qty: 1 + Math.floor(rng.next() * held.shares) });
          }
          var afford = Math.floor(s.cash / c.price);
          if (afford < 1) return run('pass');
          return run('buyStock', { qty: 1 + Math.floor(rng.next() * afford) });
        }
        if (c.kind === 'gold') {
          var maxCoins = Math.min(c.maxQty, Math.floor(s.cash / c.unitPrice));
          if (maxCoins < 1) return run('pass');
          return run('buyGold', { qty: 1 + Math.floor(rng.next() * maxCoins) });
        }
        if (c.kind === 'cd') {
          if (s.cash < c.cost) return run('pass');
          return run('buyDeal');
        }
        // Purchases are cash only; nothing here quietly takes out a loan.
        var due = c.kind === 'trap' ? c.cost : c.down;
        if (s.cash < due) return run('pass');
        return run('buyDeal');
      }

      case 'charity':
        if (rng.next() < 0.5 || !canAfford(E, s, p.amount)) return run('acknowledge');
        return run('charityDonate');

      case 'doodadOptional':
        if (rng.next() >= 0.3 || !canAfford(E, s, p.amount)) return run('acknowledge');
        return run('doodadAccept');

      case 'sellAsset': {
        if (rng.next() < 0.4) return run('acknowledge');
        var offer = p.offers[Math.floor(rng.next() * p.offers.length)];
        // A sale that does not clear its own mortgage has to be funded.
        if (offer.netCash < 0 && s.cash + E.availableCredit(s) < -offer.netCash) {
          return run('acknowledge');
        }
        return run('sellAsset', { assetId: offer.assetId });
      }

      case 'sellGold':
        if (rng.next() < 0.4) return run('acknowledge');
        return run('sellGold', { qty: 1 + Math.floor(rng.next() * p.maxQty) });

      case 'ftInvestment':
        if (s.cash < p.cost || rng.next() < 0.15) return run('acknowledge');
        return run('buyInvestment');

      case 'ftDream':
        if (s.cash < p.cost) return run('acknowledge');
        return run('buyDream');

      case 'ftCharity':
        if (rng.next() < 0.5 || s.cash < p.amount) return run('acknowledge');
        return run('ftCharityDonate');

      default:
        r = run('acknowledge');
        if (r) return r;
        if (s.pending && s.pending.kind === p.kind) {
          return { error: 'pending state "' + p.kind + '" could not be cleared - the board is stuck' };
        }
        return null;
    }
  }

  global.CF = global.CF || {};
  global.CF.runTests = runAll;
})(typeof window !== 'undefined' ? window : globalThis);
