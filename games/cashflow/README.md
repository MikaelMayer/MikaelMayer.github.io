# CASHFLOW Solo

A single-player, offline, dependency-free financial-education game in the spirit of
cash-flow board games. Build passive income greater than your monthly expenses, get
out of the Rat Race, then win the Fast Track.

**Open `index.html` in any browser.** That is the whole install. No server, no build
step, no network calls, no tracking, no accounts. It works from a USB stick.

---

## Why this exists

The online CASHFLOW Classic is a great teaching tool with a rough implementation. This
is an independent rewrite of the same *ideas* with the failure modes designed out. It
is not affiliated with or endorsed by the Rich Dad Company, and it contains none of
their text, art, or card data — every profession, card and number here was written
fresh for this project.

If the Rich Dad team wants to use it, the code is deliberately structured so that the
rules (`js/engine.js`) and the content (`js/data.js`) can be changed independently, and
their own official card and profession data can be dropped into `js/data.js` without
touching a line of game logic.

---

## How it is built so it doesn't break

Five decisions do most of the work:

**1. One state object, no hidden state.** The entire game is a single plain-JSON
object. No DOM state, no timers, no module-level variables holding half a turn. That is
what makes save, load, export and undo all one line each, and it is why there is no
"the board says one thing and the sheet says another" class of bug.

**2. Every random event goes through a seeded generator.** Type a seed and the game
plays out identically every time, on every machine. A bug report is a seed and a turn
number, and anyone can reproduce it exactly. Teachers can also hand a class the same
seed so everyone faces the same decisions.

**3. Money is integer dollars, and derived numbers are never cached.** Income,
expenses and cash flow are recomputed from your assets on every read rather than
patched incrementally. Incremental bookkeeping is exactly where financial simulations
silently drift out of balance.

**4. Exactly one thing can be waiting for you.** `state.pending` is either `null` — in
which case you may roll — or it describes the single decision in front of you and the
only moves that are legal. There is no path where the board is waiting for an input
that no button offers. Illegal actions are refused with an explanation and change
nothing; they never leave a half-applied turn behind.

**5. The game audits itself after every action.** `checkInvariants()` re-verifies the
whole financial statement — cash never negative, expense lines summing to the total,
decks conserving their cards, no fractional shares, no numbers running away. If the
engine ever contradicts itself, a red banner says so with the seed, instead of quietly
paying you the wrong salary for the next hour.

Plus **Undo** (60 steps), **Save/Load** to the browser, and **Export/Import** to a JSON
file you can attach to a bug report.

---

## Running the tests

- **In a browser:** open `tests.html`.
- **From a terminal:** `node run-tests.js`

47 tests, no framework, about nine seconds. The last two matter most:

- **2,000 random games.** A random agent plays complete games, and the invariant check
  must pass after *every single action*. This is what catches stuck boards, undefined
  cards and accounting drift before a player ever sees them. It does not assert that
  the random player wins — a player who accepts three deals in four and borrows to the
  limit is supposed to go broke.
- **600 games played competently.** A deliberately simple strategy — clear expensive
  debt, buy cash-flowing assets you can pay for outright, buy shares low and sell high,
  decline luxuries. It must escape the Rat Race in over 90% of games with a median
  around 100 months, and must still go bankrupt occasionally. If either number drifts,
  the economy changed even though every rule still passes.

---

## Rules as implemented

### The Rat Race (24 squares, one die)

| Square | What happens |
| --- | --- |
| **Opportunity** | Choose a Small Deal or a Big Deal. Looking is always free; you may decline anything. |
| **PAYDAY** | Collect your monthly cash flow. Collected on passing as well as on landing — three per lap. |
| **Doodad** | An expense. Bills are paid and shown to you; every luxury is a choice you can refuse. |
| **Market** | A buyer appears for a type of asset, or a cost lands on the assets you own. |
| **Charity** | Donate 10% of total income and for the next 3 turns you may roll one die or two. |
| **Baby** | A child, up to three. Each adds your profession's per-child cost every month. |
| **Downsized** | Pay one month of total expenses and lose your next 2 turns. |

You leave the Rat Race the moment **passive income exceeds total expenses**. Equal is
not enough; one dollar over is.

### The bank

Loans come in $1,000 blocks at $100 a month each — 120% a year, deliberately the worst
deal in the game. Total borrowing is capped at **10 months of total income**.

That cap is the single most important rule that a naive implementation gets wrong.
Without it, a player whose expenses exceed their income borrows to make payday, which
raises their expenses, which makes the next payday worse. The debt compounds until the
numbers exceed what a computer can represent exactly and the financial statement
quietly stops adding up. With the cap, that becomes a real outcome rather than silent
corruption.

### When you cannot pay

1. Cash first.
2. Then the bank, up to your credit limit.
3. Then a **forced sale**: the game sells your least productive holdings until the bill
   is covered. Shares, gold and certificates come back at cost; property in a hurry
   goes for **80% of what you paid**, and cannot be sold at all for less than its own
   mortgage.
4. If there is still nothing left, you are **bankrupt** and the game ends.

Steps 1–2 are standard. Step 3 is the table rule ("if you cannot pay, sell assets")
automated, because a solo player facing a bill they cannot cover has no real choice to
make — so the game makes it, and says exactly what it sold and why.

### Doodads: which ones you can refuse

Every doodad falls into one of two groups, and the card says which on its face.

**Bills** — car repair, dentist, vet, plumbing, tyres, an insurance excess, braces.
These are paid, and the card that appears is a receipt: *"Bill — already paid."* You
tap Continue. They are all $700 or less, and a test enforces that ceiling so the deck
cannot quietly drift back toward ruinous compulsory spending.

**Choices** — the designer watch, the home theatre, the holiday, the newest laptop,
the golf clubs, the car and the boat on finance. These are headed *"Your choice — you
may refuse this"*, **No thanks** is the primary button, and the card says outright that
refusing costs nothing.

This split is the point of the square. If everything were compulsory, the lesson would
be "bad luck happens" — which is true but not useful. If everything were refusable, a
rational player would decline all of it and the square would be decoration. Splitting
them means the money you lose to doodads is money **you chose to spend**, which is the
thing worth learning. It also matters mechanically: before the split, a single large
compulsory hit early could put a low-income profession into a debt spiral it could
never escape, through no decision of its own. Bankruptcy among competent players fell
from 9% to under 2% when the expensive doodads became choices.

Every doodad is also now *shown*. Before, a compulsory one silently subtracted the
money and moved on, which is both bad teaching and indistinguishable from a bug.

### The Fast Track (40 squares, two dice)

Your Cash Flow Day income is your Rat Race passive income × 100, and you start with the
same amount again in cash. There is no borrowing here; investments are bought outright.
Win by **buying your own dream** when you land on it, or by adding **$50,000 a month**
of new investment income. Lawsuits and audits cost half your cash; divorce costs all of
it; none of them touch your investments.

---

## On a phone

The game is built to be played on a phone, not merely to survive on one.

- **One column below 820px**, two on a tablet, three on a desktop — board, the decision
  you are making, and the numbers that decision changes.
- **The board is capped against viewport height**, not just column width, so the board
  and the Roll button are always on screen together. No hunting for the button.
- **Squares carry two labels** and CSS picks the one that fits. The Fast Track always
  uses short names — 40 squares means small cells at any size — and the full name is on
  the card when you land, and in the tooltip.
- **Cards stack one action per row** at phone width, so Buy and Pass cannot be mis-tapped.
- **44px minimum touch targets** and **16px inputs** on touch devices, the latter because
  anything smaller makes iOS Safari zoom the whole page on focus.
- **A new card scrolls itself into view** if it lands below the fold — but only when the
  decision actually changes, so the page never moves under someone who is deliberately
  reading their financial statement.
- **Nothing scrolls sideways** at any width down to 320px, and layout respects notch
  safe-area insets.
- Export/Import are hidden on phones, where a file picker is more trouble than it is
  worth; Save/Load cover the same ground.

---

## Design decisions worth arguing about

These are places where I chose, and where the Rich Dad team may well choose otherwise.
Each one is a single value or block in the code.

| Decision | Where | Why |
| --- | --- | --- |
| Credit capped at 10× income | `CREDIT_MULTIPLE`, `engine.js` | Prevents an unrecoverable, arithmetic-breaking debt spiral. |
| Forced sales are automatic | `liquidateFor()`, `engine.js` | Removes a decision that isn't really a decision; keeps the turn flow unbreakable. |
| Distressed property sells at 80% | `DISTRESS_FACTOR`, `engine.js` | Teaches that liquidity has a price. |
| Every doodad over $700 is refusable | `optional: true`, `data.js` | See "Doodads" below. A test enforces this rule so the deck cannot drift back. |
| Rat Race cash carries over | `enterFastTrack()`, `engine.js` | Deleting a player's hard-won savings reads as a bug even when it is a rule. |
| Bankruptcy is possible | `bankrupt()`, `engine.js` | Risk that cannot bite is not a lesson. Undo is always available. |

---

## Files

```
index.html        the game
tests.html        the test suite, in a browser
run-tests.js      the test suite, in Node
css/style.css     all styling; light and dark, responsive to one column
js/rng.js         seeded random number generator
js/data.js        professions, dreams, boards, all four card decks — content only
js/engine.js      every rule; pure functions over one state object; no DOM
js/ui.js          rendering and input; no rules
js/tests.js       47 tests plus the random and competent simulated players
```

To translate the game or swap in different cards, `js/data.js` is the only file you
need to touch. To change a rule, `js/engine.js` is the only file you need to touch, and
`run-tests.js` will tell you what you broke.
