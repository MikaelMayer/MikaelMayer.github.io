/* Game content: board layouts, professions, dreams and all four card decks.
 *
 * Everything here is plain serialisable data -- no functions. Card effects are
 * declared as {kind, ...} descriptors that engine.js interprets. That keeps the
 * rules in one place (the engine) and makes the content safe to hand-edit,
 * translate, or swap for an official data set without touching game logic.
 *
 * All money values are whole dollars. No floats anywhere in the money path.
 */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------------
   * Boards
   * ------------------------------------------------------------------- */

  // 24 squares -- fits exactly on the perimeter of a 7x7 grid (7*4-4 = 24).
  var RAT_RACE_BOARD = [
    'OPPORTUNITY', 'DOODAD', 'OPPORTUNITY', 'CHARITY',
    'OPPORTUNITY', 'PAYDAY', 'OPPORTUNITY', 'MARKET',
    'OPPORTUNITY', 'DOODAD', 'OPPORTUNITY', 'BABY',
    'OPPORTUNITY', 'PAYDAY', 'OPPORTUNITY', 'MARKET',
    'OPPORTUNITY', 'DOODAD', 'OPPORTUNITY', 'DOWNSIZED',
    'OPPORTUNITY', 'PAYDAY', 'OPPORTUNITY', 'MARKET'
  ];

  /* ---------------------------------------------------------------------
   * Professions
   *
   * Each one is internally consistent: monthly cash flow = salary - (taxes +
   * every loan payment + other expenses). Loan payments are what you pay each
   * month; the matching liability is the balance you'd have to clear to be rid
   * of it. Savings is starting cash.
   * ------------------------------------------------------------------- */

  var PROFESSIONS = [
    {
      id: 'janitor', name: 'Janitor', salary: 1600, taxes: 280,
      home: { payment: 200, liability: 20000 },
      school: { payment: 0, liability: 0 },
      car: { payment: 60, liability: 4000 },
      creditCard: { payment: 60, liability: 2000 },
      retail: { payment: 50, liability: 1000 },
      other: 300, childCost: 140, savings: 560
    },
    {
      id: 'mechanic', name: 'Mechanic', salary: 2000, taxes: 360,
      home: { payment: 300, liability: 28000 },
      school: { payment: 0, liability: 0 },
      car: { payment: 80, liability: 6000 },
      creditCard: { payment: 90, liability: 3000 },
      retail: { payment: 50, liability: 1000 },
      other: 250, childCost: 160, savings: 720
    },
    {
      id: 'truck-driver', name: 'Truck Driver', salary: 2500, taxes: 460,
      home: { payment: 400, liability: 38000 },
      school: { payment: 60, liability: 12000 },
      car: { payment: 100, liability: 8000 },
      creditCard: { payment: 60, liability: 2000 },
      retail: { payment: 50, liability: 1000 },
      other: 300, childCost: 180, savings: 610
    },
    {
      id: 'secretary', name: 'Secretary', salary: 2500, taxes: 460,
      home: { payment: 400, liability: 38000 },
      school: { payment: 60, liability: 12000 },
      car: { payment: 120, liability: 9000 },
      creditCard: { payment: 90, liability: 3000 },
      retail: { payment: 50, liability: 1000 },
      other: 300, childCost: 170, savings: 710
    },
    {
      id: 'police-officer', name: 'Police Officer', salary: 3000, taxes: 580,
      home: { payment: 500, liability: 46000 },
      school: { payment: 60, liability: 12000 },
      car: { payment: 100, liability: 8000 },
      creditCard: { payment: 60, liability: 2000 },
      retail: { payment: 50, liability: 1000 },
      other: 330, childCost: 200, savings: 700
    },
    {
      id: 'nurse', name: 'Nurse', salary: 3100, taxes: 600,
      home: { payment: 700, liability: 75000 },
      school: { payment: 150, liability: 30000 },
      car: { payment: 120, liability: 9000 },
      creditCard: { payment: 90, liability: 3000 },
      retail: { payment: 50, liability: 1000 },
      other: 380, childCost: 240, savings: 760
    },
    {
      id: 'teacher', name: 'Teacher (K-12)', salary: 3300, taxes: 630,
      home: { payment: 700, liability: 75000 },
      school: { payment: 120, liability: 24000 },
      car: { payment: 140, liability: 11000 },
      creditCard: { payment: 90, liability: 3000 },
      retail: { payment: 50, liability: 1000 },
      other: 400, childCost: 240, savings: 400
    },
    {
      id: 'business-manager', name: 'Business Manager', salary: 4600, taxes: 910,
      home: { payment: 700, liability: 75000 },
      school: { payment: 300, liability: 60000 },
      car: { payment: 300, liability: 19000 },
      creditCard: { payment: 270, liability: 9000 },
      retail: { payment: 50, liability: 1000 },
      other: 700, childCost: 300, savings: 400
    },
    {
      id: 'engineer', name: 'Engineer', salary: 4900, taxes: 1050,
      home: { payment: 1090, liability: 75000 },
      school: { payment: 60, liability: 12000 },
      car: { payment: 220, liability: 17000 },
      creditCard: { payment: 140, liability: 5000 },
      retail: { payment: 50, liability: 1000 },
      other: 700, childCost: 320, savings: 400
    },
    {
      id: 'lawyer', name: 'Lawyer', salary: 7500, taxes: 1830,
      home: { payment: 1100, liability: 115000 },
      school: { payment: 300, liability: 60000 },
      car: { payment: 300, liability: 19000 },
      creditCard: { payment: 270, liability: 9000 },
      retail: { payment: 50, liability: 1000 },
      other: 1100, childCost: 380, savings: 400
    },
    {
      id: 'airline-pilot', name: 'Airline Pilot', salary: 9500, taxes: 2350,
      home: { payment: 1330, liability: 150000 },
      school: { payment: 750, liability: 150000 },
      car: { payment: 380, liability: 33000 },
      creditCard: { payment: 220, liability: 7000 },
      retail: { payment: 50, liability: 1000 },
      other: 1400, childCost: 480, savings: 400
    },
    {
      id: 'doctor', name: 'Doctor (MD)', salary: 13200, taxes: 3420,
      home: { payment: 1900, liability: 202000 },
      school: { payment: 750, liability: 150000 },
      car: { payment: 380, liability: 33000 },
      creditCard: { payment: 270, liability: 9000 },
      retail: { payment: 50, liability: 1000 },
      other: 2880, childCost: 640, savings: 400
    }
  ];

  /* ---------------------------------------------------------------------
   * Small Deals -- affordable opportunities. Down payments stay at or below
   * about $6,500 so they are reachable early.
   * ------------------------------------------------------------------- */

  // Symbols whose price moves between draws; dividend is monthly per share.
  var STOCK_SYMBOLS = {
    HLTH: { name: 'HealthCo', dividend: 0, range: [5, 40] },
    GRW: { name: 'GrowTech', dividend: 0, range: [5, 40] },
    BIGX: { name: 'BigBox Retail', dividend: 0, range: [10, 50] },
    MYTV: { name: 'MediaTV', dividend: 0, range: [1, 30] },
    NRGY: { name: 'NuEnergy', dividend: 0, range: [5, 40] },
    SAFE: { name: 'SafePower Utility', dividend: 1, range: [20, 40] },
    REIT: { name: 'Income REIT Fund', dividend: 1, range: [20, 40] }
  };

  function stock(id, symbol, price, note) {
    var meta = STOCK_SYMBOLS[symbol];
    return {
      id: id, deck: 'small', kind: 'stock', symbol: symbol,
      title: symbol + ' - ' + meta.name,
      price: price, dividend: meta.dividend, range: meta.range,
      text: 'Shares are trading at $' + price + '. Trading range $' +
        meta.range[0] + ' - $' + meta.range[1] + '.' +
        (meta.dividend ? ' Pays $' + meta.dividend + ' per share per month.' : ' Pays no dividend.') +
        (note ? ' ' + note : '')
    };
  }

  function property(id, deck, propType, title, cost, down, cashflow, extra) {
    var card = {
      id: id, deck: deck, kind: 'realestate', propType: propType,
      title: title, cost: cost, down: down, mortgage: cost - down,
      cashflow: cashflow, units: 1
    };
    if (extra) { for (var k in extra) { card[k] = extra[k]; } }
    return card;
  }

  function business(id, deck, title, cost, down, cashflow, text) {
    return {
      id: id, deck: deck, kind: 'business', propType: 'business',
      title: title, cost: cost, down: down, mortgage: cost - down,
      cashflow: cashflow, units: 1, text: text || ''
    };
  }

  var SMALL_DEALS = [
    // --- Stocks (the same symbol shows up at different prices) ---
    stock('sd01', 'HLTH', 5, 'Rumours of a new drug approval.'),
    stock('sd02', 'HLTH', 10),
    stock('sd03', 'HLTH', 20),
    stock('sd04', 'HLTH', 30, 'Analysts say it is fully priced.'),
    stock('sd05', 'GRW', 5),
    stock('sd06', 'GRW', 15),
    stock('sd07', 'GRW', 30),
    stock('sd08', 'GRW', 40, 'Everyone at work is talking about it.'),
    stock('sd09', 'BIGX', 10),
    stock('sd10', 'BIGX', 20),
    stock('sd11', 'BIGX', 40),
    stock('sd12', 'MYTV', 1, 'Penny stock. Very high risk.'),
    stock('sd13', 'MYTV', 5),
    stock('sd14', 'MYTV', 15),
    stock('sd15', 'NRGY', 5),
    stock('sd16', 'NRGY', 20),
    stock('sd17', 'NRGY', 35),
    stock('sd18', 'SAFE', 20, 'Boring, steady, and it pays you every month.'),
    stock('sd19', 'SAFE', 30),
    stock('sd20', 'SAFE', 40),
    stock('sd21', 'REIT', 20, 'A fund that owns apartment buildings.'),
    stock('sd22', 'REIT', 25),
    stock('sd23', 'REIT', 35),

    // --- Stock splits (automatic, no purchase decision) ---
    {
      id: 'sd24', deck: 'small', kind: 'split', symbol: 'HLTH', ratio: 2,
      title: 'HLTH announces a 2-for-1 stock split',
      text: 'If you own HLTH, your share count doubles. Your total value does not change - a split alone makes nobody richer.'
    },
    {
      id: 'sd25', deck: 'small', kind: 'split', symbol: 'GRW', ratio: 2,
      title: 'GRW announces a 2-for-1 stock split',
      text: 'If you own GRW, your share count doubles.'
    },
    {
      id: 'sd26', deck: 'small', kind: 'split', symbol: 'MYTV', ratio: 0.5,
      title: 'MYTV announces a 1-for-2 reverse split',
      text: 'If you own MYTV, your share count is halved (rounded down). A reverse split is usually a warning sign.'
    },

    // --- Small real estate ---
    property('sd27', 'small', 'house3_2', '3Br/2Ba House - motivated seller', 65000, 6500, 160),
    property('sd28', 'small', 'house3_2', '3Br/2Ba House - quiet street', 50000, 5000, 140),
    property('sd29', 'small', 'house3_2', '3Br/2Ba House - needs paint', 44000, 4400, 120),
    property('sd30', 'small', 'house3_2', '3Br/2Ba House - bank foreclosure', 60000, 3000, 180,
      { text: 'The bank wants it off their books and will finance 95%.' }),
    property('sd31', 'small', 'house3_2', '3Br/2Ba House - retiring landlord', 55000, 5500, 150),
    property('sd32', 'small', 'condo', '2Br/1Ba Condo - near the university', 40000, 4000, 80),
    property('sd33', 'small', 'condo', '2Br/1Ba Condo - HOA fees just rose', 30000, 3000, 40,
      { text: 'The rent is fine. The homeowners association is not.' }),
    property('sd34', 'small', 'condo', '1Br/1Ba Condo - downtown', 35000, 3500, 70),
    property('sd35', 'small', 'duplex', 'Duplex - both units rented', 45000, 4500, 100, { units: 2 }),
    property('sd36', 'small', 'duplex', 'Duplex - one unit vacant', 40000, 4000, 60,
      { units: 2, text: 'Cash flow assumes you fill the empty unit.' }),
    property('sd37', 'small', 'land', '20 acres of raw land', 5000, 5000, 0,
      { acres: 20, text: 'No income, no mortgage, no tenants. You are betting on the price.' }),
    property('sd38', 'small', 'land', '5 acres beside a new highway exit', 6000, 6000, 0,
      { acres: 5, text: 'A developer might want this one day.' }),

    // --- Small businesses ---
    business('sd39', 'small', 'Automatic car wash (limited partnership)', 5000, 5000, 100,
      'A passive share in a working car wash.'),
    business('sd40', 'small', 'Mini-storage units (limited partnership)', 5000, 5000, 150,
      'Low maintenance, steady tenants.'),
    business('sd41', 'small', 'Coffee kiosk franchise', 6000, 6000, 125,
      'The franchisor runs it. You collect a share.'),
    business('sd42', 'small', 'Vending machine route', 3000, 3000, 60,
      'Twelve machines. You restock them once a month.'),

    // --- Other instruments ---
    {
      id: 'sd43', deck: 'small', kind: 'cd', title: '6-month Certificate of Deposit',
      cost: 5000, cashflow: 25,
      text: 'Safe, liquid, and barely ahead of inflation. Useful ballast, not a way out.'
    },
    {
      id: 'sd44', deck: 'small', kind: 'gold', title: 'Rare gold coins - $500 each',
      unitPrice: 500, maxQty: 6,
      text: 'Gold pays no income. It only pays if someone later pays you more for it.'
    },
    {
      id: 'sd45', deck: 'small', kind: 'gold', title: 'Rare gold coins - $600 each',
      unitPrice: 600, maxQty: 4,
      text: 'Collectors are bidding prices up this year.'
    },

    // --- Traps: the lesson is that "no" is a legal move ---
    {
      id: 'sd46', deck: 'small', kind: 'trap', title: 'A friend asks for a $1,000 loan',
      cost: 1000,
      text: 'He is good for it. Probably. No interest, no repayment date, no paperwork.'
    },
    {
      id: 'sd47', deck: 'small', kind: 'trap', title: 'Hot tip: pre-IPO shares, $2,500 minimum',
      cost: 2500,
      text: 'Your brother-in-law says it is a sure thing and the window closes tonight.'
    },
    {
      id: 'sd48', deck: 'small', kind: 'trap', title: 'Timeshare in a ski resort',
      cost: 4000, addExpense: 50,
      text: 'Two weeks a year, plus $50 a month in maintenance fees forever. This is a liability wearing a holiday brochure.'
    }
  ];

  /* ---------------------------------------------------------------------
   * Big Deals -- larger down payments, much larger cash flow.
   * ------------------------------------------------------------------- */

  var BIG_DEALS = [
    property('bd01', 'big', 'plex', '4-plex - stable tenants', 120000, 20000, 700, { units: 4 }),
    property('bd02', 'big', 'plex', '4-plex - below market rents', 100000, 15000, 500,
      { units: 4, text: 'Rents are 20% under market. That is the opportunity.' }),
    property('bd03', 'big', 'plex', '8-plex - owner wants out', 240000, 40000, 1700, { units: 8 }),
    property('bd04', 'big', 'plex', '8-plex - needs a new roof', 200000, 30000, 1200,
      { units: 8, text: 'Priced low because of the roof.' }),
    property('bd05', 'big', 'plex', '12-plex - fully occupied', 400000, 55000, 2000, { units: 12 }),
    property('bd06', 'big', 'plex', '20-unit apartment building', 600000, 100000, 3000, { units: 20 }),
    property('bd07', 'big', 'plex', '30-unit apartment complex', 900000, 150000, 4500, { units: 30 }),
    property('bd08', 'big', 'plex', '60-unit apartment complex', 1500000, 250000, 7500, { units: 60 }),
    property('bd09', 'big', 'house3_2', 'Portfolio of 3 rental houses', 180000, 25000, 600, { units: 3 }),
    property('bd10', 'big', 'land', '100 acres of farmland', 90000, 90000, 200,
      { acres: 100, text: 'A neighbouring farmer leases it from you.' }),
    property('bd11', 'big', 'land', '40 acres in the path of development', 60000, 60000, 0,
      { acres: 40, text: 'No income. Pure speculation.' }),

    business('bd12', 'big', 'Automatic car wash - 4 bays', 175000, 35000, 1200),
    business('bd13', 'big', 'Pizza franchise', 100000, 25000, 800,
      'Proven system, absentee ownership possible.'),
    business('bd14', 'big', 'Laundromat - 24 machines', 90000, 15000, 600,
      'Coin operated. Recession resistant.'),
    business('bd15', 'big', 'Self-storage facility', 200000, 30000, 1300),
    business('bd16', 'big', 'Small office building - 6 suites', 350000, 60000, 2200),
    business('bd17', 'big', 'Warehouse leased to a distributor', 300000, 50000, 1800,
      'One tenant, ten-year lease. Great until they leave.'),
    business('bd18', 'big', 'Sandwich shop - absentee owner', 80000, 20000, 500),
    business('bd19', 'big', 'Landscaping company', 120000, 30000, 900,
      'Comes with crews, trucks and contracts.'),
    business('bd20', 'big', 'Boat slips at the marina', 250000, 45000, 1500),
    business('bd21', 'big', 'Mobile home park - 25 lots', 320000, 55000, 2100,
      'You own the dirt. The tenants own the homes.'),
    business('bd22', 'big', 'Software licence royalty', 150000, 150000, 900,
      'No debt available. Pure cash purchase.'),

    {
      id: 'bd23', deck: 'big', kind: 'trap', title: 'Restaurant with your name on it',
      cost: 60000, addExpense: 400,
      text: 'Everyone says you should open a restaurant. It loses $400 a month while you "build the brand".'
    },
    {
      id: 'bd24', deck: 'big', kind: 'trap', title: 'Exotic car "investment"',
      cost: 45000, addExpense: 300,
      text: 'It will appreciate, the seller assures you. Insurance and storage are $300 a month.'
    },
    property('bd25', 'big', 'plex', '10-plex - seller financing offered', 280000, 20000, 1100,
      { units: 10, text: 'The seller carries the paper, so the down payment is small and the debt is large.' }),
    business('bd26', 'big', 'Bed and breakfast', 400000, 80000, 2400)
  ];

  /* ---------------------------------------------------------------------
   * Doodads -- the expenses that quietly eat a paycheque.
   *
   * `perChild: true` multiplies the amount by your number of children.
   * `addExpense` adds a permanent monthly expense.
   * `optional: true` lets the player decline.
   *
   * The split between mandatory and optional is deliberate and is the whole
   * lesson of this deck. Bills you cannot avoid -- a car repair, a dentist, a
   * vet -- are real but survivable, so they stay small and compulsory. The
   * things that actually sink a household are large and discretionary, so they
   * are offered as choices. A player who says no to every luxury should be
   * able to survive bad luck; a player who says yes to all of them should not.
   * ------------------------------------------------------------------- */

  var DOODADS = [
    // --- Bills. You pay these. ---
    { id: 'dd01', title: 'Replacement phone', amount: 400, text: 'The old one went in the sink.' },
    { id: 'dd02', title: 'Dinner out with friends', amount: 200, text: 'The bill is already on the table.' },
    { id: 'dd03', title: 'New work clothes', amount: 300 },
    { id: 'dd06', title: 'Car repair - transmission', amount: 600 },
    { id: 'dd07', title: 'Dentist bill', amount: 300 },
    { id: 'dd08', title: 'Gym membership renewal', amount: 250, text: 'Paid up front. Used in January.' },
    { id: 'dd10', title: 'Wedding gift for a cousin', amount: 250 },
    { id: 'dd11', title: 'Veterinary bill', amount: 400 },
    { id: 'dd12', title: 'Tickets you already promised to buy', amount: 150 },
    { id: 'dd14', title: 'Speeding ticket', amount: 150 },
    { id: 'dd17', title: 'Emergency plumbing', amount: 350 },
    { id: 'dd18', title: 'Charity gala tickets', amount: 500 },
    { id: 'dd19', title: 'Subscription catch-up bill', amount: 180, text: 'Eleven of them. You use three.' },
    { id: 'dd26', title: 'Broken washing machine', amount: 550 },
    { id: 'dd27', title: 'Car tyres', amount: 450 },
    { id: 'dd28', title: 'Insurance excess after a small accident', amount: 500 },
    { id: 'dd21', title: 'School trip', amount: 350, perChild: true, text: 'Per child. If you have no children, no cost.' },
    { id: 'dd22', title: 'Birthday party', amount: 200, perChild: true },
    { id: 'dd23', title: 'Braces', amount: 600, perChild: true },

    // --- Choices. The expensive ones are always choices. ---
    {
      id: 'dd04', title: 'Home theatre system', amount: 1500, optional: true,
      text: 'Six speakers. You will use two. You may say no.'
    },
    {
      id: 'dd05', title: 'Holiday package', amount: 1200, optional: true,
      text: 'Everyone at work is going. You may say no.'
    },
    {
      id: 'dd09', title: 'The newest laptop', amount: 1200, optional: true,
      text: 'Yours is three years old and works. You may say no.'
    },
    {
      id: 'dd13', title: 'New furniture on sale', amount: 800, optional: true,
      text: 'A sale is only a saving if you were going to buy it anyway. You may say no.'
    },
    {
      id: 'dd15', title: 'Designer watch', amount: 2500, optional: true,
      text: 'It tells the same time as your phone. You may say no.'
    },
    {
      id: 'dd16', title: 'Golf clubs', amount: 900, optional: true,
      text: 'The clubs are not the problem with your swing. You may say no.'
    },
    {
      id: 'dd20', title: 'Holiday shopping spree', amount: 700, optional: true,
      text: 'You may say no.'
    },
    {
      id: 'dd24', title: 'New car on finance', amount: 5000, addExpense: 300, optional: true,
      text: 'A $5,000 deposit and $300 a month, forever. You may say no.'
    },
    {
      id: 'dd25', title: 'Boat on finance', amount: 3000, addExpense: 200, optional: true,
      text: 'A $3,000 deposit and $200 a month. The two happiest days of a boat owner\'s life are well documented. You may say no.'
    }
  ];

  /* ---------------------------------------------------------------------
   * Market cards.
   *
   *   buyer  - offers to buy assets of a matching type
   *   cost   - you pay, possibly scaled per property or per unit
   *   none   - flavour only, no mechanical effect
   *
   * Buyer pricing modes: flat | perUnit | perAcre | cashflowMultiple | costPlusPct
   * ------------------------------------------------------------------- */

  var MARKET = [
    {
      id: 'mk01', kind: 'buyer', title: 'Buyer for 3Br/2Ba houses',
      match: { propType: 'house3_2' }, priceMode: 'flat', amount: 75000,
      text: 'A relocating family will pay $75,000 for each 3Br/2Ba house you own.'
    },
    {
      id: 'mk02', kind: 'buyer', title: 'Buyer for 3Br/2Ba houses',
      match: { propType: 'house3_2' }, priceMode: 'flat', amount: 65000,
      text: 'An investor offers $65,000 per 3Br/2Ba house.'
    },
    {
      id: 'mk03', kind: 'buyer', title: 'Hot market for 3Br/2Ba houses',
      match: { propType: 'house3_2' }, priceMode: 'flat', amount: 90000,
      text: 'A bidding war. $90,000 per 3Br/2Ba house.'
    },
    {
      id: 'mk04', kind: 'buyer', title: 'Condo buyer',
      match: { propType: 'condo' }, priceMode: 'flat', amount: 50000,
      text: '$50,000 for each condo you own.'
    },
    {
      id: 'mk05', kind: 'buyer', title: 'Condo buyer',
      match: { propType: 'condo' }, priceMode: 'flat', amount: 42000,
      text: '$42,000 for each condo you own.'
    },
    {
      id: 'mk06', kind: 'buyer', title: 'Duplex buyer',
      match: { propType: 'duplex' }, priceMode: 'perUnit', amount: 32000,
      text: '$32,000 per unit for any duplex you own.'
    },
    {
      id: 'mk07', kind: 'buyer', title: 'Apartment buyer - small units',
      match: { propType: 'plex' }, priceMode: 'perUnit', amount: 40000,
      text: '$40,000 per unit for any apartment building you own.'
    },
    {
      id: 'mk08', kind: 'buyer', title: 'Apartment buyer - institutional',
      match: { propType: 'plex' }, priceMode: 'perUnit', amount: 55000,
      text: 'A pension fund is buying. $55,000 per unit.'
    },
    {
      id: 'mk09', kind: 'buyer', title: 'Apartment buyer - lowball',
      match: { propType: 'plex' }, priceMode: 'perUnit', amount: 28000,
      text: '$28,000 per unit. You are under no obligation to accept.'
    },
    {
      id: 'mk10', kind: 'buyer', title: 'Land developer',
      match: { propType: 'land' }, priceMode: 'perAcre', amount: 1200,
      text: '$1,200 per acre for any land you own.'
    },
    {
      id: 'mk11', kind: 'buyer', title: 'Land rezoned for housing',
      match: { propType: 'land' }, priceMode: 'perAcre', amount: 3000,
      text: 'The council rezoned. $3,000 per acre.'
    },
    {
      id: 'mk12', kind: 'buyer', title: 'Business buyer',
      match: { propType: 'business' }, priceMode: 'cashflowMultiple', amount: 40,
      text: 'A buyer offers 40 times monthly cash flow for any business you own.'
    },
    {
      id: 'mk13', kind: 'buyer', title: 'Business buyer - strategic',
      match: { propType: 'business' }, priceMode: 'cashflowMultiple', amount: 60,
      text: 'A competitor wants your customers and offers 60 times monthly cash flow.'
    },
    {
      id: 'mk14', kind: 'buyer', title: 'Buyer for any property',
      match: { any: true }, priceMode: 'costPlusPct', amount: 30,
      text: 'An out-of-town investor offers 30% above what you paid for any one property.'
    },
    {
      id: 'mk15', kind: 'buyer', title: 'Buyer for any property - quick close',
      match: { any: true }, priceMode: 'costPlusPct', amount: 15,
      text: 'Cash in seven days, but only 15% above your purchase price.'
    },
    {
      id: 'mk16', kind: 'goldbuyer', title: 'Gold hits a record high',
      unitPrice: 1200, text: 'Collectors pay $1,200 per gold coin.'
    },
    {
      id: 'mk17', kind: 'goldbuyer', title: 'Gold slumps',
      unitPrice: 400, text: 'Coin dealers offer $400 per coin. Selling is optional.'
    },
    {
      id: 'mk18', kind: 'cost', title: 'Tenant damages a unit',
      amount: 1000, scope: 'ifAnyRental',
      text: 'If you own any rental property, pay $1,000 for repairs.'
    },
    {
      id: 'mk19', kind: 'cost', title: 'Property taxes reassessed',
      amount: 200, scope: 'perProperty',
      text: 'Pay $200 for each property you own.'
    },
    {
      id: 'mk20', kind: 'cost', title: 'Shoplifting losses',
      amount: 500, scope: 'perBusiness',
      text: 'Pay $500 for each business you own.'
    },
    {
      id: 'mk21', kind: 'cost', title: 'New roof required',
      amount: 500, scope: 'perProperty',
      text: 'Pay $500 for each property you own.'
    },
    {
      id: 'mk22', kind: 'none', title: 'Interest rates hold steady',
      text: 'Nothing happens this month. Not every month is eventful.'
    },
    {
      id: 'mk23', kind: 'none', title: 'The market is quiet',
      text: 'No buyers, no sellers, no news.'
    },
    {
      id: 'mk24', kind: 'none', title: 'Everyone is talking about a crash',
      text: 'Talk is not a transaction. Nothing happens.'
    }
  ];

  /* ---------------------------------------------------------------------
   * Fast Track -- 40 squares (perimeter of an 11x11 grid).
   *
   * Investments cost cash outright and pay monthly. Dreams cost cash and pay
   * nothing; landing on YOUR dream and buying it is one of the two ways to win.
   * ------------------------------------------------------------------- */

  var DREAMS = [
    { id: 'dr01', name: 'Build a school in a village that has none', short: 'School', cost: 200000 },
    { id: 'dr02', name: 'Sail around the world', short: 'Sail', cost: 300000 },
    { id: 'dr03', name: 'A private island retreat', short: 'Island', cost: 500000 },
    { id: 'dr04', name: 'Own a professional sports team', short: 'Sports', cost: 1000000 },
    { id: 'dr05', name: 'Dinner with a head of state', short: 'Dinner', cost: 100000 },
    { id: 'dr06', name: 'A seat on a commercial spaceflight', short: 'Space', cost: 250000 },
    { id: 'dr07', name: 'Restore and race classic cars', short: 'Classics', cost: 150000 },
    { id: 'dr08', name: 'Fund a cancer research wing', short: 'Research', cost: 400000 },
    { id: 'dr09', name: 'Live in a castle in Europe', short: 'Castle', cost: 600000 },
    { id: 'dr10', name: 'Run a marathon on every continent', short: 'Marathon', cost: 120000 }
  ];

  var FT_INVESTMENTS = [
    { id: 'ft01', name: 'Bowling centres - 3 locations', short: 'Bowling', cost: 250000, cashflow: 20000 },
    { id: 'ft02', name: 'Fishing fleet', short: 'Fishing', cost: 200000, cashflow: 15000 },
    { id: 'ft03', name: 'Cattle ranch', short: 'Cattle', cost: 300000, cashflow: 22000 },
    { id: 'ft04', name: 'Gold mine', short: 'Gold', cost: 300000, cashflow: 35000 },
    { id: 'ft05', name: 'Car dealership', short: 'Dealer', cost: 350000, cashflow: 30000 },
    { id: 'ft06', name: 'Ranch - 5,000 acres', short: 'Ranch', cost: 400000, cashflow: 30000 },
    { id: 'ft07', name: 'Vineyard', short: 'Vineyard', cost: 450000, cashflow: 35000 },
    { id: 'ft08', name: 'Software company', short: 'Software', cost: 500000, cashflow: 50000 },
    { id: 'ft09', name: 'Radio network', short: 'Radio', cost: 550000, cashflow: 45000 },
    { id: 'ft10', name: 'Coffee franchise - 50 stores', short: 'Coffee', cost: 600000, cashflow: 55000 },
    { id: 'ft11', name: 'Storage portfolio', short: 'Storage', cost: 700000, cashflow: 65000 },
    { id: 'ft12', name: 'Beachfront resort', short: 'Resort', cost: 750000, cashflow: 60000 },
    { id: 'ft13', name: 'Wind farm', short: 'Wind', cost: 800000, cashflow: 70000 },
    { id: 'ft14', name: 'TV station', short: 'TV', cost: 900000, cashflow: 80000 },
    { id: 'ft15', name: 'Boutique hotel', short: 'Hotel', cost: 950000, cashflow: 85000 },
    { id: 'ft16', name: 'Apartment complex - 300 units', short: 'Apts', cost: 1000000, cashflow: 90000 },
    { id: 'ft17', name: 'Shopping mall', short: 'Mall', cost: 1200000, cashflow: 100000 },
    { id: 'ft18', name: 'Data centre', short: 'Data', cost: 1500000, cashflow: 130000 }
  ];

  var FT_SETBACKS = [
    { setback: 'lawsuit', label: 'Lawsuit', text: 'A lawsuit is settled against you. Lose half your cash. Your investments are untouched.' },
    { setback: 'audit', label: 'Tax audit', text: 'The audit did not go your way. Lose half your cash. Your investments are untouched.' },
    { setback: 'divorce', label: 'Divorce', text: 'Divorce. Lose all your cash. Your investments are untouched.' },
    { setback: 'charity', label: 'Charity', text: 'You may donate 10% of your Cash Flow Day income.' }
  ];

  /* 40 squares (the perimeter of an 11x11 grid).
   *
   * The layout is built from a fixed 20-square pattern repeated twice, chosen
   * so that the counts come out exactly right: 8 Cash Flow Days, 18 distinct
   * investments, all 10 dreams, and 4 setbacks. Every dream a player can
   * choose at setup is guaranteed to be somewhere on the board -- otherwise a
   * player could pick a dream they can never land on and could only win by
   * cash flow. */
  var FAST_TRACK_BOARD = (function () {
    var pattern = [
      'CASHFLOW_DAY', 'INVESTMENT', 'DREAM', 'INVESTMENT', 'INVESTMENT',
      'CASHFLOW_DAY', 'DREAM', 'INVESTMENT', 'SETBACK', 'INVESTMENT',
      'CASHFLOW_DAY', 'INVESTMENT', 'DREAM', 'INVESTMENT', 'INVESTMENT',
      'CASHFLOW_DAY', 'DREAM', 'INVESTMENT', 'SETBACK', 'DREAM'
    ];
    var board = [];
    var inv = 0, dream = 0, sb = 0;
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < pattern.length; i++) {
        var type = pattern[i];
        if (type === 'CASHFLOW_DAY') {
          board.push({ type: type, label: 'Cash Flow Day' });
        } else if (type === 'INVESTMENT') {
          board.push({ type: type, investment: FT_INVESTMENTS[inv++ % FT_INVESTMENTS.length].id });
        } else if (type === 'DREAM') {
          board.push({ type: type, dream: DREAMS[dream++ % DREAMS.length].id });
        } else {
          var s = FT_SETBACKS[sb++ % FT_SETBACKS.length];
          board.push({ type: 'SETBACK', setback: s.setback, label: s.label, text: s.text });
        }
      }
    }
    return board;
  })();

  global.CF = global.CF || {};
  global.CF.data = {
    RAT_RACE_BOARD: RAT_RACE_BOARD,
    FAST_TRACK_BOARD: FAST_TRACK_BOARD,
    PROFESSIONS: PROFESSIONS,
    SMALL_DEALS: SMALL_DEALS,
    BIG_DEALS: BIG_DEALS,
    DOODADS: DOODADS,
    MARKET: MARKET,
    DREAMS: DREAMS,
    FT_INVESTMENTS: FT_INVESTMENTS,
    STOCK_SYMBOLS: STOCK_SYMBOLS
  };
})(typeof window !== 'undefined' ? window : globalThis);
