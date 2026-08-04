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

Plus **Undo** (60 steps), **autosave** to the browser on every action, and
**Export/Import** to a JSON file you can attach to a bug report. There is no Save
button, because a manual save is a trap: you press it at month 20, keep playing to
month 50, close the tab, and lose thirty months of decisions without being told.

---

## What the interface has to do

The engine adjudicates. The interface has to *teach*, and that is a different job.

**It states facts and lets the player judge.** This is the rule everything else
answers to. An earlier version put the primary button on whichever option it thought
was correct and made fun of the other one — "it tells the same time as your phone",
"money out, nothing coming back". That teaches compliance, not judgement: a player who
is steered to the right answer has not learned to find it, and a game that has already
decided has nothing left to teach. So:

- Where a card offers a genuine choice, **every option gets identical visual weight**.
  Nothing is green because the designer approves of it. A button is only emphasised when
  there is exactly one thing to do — Pay, Roll, Continue.
- Cards **report figures, not verdicts**: cost, cash before, cash after, the effect on
  monthly expenses and cash flow. A stock says how far up its range the price sits; it
  does not say whether that is a good moment to buy.
- Card copy **describes what is on offer** and stops. No sarcasm about the buyer, no
  warnings about what a sensible person would do.
- Disabling a control is still allowed, because "you cannot afford this" is a fact.
  Recommending against something you *can* afford is not.

The player still has everything needed to reason: the win condition is stated plainly,
every number that moves is shown moving, and the board explains its own squares. What
they do not get is the answer.

**Every turn produces a receipt.** Roughly half the squares resolve with no decision to
make — payday pays you, a baby arrives, the market ignores you. Those turns used to end
with your money changed and nothing on screen to say why, which is bad teaching and
indistinguishable from a bug. Now the turn is replayed back to you: what moved, in which
direction, and what it did to your passive income. When a forced sale cascades, you see
the whole cascade rather than a number that quietly got smaller.

**The number that wins is the number that's biggest.** Passive income against total
expenses, side by side, in the statement and in the middle of the board. Monthly cash
flow used to have both of those slots — and a player optimising the biggest thing on
screen would have been optimising the wrong one, because cash flow goes *up* when you
sell the assets that were going to free you.

**Quantities are offered, not typed.** A stock card gives you `Max 314 / 157 / 100 / 50
/ 10` for buying and `All 240 / 120 / 10 / 1` for selling, each labelled with what it
costs. A single shared number box used to serve Buy, Sell and Sell-all, defaulting to
10 — so its answer to a $5 share you could buy 314 of was "buy $50 worth."

**Refusing is never the quiet option.** On any card where saying no is the lesson — a
luxury expense, a trap deal, a market buyer — "No thanks" is the primary button and the
card says outright that refusing costs nothing. Declines are logged and totalled, so
discipline leaves a visible trace.

**Controls appear when they are relevant.** The Loans panel is a two-line status until
you ask for it, and taking a loan happens in its own dialog that shows what the loan
does to your cash flow *before* you commit. It used to be a number field pre-filled with
`1000` sitting on screen every turn of the game, next to a Repay button whose only
possible outcome was an error.

**The board explains itself.** Tap any square to find out what it does. A phone has no
hover, so the tooltip the board relied on reached nobody, and the only documentation
link in the player-facing UI used to point at the developer test suite.

**Errors appear where they happened.** Inside the card that produced them, not in a
banner at the top of the document that erases itself after five seconds while you are
three screens further down.

---

## Running the tests

- **In a browser:** open `tests.html`.
- **From a terminal:** `node run-tests.js`

50 tests, no framework, about nine seconds. The last two matter most:

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
| **Expense** | An unplanned cost. Bills are shown to you and you press Pay; anything expensive is a want you can refuse for free. |
| **Market** | A buyer appears for a type of asset, or a cost lands on the assets you own. |
| **Charity** | Donate 10% of total income and for the next 3 turns you may roll one die or two. |
| **Baby** | A child, up to three. Each adds your profession's per-child cost every month. |
| **Downsized** | Pay one month of total expenses and lose your next 2 turns. |

You leave the Rat Race the moment **passive income exceeds total expenses**. Equal is
not enough; one dollar over is.

### Debt

**Nothing is ever borrowed on your behalf.** Buying is cash only: if you cannot cover
the down payment, Buy is disabled and a *Take a loan…* button appears next to it. The
loan dialog states what the loan will do to your monthly cash flow before you confirm
it. An earlier version quietly financed any shortfall when you pressed Buy, which meant
one tap could create tens of thousands of dollars of debt at 120% a year — in a game
whose whole lesson is that borrowing to buy is how people get trapped. Removing that
raised the proportion of *randomly played* games that escape the Rat Race from 29 in
2,000 to 567 in 2,000, without changing a competent player's results at all.

Loans come in $1,000 blocks at $100 a month each — 120% a year, deliberately the worst
deal in the game, and interest-only: the payment never ends until you repay the
principal. Total borrowing is capped at **10 months of total income**.

That cap is the single most important rule a naive implementation gets wrong. Without
it, a player whose expenses exceed their income borrows to make payday, which raises
their expenses, which makes the next payday worse. The debt compounds until the numbers
exceed what a computer can represent exactly and the financial statement quietly stops
adding up. With the cap, that becomes a real outcome rather than silent corruption.

**Repaying, and what can be part-paid.** Every debt has its own Repay button beside it
in the Liabilities list, because retiring a debt removes its monthly payment for the
rest of the game — the cheapest, most certain way to lower the bar you are trying to
clear. The two kinds behave differently, and deliberately so:

| Debt | How you repay it |
| --- | --- |
| Loans | **Part-payable**, in $1,000 blocks. Each block clears $100/month. |
| Home mortgage, school loan, car loan, credit cards, retail | **All or nothing.** Clear the whole balance and the whole payment goes with it. |

That split is not a simplification — it is how the original game works, and the engine
enforces it structurally: `repayLiability` takes no amount parameter, so a consumer debt
*cannot* be part-paid, while `repay` handles loans in blocks.

### When you cannot pay

1. Cash first.
2. Then an automatic loan, up to your borrowing limit — this is the one place the
   game borrows for you, because a bill you cannot refuse has to be settled somehow.
3. Then a **forced sale**: the game sells your least productive holdings until the bill
   is covered. Shares, gold and certificates come back at cost; property in a hurry
   goes for **80% of what you paid**, and cannot be sold at all for less than its own
   mortgage.
4. If there is still nothing left, you are **bankrupt** and the game ends.

Steps 1–2 are standard. Step 3 is the table rule ("if you cannot pay, sell assets")
automated, because a solo player facing a bill they cannot cover has no real choice to
make — so the game makes it, and says exactly what it sold and why.

### Expenses: which ones you can refuse

Every card in this deck falls into one of two groups, and the card says which on its face.

(The source calls this deck `DOODADS`, after the Rich Dad term. The word never reaches
the player: the square is called Expense and the cards talk about what the thing is.)

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
them means the money you lose to expenses is money **you chose to spend**, which is the
thing worth learning. It also matters mechanically: before the split, a single large
compulsory hit early could put a low-income profession into a debt spiral it could
never escape, through no decision of its own. Bankruptcy among competent players fell
from 9% to under 2% when the expensive expenses became choices.

Every one of them is also *shown*, and you press Pay yourself. Before, a compulsory one
silently subtracted the money and moved on, which is both bad teaching and
indistinguishable from a bug.

### The Fast Track (40 squares, two dice)

Your Cash Flow Day income is your Rat Race passive income × 100, and you start with the
same amount again in cash. There is no borrowing here; investments are bought outright.
Win by **buying your own dream** when you land on it, or by **doubling the monthly
income you arrived with** — you must add at least as much again, with a floor of
$50,000. A flat target does not hold up: a player who escapes on $350,000 a month
clears a fixed $50,000 with one purchase, while a player who escapes on $10,000 has to
work for it. Scaling asks the same effort of everyone. (My recollection is that the
printed rule is a flat $50,000; this is a deliberate change, and it is one function,
`fastTrackGoal`, if you want the original back.) Lawsuits and audits cost half your cash; divorce costs all of
it; none of them touch your investments.

---

## Languages

English and French, chosen from the browser's language and overridable with the
selector in the header. The choice is remembered.

**The English string is the key.** `t('Roll {n} dice', {n: 2})` looks the English up in
the active dictionary and falls back to the English itself when there is no entry.
Adding a language is therefore purely additive — nothing breaks while it is half done,
and the source stays readable because you can see what a line says without a lookup.
The cost is that changing an English phrase orphans its translation, which is why
`CF.i18n.missingTranslations()` exists: call it in the browser console and it lists
every phrase the active language has not covered, including card text by id. That
report is how the French was finished, and it currently returns empty.

**Engine log lines keep their key and their raw numbers**, not a finished sentence. A
game saved in French therefore reads in English if you switch, and past turns
re-render rather than being stranded in the language they happened in.

**Money follows the locale**: `$1,000` in English, `1 000 $` in French — symbol after
the number, space as the group separator. It is the first thing a French speaker
notices and the easiest thing to get wrong.

To add a language, copy `js/lang-fr.js`, translate the `ui` map (interface and engine
lines) and the `content` map (166 cards, professions, dreams and investments, by id),
and add the code to `SUPPORTED` in `js/i18n.js`. No other file needs to change.

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
- **Tap any board square** for an explanation — the only documentation a touch device
  can actually reach, since there is no hover.
- Export/Import are hidden on phones, where a file picker is more trouble than it is
  worth; the game autosaves anyway.

---

## Design decisions worth arguing about

These are places where I chose, and where the Rich Dad team may well choose otherwise.
Each one is a single value or block in the code.

| Decision | Where | Why |
| --- | --- | --- |
| Purchases are cash only | `buyDeal`, `engine.js` | A Buy button must never create debt. See "Debt" above. |
| Credit capped at 10× income | `CREDIT_MULTIPLE`, `engine.js` | Prevents an unrecoverable, arithmetic-breaking debt spiral. |
| Forced sales are automatic | `liquidateFor()`, `engine.js` | Removes a decision that isn't really a decision; keeps the turn flow unbreakable. |
| Distressed property sells at 80% | `DISTRESS_FACTOR`, `engine.js` | Teaches that liquidity has a price. |
| Every expense over $700 is refusable | `optional: true`, `data.js` | See "Expenses" above. A test enforces the ceiling so the deck cannot drift back. |
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
js/tests.js       50 tests plus the random and competent simulated players
```

To translate the game or swap in different cards, `js/data.js` is the only file you
need to touch. To change a rule, `js/engine.js` is the only file you need to touch, and
`run-tests.js` will tell you what you broke.
