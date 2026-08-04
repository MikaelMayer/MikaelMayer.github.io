/* French. Keys are the English strings; see js/i18n.js.
 *
 * `ui` covers the interface and every engine log line. `content` translates
 * card decks, professions, dreams and Fast Track investments by their id.
 * Anything missing simply appears in English -- call
 * CF.i18n.missingTranslations() in the console to list the gaps.
 */
(function (global) {
  'use strict';
  var CF = global.CF = global.CF || {};
  CF.lang = CF.lang || {};

  CF.lang.fr = {
    ui: {
      /* ---- shell ---- */
      "Your move": "À vous de jouer",
      "You are out of work": "Vous êtes sans emploi",
      "Dream bought in {months} months.": "Rêve acheté en {months} mois.",
      "Fast Track income goal reached in {months} months.": "Objectif de revenus de la voie rapide atteint en {months} mois.",
      "Monthly income": "Revenus mensuels",
      "Monthly expenses": "Dépenses mensuelles",
      "Total income minus total expenses. This is what each PAYDAY pays you.": "Revenus totaux moins dépenses totales. C’est ce que verse chaque JOUR DE PAIE.",
      "your {$total} of monthly expenses": "vos {$total} de dépenses mensuelles",
      "{pct}%/yr": "{pct}%/an",
      "a year": "par an",
      "What the money you actually put in earns you in a year, ignoring the part the mortgage pays for.": "Ce que rapporte en un an l’argent que vous avez réellement engagé, sans compter la part financée par l’emprunt.",
      "Monthly cash flow x 12 / down payment: {$cf} x 12 / {$down} = {pct}% a year.": "Flux mensuel x 12 / apport : {$cf} x 12 / {$down} = {pct} % par an.",
      "It says nothing about whether the price is fair, or what the property might later sell for.": "Cela ne dit rien sur le caractère juste du prix, ni sur ce que le bien pourrait valoir à la revente.",
      "Deducted from your salary every month. It does not change as you play and cannot be removed.": "Prélevés sur votre salaire chaque mois. Ils ne varient pas au cours de la partie et ne peuvent pas être supprimés.",
      "Day-to-day living costs, plus the monthly cost of anything you accepted that carried one. Living costs cannot be removed.": "Frais de vie courante, plus le coût mensuel de tout ce que vous avez accepté qui en comportait un. Les frais de vie courante ne peuvent pas être supprimés.",
      "Each child costs {$each} a month for the rest of the game. This cannot be removed.": "Chaque enfant coûte {$each} par mois jusqu’à la fin de la partie. Cela ne peut pas être supprimé.",
      "Interest on money you have borrowed: {$per} a month for every {$unit}.": "Intérêts sur l’argent emprunté : {$per} par mois pour chaque {$unit}.",
      "Repay the principal from the Liabilities list below. Every {$unit} you repay removes {$per} a month.": "Remboursez le capital depuis la liste des passifs ci-dessous. Chaque {$unit} remboursé retire {$per} par mois.",
      "You currently owe {$owed}.": "Vous devez actuellement {$owed}.",
      "The monthly payment on this debt. The balance is {$balance}, so the payment is costing you about {pct}% a year.": "La mensualité de cette dette. Le solde est de {$balance} : la mensualité vous coûte donc environ {pct} % par an.",
      "Pay the {$balance} off in full from the Liabilities list below and this line disappears for the rest of the game. Debts cannot be part-paid.": "Soldez les {$balance} en totalité depuis la liste des passifs ci-dessous et cette ligne disparaît pour le reste de la partie. Les dettes ne se remboursent pas partiellement.",
      "It is part of the {$total} you must cover every month.": "Elle fait partie des {$total} que vous devez couvrir chaque mois.",
      "Month": "Mois",
      "Financial term": "Terme financier",
      "What does this mean?": "Qu’est-ce que cela veut dire ?",
      "financial freedom": "l’indépendance financière",
      "{$gap} until financial freedom": "{$gap} jusqu’à l’indépendance financière",
      "You are financially free": "Vous êtes financièrement indépendant",
      "Money that arrives whether or not you go to work: rent from property, dividends from shares, interest, and profit from businesses you own. Your salary is not passive income. When this figure passes your total expenses, you are out of the Rat Race.": "De l’argent qui rentre que vous alliez travailler ou non : loyers, dividendes, intérêts et bénéfices des entreprises que vous possédez. Votre salaire n’est pas un revenu passif. Dès que ce chiffre dépasse vos dépenses totales, vous sortez de la course des rats.",
      "Everything you must pay every month: taxes, the payment on each debt, living costs, the cost of any children, and interest on loans you have taken. Clearing a debt in full removes its payment from this figure permanently.": "Tout ce que vous devez payer chaque mois : impôts, mensualité de chaque dette, frais de vie courante, coût des enfants et intérêts des emprunts. Solder une dette en totalité retire définitivement sa mensualité de ce total.",
      "Money on hand. You buy with it and bills come out of it. It is not income: a large cash balance does not by itself bring you any closer to leaving the Rat Race.": "L’argent disponible. Vous achetez avec, et les factures en sortent. Ce n’est pas un revenu : un gros solde ne vous rapproche pas en soi de la sortie de la course des rats.",
      "Total income minus total expenses. This is the amount you collect each time you pass a PAYDAY square. It includes your salary, which is why it is not the figure that ends the Rat Race.": "Revenus totaux moins dépenses totales. C’est ce que vous encaissez à chaque passage sur une case JOUR DE PAIE. Il inclut votre salaire, et ce n’est donc pas le chiffre qui met fin à la course des rats.",
      "Your salary plus your passive income.": "Votre salaire plus vos revenus passifs.",
      "What your profession pays each month. It stops if you stop working, so it does not count towards leaving the Rat Race.": "Ce que votre profession vous verse chaque mois. Il s’arrête si vous cessez de travailler : il ne compte donc pas pour sortir de la course des rats.",
      "Monthly income from shares that pay a dividend, and from certificates of deposit.": "Revenu mensuel des actions à dividende et des dépôts à terme.",
      "The combined monthly cash flow of the properties you own, after their mortgage payments are deducted.": "Le flux mensuel cumulé des biens que vous possédez, après déduction de leurs mensualités d’emprunt.",
      "The combined monthly income of the businesses you own.": "Le revenu mensuel cumulé des entreprises que vous possédez.",
      "What you own. Some of it pays you every month; some of it pays nothing until you sell it for more than you paid.": "Ce que vous possédez. Une partie vous rapporte chaque mois ; une autre ne rapporte rien tant que vous ne l’avez pas revendue plus cher.",
      "What you owe. Each one has a matching monthly payment in the Expenses list. Paying a debt off in full removes that payment for the rest of the game.": "Ce que vous devez. Chaque ligne a une mensualité correspondante dans les dépenses. Solder une dette en totalité supprime cette mensualité pour le reste de la partie.",
      "Money you have borrowed. Every $1,000 costs $100 a month, every month, until you repay the principal.": "L’argent que vous avez emprunté. Chaque 1 000 € coûte 100 € par mois, tous les mois, jusqu’au remboursement du capital.",
      "Deducted from your salary every month. It does not change as you play.": "Prélevés sur votre salaire chaque mois. Ils ne varient pas au cours de la partie.",
      "What you collect each time you pass or land on a Cash Flow Day square: the income you carried out of the Rat Race, plus anything the investments you have bought here produce.": "Ce que vous encaissez à chaque passage ou arrêt sur une case Jour de paie : le revenu emporté en sortant de la course des rats, plus ce que rapportent les investissements achetés ici.",
      "{$amount} / share / month": "{$amount} / action / mois",
      "{n} shares": "{n} actions",
      "{n} shares (paid {$paid})": "{n} actions (payées {$paid})",
      "{n} shares, paid {$paid}": "{n} actions, payées {$paid}",
      "{n} coins": "{n} pièces",
      "{n} coins, paid {$paid}": "{n} pièces, payées {$paid}",
      "{n} {unit} at {$price}": "{n} {unit} à {$price}",
      "Buy {n} {unit}": "Acheter {n} {unit}",
      "Sell {n} {unit}": "Vendre {n} {unit}",
      "share": "action",
      "shares": "actions",
      "coin": "pièce",
      "coins": "pièces",
      "All": "Tout",
      "Max": "Max",
      "cash": "en liquidités",
      "gain {$gain} vs the {$paid} you paid": "plus-value de {$gain} sur les {$paid} payés",
      "loss {$gain} vs the {$paid} you paid": "moins-value de {$gain} sur les {$paid} payés",
      "{$cost}, {$owed} owed": "{$cost}, {$owed} dus",
      "{$cost}, owned outright": "{$cost}, détenu sans dette",
      "{$cost} in cash buys {$cf} a month.": "{$cost} comptant rapportent {$cf} par mois.",
      "This is the dream you chose. Buy it for {$cost} and you win.": "C’est le rêve que vous avez choisi. Achetez-le pour {$cost} et vous gagnez.",
      "Your dream: {name}": "Votre rêve : {name}",
      "You lost your job": "Vous avez perdu votre emploi",
      "Donate 10% of your total income ({$amount}) and for the next 3 turns you may roll one die or two. More choices, more opportunities.": "Donnez 10 % de vos revenus totaux ({$amount}) et, pendant les 3 prochains tours, vous pourrez lancer un ou deux dés. Plus de choix, plus d’occasions.",
      "Month {n}.": "Mois {n}.",
      "result": "résultat",
      "−{$amount}/mo income": "−{$amount}/mois de revenu",
      "Or add {$goal} a month of new investment income.": "Ou ajoutez {$goal} par mois de nouveaux revenus d’investissement.",
      "or land on ★ {name} and pay {$cost}": "ou arrêtez-vous sur ★ {name} et payez {$cost}",
      "New investment income {$have} of {$goal}": "Nouveaux revenus d’investissement {$have} sur {$goal}",
      "Out of work: {n} turn lost": "Sans emploi : {n} tour perdu",
      "Out of work: {n} turns lost": "Sans emploi : {n} tours perdus",
      "Loans {$amount}": "Emprunts {$amount}",
      "Bankrupt in {months} months": "En faillite au bout de {months} mois",
      "You could not pay for {reason}, and there was nothing left to sell or borrow against. Use Undo to go back and take a different turn, or start again.": "Vous ne pouviez pas payer {reason}, et il ne restait rien à vendre ni à nantir. Utilisez Annuler pour revenir en arrière, ou recommencez.",
      "CASHFLOW Solo": "CASHFLOW Solo",
      "Expense": "Dépense",
      "Deal": "Affaire",
      "Market": "Marché",
      "Baby": "Enfant",
      "Downsized": "Licencié",
      "Job loss": "Sans emploi",
      "Dice choice: this turn and {n} more": "Choix du dé : ce tour et {n} de plus",
      "Seed — leave blank for random": "Graine — laissez vide pour aléatoire",
      "Your dream (the Fast Track goal)": "Votre rêve (l’objectif de la voie rapide)",
      "One goal: build passive income greater than your monthly expenses. Do it in as few months as you can.": "Un seul but : bâtir des revenus passifs supérieurs à vos dépenses mensuelles. En le moins de mois possible.",
      "The same seed with the same choices always plays out identically — useful for teaching a specific scenario, or for reporting a bug that someone else can reproduce.": "La même graine avec les mêmes choix se déroule toujours à l’identique — utile pour enseigner un scénario précis ou pour signaler un bogue reproductible.",
      "You are trying to build passive income — money that arrives whether or not you go to work — until it is greater than your total monthly expenses. The moment it is, you are out of the Rat Race. Do it in as few months as you can.": "Vous cherchez à bâtir des revenus passifs — de l’argent qui rentre que vous alliez travailler ou non — jusqu’à ce qu’ils dépassent vos dépenses mensuelles totales. À cet instant, vous sortez de la course des rats. Faites-le en le moins de mois possible.",
      "A salary is not passive income. Neither is a lump sum from selling something. Only rent, dividends, interest and business profit count, which is why selling a property for a good price can still move you backwards.": "Un salaire n’est pas un revenu passif. Une somme touchée en vendant quelque chose non plus. Seuls comptent les loyers, les dividendes, les intérêts et les bénéfices d’entreprise — c’est pourquoi vendre un bien à bon prix peut malgré tout vous faire reculer.",
      "Roll, move, and resolve the square you land on. Tap any square on the board to see what it does. You may always look at a deal and then decline it, and you may always refuse a purchase.": "Lancez, avancez, puis résolvez la case où vous vous arrêtez. Touchez n’importe quelle case du plateau pour savoir ce qu’elle fait. Vous pouvez toujours regarder une affaire puis la refuser, et toujours refuser un achat.",
      "Once your passive income passes your expenses you leave the Rat Race for the Fast Track, where you win by landing on your own dream and buying it, or by doubling the monthly income you arrived with.": "Dès que vos revenus passifs dépassent vos dépenses, vous quittez la course des rats pour la voie rapide, où l’on gagne en s’arrêtant sur son propre rêve et en l’achetant, ou en doublant le revenu mensuel avec lequel on est arrivé.",
      "You can take a loan in $1,000 blocks at $100 a month each — 120% a year, interest only. That interest is an expense like any other, so every loan raises the bar you are trying to clear. Nothing is ever borrowed on your behalf: taking a loan is always your own deliberate choice, and you repay it from the Liabilities list.": "Vous pouvez emprunter par blocs de 1 000 € à 100 € par mois chacun — 120 % par an, intérêts seuls. Ces intérêts sont une dépense comme une autre : chaque emprunt relève donc le seuil à franchir. Rien n’est jamais emprunté à votre place : emprunter est toujours votre choix délibéré, et vous remboursez depuis la liste des passifs.",
      "Keyboard: r rolls, u undoes. Your game saves itself in this browser as you play.": "Clavier : r lance les dés, u annule. Votre partie s’enregistre toute seule dans ce navigateur.",
      "Undo the last action (u)": "Annuler la dernière action (u)",
      "Download this game as a file": "Télécharger cette partie sous forme de fichier",
      'CASHFLOW': 'CASHFLOW',
      'Undo': 'Annuler',
      'Export': 'Exporter',
      'Import': 'Importer',
      'New game': 'Nouvelle partie',
      'This turn': 'C’est votre tour !',
      'Financial statement': 'Bilan financier',
      'Loans': 'Emprunts',
      'History': 'Historique',
      'How to play': 'Comment jouer',
      'Language': 'Langue',
      'seed {seed}  ·  month {months}': 'graine {seed}  ·  mois {months}',

      /* ---- headline figures ---- */
      'Passive income': 'Revenus passifs',
      'Total expenses': 'Dépenses totales',
      'Cash': 'Argent liquide',
      'Monthly cash flow': 'Flux de trésorerie mensuel',
      'what payday pays': 'ce que verse la paie',
      'the bar to clear': 'le seuil à franchir',
      '{$gap} short of {$total}': 'il manque {$gap} sur {$total}',
      'clear of {$total}': 'au-dessus de {$total}',
      '{$gap} a month short of your {$total} of expenses':
        'il manque {$gap} par mois sur vos {$total} de dépenses',
      'Clear of your {$total} of expenses': 'Vous dépassez vos {$total} de dépenses',
      '{pct}% of the way out': '{pct} % du chemin parcouru',

      /* ---- statement ---- */
      'Income': 'Revenus',
      'Salary': 'Salaire',
      'Interest / dividends': 'Intérêts / dividendes',
      'Real estate': 'Immobilier',
      'Business': 'Entreprises',
      'Total income': 'Revenus totaux',
      'Expenses': 'Dépenses',
      'Taxes': 'Impôts',
      'Home mortgage': 'Prêt immobilier',
      'School loan': 'Prêt étudiant',
      'Car loan': 'Prêt automobile',
      'Credit cards': 'Cartes de crédit',
      'Retail': 'Crédit à la consommation',
      'Other': 'Autres',
      'Children ({n})': 'Enfants ({n})',
      'Assets': 'Actifs',
      'Liabilities': 'Passifs',
      'Repay': 'Rembourser',
      'Not enough cash': 'Pas assez d’argent liquide',
      'Property mortgages': 'Hypothèques immobilières',
      'Cleared when you sell the property': 'Soldées à la vente du bien',
      'Producing monthly income': 'Génère un revenu mensuel',
      'Producing no monthly income': 'Ne génère aucun revenu mensuel',
      'Nothing yet. Every Opportunity square is a chance to start.':
        'Rien pour l’instant. Chaque case Opportunité est une occasion de commencer.',

      /* ---- turn ---- */
      'Your move': 'À vous de jouer',
      'Roll the die and move.': 'Lancez le dé et avancez.',
      'Roll 1 die': 'Lancer 1 dé',
      'Roll 2 dice': 'Lancer 2 dés',
      'Roll two dice.': 'Lancez deux dés.',
      'You are downsized': 'Vous avez perdu votre emploi',
      'You lose {n} more turn.': 'Vous perdez encore {n} tour.',
      'You lose {n} more turns.': 'Vous perdez encore {n} tours.',
      'Sit out a month': 'Passer un mois',
      'Your donation earns you a choice: one die or two, for {n} more turn.':
        'Votre don vous donne le choix : un dé ou deux, pendant encore {n} tour.',
      'Your donation earns you a choice: one die or two, for {n} more turns.':
        'Votre don vous donne le choix : un dé ou deux, pendant encore {n} tours.',
      'Last turn — {square}': 'Tour précédent — {square}',
      'cash, now {$cash}': 'liquidités, désormais {$cash}',
      'Passive income rose {$amount} a month, to {$total}.':
        'Les revenus passifs ont augmenté de {$amount} par mois, à {$total}.',
      'Passive income fell {$amount} a month, to {$total}.':
        'Les revenus passifs ont baissé de {$amount} par mois, à {$total}.',

      /* ---- cards ---- */
      'Deal': 'Opportunité',
      'Take a Small Deal or a Big Deal? Big Deals need more money down and pay far more.':
        'Petite affaire ou grosse affaire ? Les grosses affaires demandent une mise plus élevée et rapportent bien davantage.',
      'Small Deal': 'Petite affaire',
      'Big Deal': 'Grosse affaire',
      'Looking at a deal does not commit you to it.':
        'Regarder une affaire ne vous engage à rien.',
      'Pass': 'J’ai fini',
      'Buy': 'Acheter',
      'Buy for {$amount}': 'Acheter pour {$amount}',
      'Sell': 'Vendre',
      'Sell nothing': 'Ne rien vendre',
      'Sell none': 'Ne rien vendre',
      'Continue': 'Continuer',
      'Decline': 'Refuser',
      'Accept or decline': 'Accepter ou refuser',
      'An expense you have to pay': 'Une dépense à régler',
      'Board square': 'Case du plateau',
      'Close': 'Fermer',
      'Amount': 'Montant',
      'Cost': 'Coût',
      'Cash now': 'Argent liquide maintenant',
      'Cash after': 'Argent liquide ensuite',
      'Cash before': 'Argent liquide avant',
      'Cash if you buy': 'Argent liquide si vous achetez',
      'If you decline': 'Si vous refusez',
      'no change': 'aucun changement',
      'Pay {$amount}': 'Payer {$amount}',
      'Price': 'Prix',
      'Down payment': 'Apport',
      'Mortgage / financed': 'Hypothèque / financé',
      'Cash-on-cash return': 'Rendement sur apport',
      'Your cash': 'Votre argent liquide',
      'Price per share': 'Prix par action',
      'Dividend': 'Dividende mensuel',
      'none': 'aucun',
      'Trading range': 'Fourchette de cotation',
      'You own': 'Vous possédez',
      'You can afford': 'Vous pouvez en acheter',
      'Price per coin': 'Prix par pièce',
      'Maximum': 'Maximum',
      'Coins you own': 'Pièces possédées',
      'Annual return': 'Rendement annuel',
      'Added monthly expense': 'Dépense mensuelle ajoutée',
      'Monthly expenses if you buy': 'Dépenses mensuelles si vous achetez',
      'Monthly cash flow if you buy': 'Flux mensuel si vous achetez',
      'Buying': 'Achat',
      'Selling': 'Vente',
      'Total': 'Total',
      'Shares after': 'Actions après',
      'Coins left': 'Pièces restantes',
      '{pct}%': '{pct}\u00a0%',
      '{pct}% a year': '{pct}\u00a0% par an',
      "Tap anything to learn more": "Touchez n’importe quoi pour en savoir plus",
      "Your position": "Votre position",
      "Average price you paid": "Prix moyen payé",
      "Total invested": "Total investi",
      "Price now": "Prix actuel",
      "{n} shares at {$avg} each, {$paid} in total": "{n} actions à {$avg} l’unité, {$paid} au total",
      "or type an amount": "ou saisissez un nombre",
      "Use": "Valider",
      "Number of shares to buy": "Nombre d’actions à acheter",
      "Number of shares to sell": "Nombre d’actions à vendre",
      "Enter how many shares.": "Indiquez un nombre d’actions.",
      "You can afford {n} shares at this price.": "À ce prix, vous pouvez en acheter {n}.",
      "You only own {n} shares.": "Vous n’en possédez que {n}.",
      "Share": "Partager",
      "Share this setup": "Partager cette partie",
      "Share this game": "Partager cette partie",
      "Anyone who opens this link starts from the same seed, profession and dream, and can make different choices from there.": "Quiconque ouvre ce lien démarre avec la même graine, la même profession et le même rêve, et peut ensuite faire d’autres choix.",
      "Link copied. Anyone who opens it starts this same game.": "Lien copié. Quiconque l’ouvre démarre cette même partie.",
      "{$amount}/mo": "{$amount}/mois",
      "You passed PAYDAY and collected {$amount}.": "Vous êtes passé par le JOUR DE PAIE et avez encaissé {$amount}.",
      "You passed PAYDAY. Your expenses came to {$amount} more than your income.": "Vous êtes passé par le JOUR DE PAIE. Vos dépenses ont dépassé vos revenus de {$amount}.",
      "{$amount} / month": "{$amount} / mois",
      "Cash if you accept": "Argent liquide si vous acceptez",
      "Professions beaten: {done} of {total}.": "Professions réussies : {done} sur {total}.",
      "Not yet beaten: {name}, number {n} of {total} by difficulty.": "Pas encore réussie : {name}, numéro {n} sur {total} par difficulté.",
      "Every profession has been beaten.": "Toutes les professions ont été réussies.",
      "First goal: build passive income greater than your monthly expenses, in as few months as you can. That gets you out of the Rat Race; the Fast Track that follows has a goal of its own.": "Premier objectif : bâtir des revenus passifs supérieurs à vos dépenses mensuelles, en aussi peu de mois que possible. Cela vous sort de la course des rats ; la voie rapide qui suit a son propre objectif.",
      "Game over - you win": "Partie terminée — vous avez gagné",
      "Play again": "Rejouer",
      "You bought your dream in {months} months.": "Vous avez acheté votre rêve en {months} mois.",
      "You added {$income} a month of investment income in {months} months.": "Vous avez ajouté {$income} par mois de revenus d’investissement en {months} mois.",
      "{$added} of {$goal} new income": "{$added} sur {$goal} de nouveaux revenus",
      "enough for your dream": "de quoi acheter votre rêve",
      "{$gap} short of your dream": "il manque {$gap} pour votre rêve",
      "  cash needed": "  argent nécessaire",
      "  so far": "  jusqu’ici",
      "Win by buying your dream ({name}, {$cost}) or by doubling your Cash Flow Day income - adding another {$goal}/mo of investment income.": "Gagnez en achetant votre rêve ({name}, {$cost}) ou en doublant votre revenu du Jour de paie — soit {$goal}/mois de revenus d’investissement en plus.",
      "Income minus expenses, monthly": "Revenus moins dépenses, mensuel",
      "Dividend yield at this price": "Rendement du dividende à ce prix",
      "Declined {title} ({$amount}).": "Refusé : {title} ({$amount}).",
      "{title} - {text} You own nothing this buyer wants.": "{title} — {text} Vous ne possédez rien qui intéresse cet acheteur.",
      "{title} - {text} You own no gold coins to sell.": "{title} — {text} Vous ne possédez aucune pièce d’or à vendre.",
      "Your passive income overtook your expenses, so the Rat Race is finished. From here the game is a different one.": "Vos revenus passifs ont dépassé vos dépenses : la course des rats est terminée. À partir d’ici, le jeu change.",
      "Everything you built in the Rat Race - the properties, the businesses, the shares - became that monthly income. Your old salary, expenses and debts are gone.": "Tout ce que vous avez bâti dans la course des rats — les biens, les entreprises, les actions — est devenu ce revenu mensuel. Votre ancien salaire, vos dépenses et vos dettes ont disparu.",
      "Land on your dream, {name}, and pay {$cost}.": "Arrivez sur votre rêve, {name}, et payez {$cost}.",
      "Your dream is the gold square on the board. Only that one wins the game for you; the others belong to nobody.": "Votre rêve est la case dorée du plateau. Seule celle-là vous fait gagner ; les autres n’appartiennent à personne.",
      "No one will lend to you now.": "Plus personne ne vous prêtera d’argent.",
      "There are no loans on the Fast Track. Investments are bought with cash.": "Il n’y a pas d’emprunt sur la voie rapide. Les investissements s’achètent comptant.",
      "You could not pay for {reason}, and there was nothing left to sell or borrow against.": "Vous n’avez pas pu payer {reason}, et il ne restait plus rien à vendre ni à emprunter.",
      "Going further": "Pour aller plus loin",
      "This game is an independent rewrite of the ideas, not the original. If they are useful to you, they came from somewhere:": "Ce jeu est une réécriture indépendante des idées, pas l’original. Si elles vous sont utiles, elles viennent de quelque part :",
      "— free, registration required": "— gratuit, inscription requise",
      "— starting with Rich Dad Poor Dad": "— à commencer par Père riche, père pauvre",
      "— a personal financial statement, and property calculators": "— un bilan financier personnel et des calculateurs immobiliers",
      "These are Rich Dad's own pages. This game is not affiliated with them, and links to a paid catalogue are links, not recommendations.": "Ce sont les pages officielles de Rich Dad. Ce jeu n’y est pas affilié, et un lien vers un catalogue payant reste un lien, pas une recommandation.",
      "You collect your Cash Flow Day income each time you pass or land on a Cash Flow Day square.": "Vous encaissez votre revenu du Jour de paie à chaque fois que vous passez sur une case Jour de paie ou que vous vous y arrêtez.",
      "you can afford it": "vous avez de quoi",
      "{$amount} more": "{$amount} de plus",
      'Monthly income from these': 'Revenu mensuel de ces titres',
      'Change amount': 'Modifier la quantité',
      'Buy {qty} share': 'Acheter {qty} action',
      'Buy {qty} shares': 'Acheter {qty} actions',
      'Sell {qty} share': 'Vendre {qty} action',
      'Sell {qty} shares': 'Vendre {qty} actions',
      'Buy {qty} coin': 'Acheter {qty} pièce',
      'Buy {qty} coins': 'Acheter {qty} pièces',
      'Sell {qty} coin': 'Vendre {qty} pièce',
      'Sell {qty} coins': 'Vendre {qty} pièces',
      'One share costs {$price} and you have {$cash}.':
        'Une action coûte {$price} et vous avez {$cash}.',
      'One coin costs {$price} and you have {$cash}.':
        'Une pièce coûte {$price} et vous avez {$cash}.',
      'At {$price}, this is {pct}% of the way up its {$low} to {$high} range.':
        'À {$price}, le titre est à {pct} % de sa fourchette {$low} – {$high}.',
      'You are {$short} short. You can borrow at most {$credit} more.':
        'Il vous manque {$short}. Vous ne pouvez emprunter que {$credit} de plus.',
      'You are {$short} short. A loan of {$loan} would cover it and add {$monthly} a month to your expenses.':
        'Il vous manque {$short}. Un emprunt de {$loan} le couvrirait et ajouterait {$monthly} par mois à vos dépenses.',
      'Take a loan…': 'Emprunter…',
      'A sale raises cash once and removes that property’s monthly income from then on.':
        'Une vente rapporte une somme unique et supprime définitivement le revenu mensuel du bien.',
      'Keep everything': 'Tout conserver',
      'Donate {$amount}': 'Donner {$amount}',
      'Charity': 'Charité',

      /* ---- loans ---- */
      'You owe': 'Vous devez',
      'You could borrow': 'Vous pourriez emprunter',
      'Take a loan': 'Emprunter',
      'Repay loans': 'Rembourser des emprunts',
      'Pay off your {debt}': 'Solder votre {debt}',
      'Cancel': 'Annuler',
      'Take {$amount}': 'Emprunter {$amount}',
      'Repay {$amount}': 'Rembourser {$amount}',
      'Pay off {$amount}': 'Solder {$amount}',
      'Min': 'Min',
      'Max {$amount}': 'Max {$amount}',
      'Cash afterwards': 'Argent liquide ensuite',
      'Monthly expenses': 'Dépenses mensuelles',
      'Loans left': 'Emprunts restants',
      'Balance to clear': 'Solde à rembourser',
      'home mortgage': 'prêt immobilier',
      'school loan': 'prêt étudiant',
      'car loan': 'prêt automobile',
      'credit cards': 'cartes de crédit',
      'retail debt': 'crédit à la consommation',
      'Interest only: {$per} a month for every {$unit} borrowed, which is 120% a year. The payment continues every month until you repay the principal.':
        'Intérêts seuls : {$per} par mois pour chaque {$unit} emprunté, soit 120 % par an. Le paiement continue chaque mois jusqu’au remboursement du capital.',
      'You have no borrowing capacity left.': 'Votre capacité d’emprunt est épuisée.',
      'You need at least {$unit} in cash to repay a block.':
        'Il vous faut au moins {$unit} en liquidités pour rembourser un bloc.',
      'This debt can only be cleared in full. Doing so removes its {$payment} monthly payment for the rest of the game.':
        'Cette dette ne peut être soldée qu’en totalité. Elle supprime alors sa mensualité de {$payment} pour le reste de la partie.',
      'You are {$amount} short of clearing it.': 'Il vous manque {$amount} pour la solder.',

      /* ---- fast track ---- */
      'Out of the Rat Race in {months} months': 'Sorti de la course des rats en {months} mois',
      'What carries over': 'Ce qui est conservé',
      'What changes': 'Ce qui change',
      'Two ways to win': 'Deux façons de gagner',
      'Cash Flow Day income': 'Revenu du Jour de paie',
      'Cash Flow Day': 'Jour de paie',
      'Cash to start': 'Argent liquide de départ',
      'You roll two dice instead of one.': 'Vous lancez deux dés au lieu d’un.',
      'Investments are bought with cash. There are no loans here.':
        'Les investissements s’achètent comptant. Il n’y a pas d’emprunt ici.',
      'Start the Fast Track': 'Commencer la voie rapide',
      'Investments': 'Investissements',
      'None yet. Land on an investment square to buy one.':
        'Aucun pour l’instant. Arrêtez-vous sur une case investissement pour en acheter un.',
      'Carried from the Rat Race': 'Reporté de la course des rats',
      'From investments bought here': 'Des investissements achetés ici',
      'Total per Cash Flow Day': 'Total par Jour de paie',
      'or new investment income': 'ou nouveaux revenus d’investissement',
      '  cash needed': '  liquidités nécessaires',
      '  so far': '  à ce jour',
      'you can afford it': 'vous pouvez vous le permettre',
      '{$amount} more': '{$amount} de plus',
      'Not yet': 'Pas encore',
      'You win': 'Vous avez gagné',
      'Bankrupt': 'En faillite',

      /* ---- setup ---- */
      'Start a game': 'Commencer une partie',
      'Profession': 'Profession',
      'Start': 'Commencer',
      'Random': 'Aléatoire',
      'Savings to start': 'Épargne de départ',
      'Cost per child': 'Coût par enfant',

      /* ---- engine log lines ---- */
      '+{$amount}  {reason}': '+{$amount}  {reason}',
      '-{$amount}  {reason}': '-{$amount}  {reason}',
      'PAYDAY': 'JOUR DE PAIE',
      'CASH FLOW DAY': 'JOUR DE PAIE',
      'PAYDAY (your expenses exceed your income)': 'JOUR DE PAIE (vos dépenses dépassent vos revenus)',
      'Rolled {dice} = {total}.': 'Lancé {dice} = {total}.',
      'Game {seed} begins. {job}, take-home {$salary}/mo, savings {$savings}.':
        'Partie {seed}. {job}, salaire net {$salary}/mois, épargne {$savings}.',
      'Dream: {name} ({$cost}).': 'Rêve : {name} ({$cost}).',
      'Starting monthly cash flow: {$cf}. Passive income: {$passive} against {$expenses} of expenses.':
        'Flux mensuel de départ : {$cf}. Revenus passifs : {$passive} contre {$expenses} de dépenses.',
      'A baby arrives. Child expenses rise by {$cost}/mo (now {n} children).':
        'Un enfant arrive. Les frais d’enfant augmentent de {$cost}/mois (désormais {n} enfants).',
      'A new baby - but you already have {max} children, the maximum. No change.':
        'Un enfant de plus — mais vous en avez déjà {max}, le maximum. Aucun changement.',
      'Turn lost. {n} to go.': 'Tour perdu. Encore {n}.',
      'Small Deal: {title}': 'Petite affaire : {title}',
      'Big Deal: {title}': 'Grosse affaire : {title}',
      'Passed on {title}.': 'Passé sur {title}.',
      '{title} - you have no children, so there is nothing to pay.':
        '{title} — vous n’avez pas d’enfant, il n’y a donc rien à payer.',
      '{title}. {text}': '{title}. {text}',
      '{title} - a cost for {who}. You have none, so you pay nothing.':
        '{title} — un coût pour {who}. Vous n’en avez aucun, vous ne payez donc rien.',
      '{title} - but you own no gold coins to sell.':
        '{title} — mais vous n’avez aucune pièce d’or à vendre.',
      '{title} - but you own nothing this buyer wants.':
        '{title} — mais vous ne possédez rien qui intéresse cet acheteur.',
      '{title} - you own none.': '{title} — vous n’en possédez aucune.',
      'people who own property': 'les propriétaires immobiliers',
      'people who own a business': 'les propriétaires d’entreprise',
      'landlords with tenants': 'les bailleurs ayant des locataires',
      'Bought {qty} {symbol} at {$price} = {$cost}.':
        'Acheté {qty} {symbol} à {$price} = {$cost}.',
      'Bought {qty} gold coins for {$cost}. They pay nothing until you sell them.':
        'Acheté {qty} pièces d’or pour {$cost}. Elles ne rapportent rien jusqu’à la revente.',
      'Bought {title} for {$cost}. Adds {$cf}/mo.':
        'Acheté {title} pour {$cost}. Ajoute {$cf}/mois.',
      'Bought {title} ({$cost}, {$financed} financed). Adds {$cf}/mo passive income.':
        'Acheté {title} ({$cost}, {$financed} financés). Ajoute {$cf}/mois de revenus passifs.',
      '-{$amount}  Down payment on {title}': '-{$amount}  Apport sur {title}',
      'Monthly expenses rise by {$amount} - permanently.':
        'Les dépenses mensuelles augmentent de {$amount} — définitivement.',
      'For the next 3 turns you may roll one die or two.':
        'Pendant les 3 prochains tours, vous pouvez lancer un dé ou deux.',
      'You lose your next 2 turns.': 'Vous perdez vos 2 prochains tours.',
      'Capital gain {$gain} against a purchase price of {$cost}. Passive income falls by {$lost}/mo.':
        'Plus-value de {$gain} sur un prix d’achat de {$cost}. Les revenus passifs baissent de {$lost}/mois.',
      'Capital loss {$gain} against a purchase price of {$cost}. Passive income falls by {$lost}/mo.':
        'Moins-value de {$gain} sur un prix d’achat de {$cost}. Les revenus passifs baissent de {$lost}/mois.',
      'Took a loan of {$amount}. Expenses rise by {$monthly}/mo until the principal is repaid.':
        'Emprunt de {$amount}. Les dépenses augmentent de {$monthly}/mois jusqu’au remboursement du capital.',
      'Repaid {$amount} of loans. Expenses fall by {$monthly}/mo.':
        'Remboursé {$amount} d’emprunts. Les dépenses baissent de {$monthly}/mois.',
      '-{$amount}  Paid off {debt} in full. Expenses fall by {$freed}/mo.':
        '-{$amount}  {debt} soldé en totalité. Les dépenses baissent de {$freed}/mois.',
      'Declined {title} ({$amount}). Total declined this game: {$total}.':
        'Refusé {title} ({$amount}). Total refusé cette partie : {$total}.',
      'Forced sale: sold {name} for {$value} to cover {reason}.':
        'Vente forcée : {name} vendu pour {$value} afin de couvrir {reason}.',
      'Forced sale: sold {name} for {$value} (80% of what you paid) to cover {reason}. Passive income falls by {$lost}/mo.':
        'Vente forcée : {name} vendu pour {$value} (80 % du prix payé) afin de couvrir {reason}. Les revenus passifs baissent de {$lost}/mois.',
      'Forced loan of {$borrowed} to cover {reason} (adds {$monthly}/mo to expenses).':
        'Emprunt forcé de {$borrowed} pour couvrir {reason} (ajoute {$monthly}/mois aux dépenses).',
      'BANKRUPT. You could not pay for {reason}, you had {$cash} in cash, and you can borrow no more against {$income} a month of income.':
        'FAILLITE. Vous ne pouviez pas payer {reason}, vous aviez {$cash} en liquidités, et vous ne pouvez plus emprunter sur {$income} de revenus mensuels.',
      'OUT OF THE RAT RACE in {months} months. Passive income {$passive} beats expenses of {$expenses}.':
        'SORTI DE LA COURSE DES RATS en {months} mois. Les revenus passifs {$passive} dépassent les dépenses de {$expenses}.',
      'Fast Track: your Cash Flow Day income is {$income} and you start with the same amount in cash.':
        'Voie rapide : votre revenu de Jour de paie est de {$income} et vous démarrez avec autant en liquidités.',
      'You bought your dream: {name}.': 'Vous avez acheté votre rêve : {name}.',
      "Someone else's dream: {name}. Not yours - keep moving.":
        'Le rêve de quelqu’un d’autre : {name}. Pas le vôtre — continuez.',
      'YOU WIN. You bought your dream in {months} months.':
        'VOUS AVEZ GAGNÉ. Vous avez acheté votre rêve en {months} mois.',
      'YOU WIN. You added {$income} a month of investment income in {months} months.':
        'VOUS AVEZ GAGNÉ. Vous avez ajouté {$income} par mois de revenus d’investissement en {months} mois.',
      '{symbol}: {before} shares become {after}. Your total value is unchanged.':
        '{symbol} : {before} actions deviennent {after}. Votre valeur totale est inchangée.',
      '{label}: {text} Lost {$amount}.': '{label} : {text} Perte de {$amount}.',
      'Expense: {title}': 'Dépense : {title}',
      'Lost your job - one month of expenses': 'Perte d’emploi — un mois de dépenses',
      'Charitable donation': 'Don caritatif',

      /* ---- errors ---- */
      'That costs {$cost} and you have {$cash}. Shares are bought with cash. Buy fewer.':
        'Cela coûte {$cost} et vous avez {$cash}. Les actions s’achètent comptant. Achetez-en moins.',
      'You need {$need} in cash and you have {$cash}. Take a loan first if you want this deal.':
        'Il vous faut {$need} en liquidités et vous avez {$cash}. Empruntez d’abord si vous voulez cette affaire.',
      'You need {$need} in cash and you have {$cash}.':
        'Il vous faut {$need} en liquidités et vous avez {$cash}.',
      'That needs {$need} in cash and you have {$cash}.':
        'Il faut {$need} en liquidités et vous avez {$cash}.',
      'That costs {$cost} and you have {$cash}.': 'Cela coûte {$cost} et vous avez {$cash}.',
      'You own {n} shares.': 'Vous possédez {n} actions.',
      'You own {n} coins.': 'Vous possédez {n} pièces.',
      'You own no {symbol}.': 'Vous ne possédez aucune action {symbol}.',
      'Loans come in {$unit} blocks.': 'Les emprunts se font par blocs de {$unit}.',
      'Repay in {$unit} blocks.': 'Remboursez par blocs de {$unit}.',
      'You only owe {$owed}.': 'Vous ne devez que {$owed}.',
      'You only have {$cash} in cash.': 'Vous n’avez que {$cash} en liquidités.',
      'That is already paid off.': 'C’est déjà soldé.',
      'This one has to be paid.': 'Celle-ci doit être payée.',
      'That action is not available right now.': 'Cette action n’est pas disponible actuellement.',
      'You cannot roll right now.': 'Vous ne pouvez pas lancer les dés maintenant.',
      'Clearing that costs {$cost} and you have {$cash}.':
        'La solder coûte {$cost} et vous avez {$cash}.',
      'Your dream costs {$cost} and you have {$cash}.':
        'Votre rêve coûte {$cost} et vous avez {$cash}.',
      'That costs {$cost} and you have {$cash}. On the Fast Track you buy with cash.':
        'Cela coûte {$cost} et vous avez {$cash}. Sur la voie rapide, on achète comptant.',
      'You can borrow at most another {$available}. Your borrowing limit is {months} months of total income ({$limit}) and you already owe {$owed}.':
        'Vous ne pouvez emprunter que {$available} de plus. Votre limite est de {months} mois de revenus totaux ({$limit}) et vous devez déjà {$owed}.',
      'Closing that sale would cost you {$amount} to clear the mortgage, and you cannot raise it.':
        'Conclure cette vente coûterait {$amount} pour solder l’hypothèque, et vous ne pouvez pas réunir cette somme.'
    },

    content: {
          "janitor": {
                "name": "Agent d’entretien"
          },
          "mechanic": {
                "name": "Mécanicien"
          },
          "truck-driver": {
                "name": "Chauffeur routier"
          },
          "secretary": {
                "name": "Secrétaire"
          },
          "police-officer": {
                "name": "Policier"
          },
          "nurse": {
                "name": "Infirmier"
          },
          "teacher": {
                "name": "Enseignant (primaire/secondaire)"
          },
          "business-manager": {
                "name": "Cadre d’entreprise"
          },
          "engineer": {
                "name": "Ingénieur"
          },
          "lawyer": {
                "name": "Avocat"
          },
          "airline-pilot": {
                "name": "Pilote de ligne"
          },
          "doctor": {
                "name": "Médecin"
          },
          "dr01": {
                "name": "Construire une école dans un village qui n’en a pas",
                "short": "École"
          },
          "dr02": {
                "name": "Faire le tour du monde à la voile",
                "short": "Voile"
          },
          "dr03": {
                "name": "Une île privée",
                "short": "Île"
          },
          "dr04": {
                "name": "Posséder un club sportif professionnel",
                "short": "Club"
          },
          "dr05": {
                "name": "Dîner avec un chef d’État",
                "short": "Dîner"
          },
          "dr06": {
                "name": "Une place sur un vol spatial commercial",
                "short": "Espace"
          },
          "dr07": {
                "name": "Restaurer et faire courir des voitures anciennes",
                "short": "Anciennes"
          },
          "dr08": {
                "name": "Financer une aile de recherche contre le cancer",
                "short": "Recherche"
          },
          "dr09": {
                "name": "Vivre dans un château en Europe",
                "short": "Château"
          },
          "dr10": {
                "name": "Courir un marathon sur chaque continent",
                "short": "Marathon"
          },
          "ft01": {
                "name": "Bowlings — 3 salles",
                "short": "Bowling"
          },
          "ft02": {
                "name": "Flotte de pêche",
                "short": "Pêche"
          },
          "ft03": {
                "name": "Ranch bovin",
                "short": "Bétail"
          },
          "ft04": {
                "name": "Mine d’or",
                "short": "Or"
          },
          "ft05": {
                "name": "Concession automobile",
                "short": "Auto"
          },
          "ft06": {
                "name": "Ranch de 2 000 hectares",
                "short": "Ranch"
          },
          "ft07": {
                "name": "Vignoble",
                "short": "Vignoble"
          },
          "ft08": {
                "name": "Éditeur de logiciels",
                "short": "Logiciel"
          },
          "ft09": {
                "name": "Réseau de radios",
                "short": "Radio"
          },
          "ft10": {
                "name": "Franchise de cafés — 50 points de vente",
                "short": "Cafés"
          },
          "ft11": {
                "name": "Portefeuille de self-stockage",
                "short": "Stockage"
          },
          "ft12": {
                "name": "Complexe hôtelier en bord de mer",
                "short": "Resort"
          },
          "ft13": {
                "name": "Parc éolien",
                "short": "Éolien"
          },
          "ft14": {
                "name": "Chaîne de télévision",
                "short": "TV"
          },
          "ft15": {
                "name": "Hôtel de charme",
                "short": "Hôtel"
          },
          "ft16": {
                "name": "Résidence de 300 logements",
                "short": "Logements"
          },
          "ft17": {
                "name": "Centre commercial",
                "short": "Centre"
          },
          "ft18": {
                "name": "Centre de données",
                "short": "Données"
          },
          "sd01": {
                "title": "HLTH - HealthCo",
                "text": "Les actions se négocient à 5 €. Fourchette 5 € - 40 €. Ne verse pas de dividende. Un essai de phase 3 s’est effondré en plein scandale et le régulateur enquête."
          },
          "sd02": {
                "title": "HLTH - HealthCo",
                "text": "Les actions se négocient à 10 €. Fourchette 5 € - 40 €. Ne verse pas de dividende. Deux de ses médicaments ont été retoqués le même trimestre."
          },
          "sd03": {
                "title": "HLTH - HealthCo",
                "text": "Les actions se négocient à 20 €. Fourchette 5 € - 40 €. Ne verse pas de dividende. Une année calme. Rien n’a été annoncé, dans un sens ni dans l’autre."
          },
          "sd04": {
                "title": "HLTH - HealthCo",
                "text": "Les actions se négocient à 30 €. Fourchette 5 € - 40 €. Ne verse pas de dividende. Un nouveau médicament s’est révélé très efficace et il est désormais commercialisé."
          },
          "sd05": {
                "title": "GRW - GrowTech",
                "text": "Les actions se négocient à 5 €. Fourchette 5 € - 40 €. Ne verse pas de dividende. Son fondateur a démissionné du jour au lendemain et les comptes sont en cours de correction."
          },
          "sd06": {
                "title": "GRW - GrowTech",
                "text": "Les actions se négocient à 15 €. Fourchette 5 € - 40 €. Ne verse pas de dividende. La croissance s’est arrêtée et un tiers de l’équipe technique est parti."
          },
          "sd07": {
                "title": "GRW - GrowTech",
                "text": "Les actions se négocient à 30 €. Fourchette 5 € - 40 €. Ne verse pas de dividende. Elle a signé son plus gros client à ce jour."
          },
          "sd08": {
                "title": "GRW - GrowTech",
                "text": "Les actions se négocient à 40 €. Fourchette 5 € - 40 €. Ne verse pas de dividende. Son nouveau produit est sur toutes les lèvres. La presse la sacre entreprise de l’année."
          },
          "sd09": {
                "title": "BIGX - BigBox Retail",
                "text": "Les actions se négocient à 10 €. Fourchette 10 € - 50 €. Ne verse pas de dividende. Une crise de trésorerie l’a forcée à fermer un tiers de ses magasins."
          },
          "sd10": {
                "title": "BIGX - BigBox Retail",
                "text": "Les actions se négocient à 20 €. Fourchette 10 € - 50 €. Ne verse pas de dividende. Les ventes stagnent et un concurrent en ligne lui prend des parts de marché."
          },
          "sd11": {
                "title": "BIGX - BigBox Retail",
                "text": "Les actions se négocient à 40 €. Fourchette 10 € - 50 €. Ne verse pas de dividende. Des ventes de fin d’année record ont dépassé toutes les prévisions."
          },
          "sd12": {
                "title": "MYTV - MediaTV",
                "text": "Les actions se négocient à 1 €. Fourchette 1 € - 30 €. Ne verse pas de dividende. Elle a perdu les droits de diffusion sur lesquels reposait toute son activité."
          },
          "sd13": {
                "title": "MYTV - MediaTV",
                "text": "Les actions se négocient à 5 €. Fourchette 1 € - 30 €. Ne verse pas de dividende. Les recettes publicitaires baissent depuis six trimestres d’affilée."
          },
          "sd14": {
                "title": "MYTV - MediaTV",
                "text": "Les actions se négocient à 15 €. Fourchette 1 € - 30 €. Ne verse pas de dividende. Sa nouvelle série cartonne et les abonnés reviennent en masse."
          },
          "sd15": {
                "title": "NRGY - NuEnergy",
                "text": "Les actions se négocient à 5 €. Fourchette 5 € - 40 €. Ne verse pas de dividende. Une avarie a provoqué une fuite et les amendes ne sont pas encore chiffrées."
          },
          "sd16": {
                "title": "NRGY - NuEnergy",
                "text": "Les actions se négocient à 20 €. Fourchette 5 € - 40 €. Ne verse pas de dividende. Les prix de l’énergie sont stables depuis le début de l’année."
          },
          "sd17": {
                "title": "NRGY - NuEnergy",
                "text": "Les actions se négocient à 35 €. Fourchette 5 € - 40 €. Ne verse pas de dividende. Elle a remporté un contrat national courant sur dix ans."
          },
          "sd18": {
                "title": "SAFE - SafePower Utility",
                "text": "Les actions se négocient à 20 €. Fourchette 20 € - 40 €. Verse 1 € par action et par mois. Le régulateur a plafonné ce qu’elle peut facturer aux ménages."
          },
          "sd19": {
                "title": "SAFE - SafePower Utility",
                "text": "Les actions se négocient à 30 €. Fourchette 20 € - 40 €. Verse 1 € par action et par mois. Un service public régulé au long historique de dividendes. Rien n’a changé cette année."
          },
          "sd20": {
                "title": "SAFE - SafePower Utility",
                "text": "Les actions se négocient à 40 €. Fourchette 20 € - 40 €. Verse 1 € par action et par mois. Elle a augmenté son dividende pour la douzième année consécutive."
          },
          "sd21": {
                "title": "REIT - Income REIT Fund",
                "text": "Les actions se négocient à 20 €. Fourchette 20 € - 40 €. Verse 1 € par action et par mois. Son principal locataire a fait faillite et deux immeubles sont vides."
          },
          "sd22": {
                "title": "REIT - Income REIT Fund",
                "text": "Les actions se négocient à 25 €. Fourchette 20 € - 40 €. Verse 1 € par action et par mois. Un fonds propriétaire d’immeubles d’habitation. Le taux d’occupation est stable."
          },
          "sd23": {
                "title": "REIT - Income REIT Fund",
                "text": "Les actions se négocient à 35 €. Fourchette 20 € - 40 €. Verse 1 € par action et par mois. Les loyers ont augmenté dans tous ses immeubles et elle est presque pleine."
          },
          "sd24": {
                "title": "HLTH annonce une division d’action 2 pour 1",
                "text": "Si vous détenez des HLTH, votre nombre d’actions double. Votre valeur totale ne change pas — une division n’enrichit personne."
          },
          "sd25": {
                "title": "GRW annonce une division d’action 2 pour 1",
                "text": "Si vous détenez des GRW, votre nombre d’actions double."
          },
          "sd26": {
                "title": "MYTV annonce un regroupement 1 pour 2",
                "text": "Si vous détenez des MYTV, votre nombre d’actions est divisé par deux (arrondi à l’inférieur). Un regroupement est souvent un signal d’alerte."
          },
          "sd27": {
                "title": "Maison 3 ch./2 sdb — vendeur pressé"
          },
          "sd28": {
                "title": "Maison 3 ch./2 sdb — rue calme"
          },
          "sd29": {
                "title": "Maison 3 ch./2 sdb — peinture à refaire"
          },
          "sd30": {
                "title": "Maison 3 ch./2 sdb — saisie bancaire",
                "text": "La banque veut s’en défaire et financera 95 %."
          },
          "sd31": {
                "title": "Maison 3 ch./2 sdb — bailleur qui prend sa retraite"
          },
          "sd32": {
                "title": "Appartement 2 ch./1 sdb — près de l’université"
          },
          "sd33": {
                "title": "Appartement 2 ch./1 sdb — charges en hausse",
                "text": "Le loyer est au niveau du marché. Les charges de copropriété ont augmenté deux fois cette année."
          },
          "sd34": {
                "title": "Studio 1 ch./1 sdb — centre-ville"
          },
          "sd35": {
                "title": "Maison de deux logements — les deux loués"
          },
          "sd36": {
                "title": "Maison de deux logements — un logement vacant",
                "text": "Le flux de trésorerie suppose que vous relouez le logement vide."
          },
          "sd37": {
                "title": "8 hectares de terrain nu",
                "text": "Ni loyer, ni hypothèque, ni locataire. Sa valeur sera ce qu’un acheteur en proposera plus tard."
          },
          "sd38": {
                "title": "2 hectares près d’une nouvelle sortie d’autoroute",
                "text": "Un promoteur pourrait s’y intéresser un jour."
          },
          "sd39": {
                "title": "Station de lavage automatique (société en commandite)",
                "text": "Une part passive dans une station en activité."
          },
          "sd40": {
                "title": "Boxes de self-stockage (société en commandite)",
                "text": "Peu d’entretien, locataires stables."
          },
          "sd41": {
                "title": "Franchise de kiosque à café",
                "text": "Le franchiseur l’exploite. Vous touchez une part."
          },
          "sd42": {
                "title": "Tournée de distributeurs automatiques",
                "text": "Douze machines. Vous les réapprovisionnez une fois par mois."
          },
          "sd43": {
                "title": "Dépôt à terme 6 mois",
                "text": "Un dépôt de six mois à taux fixe. Les fonds sont bloqués pendant la durée."
          },
          "sd44": {
                "title": "Pièces d’or de collection — 500 € pièce",
                "text": "L’or ne verse aucun revenu mensuel. Sa valeur sera ce qu’un acheteur en proposera plus tard."
          },
          "sd45": {
                "title": "Pièces d’or de collection — 600 € pièce",
                "text": "Les prix des collectionneurs ont monté cette année."
          },
          "sd46": {
                "title": "Un ami vous demande un prêt de 1 000 €",
                "text": "Sans intérêt, sans échéance et sans rien d’écrit."
          },
          "sd47": {
                "title": "Tuyau : actions pré-introduction, 2 500 € minimum",
                "text": "Actions non cotées vendues de gré à gré. Il n’y a pas de cours public et aucun moyen de les revendre dans ce jeu."
          },
          "sd48": {
                "title": "Multipropriété dans une station de ski",
                "text": "Deux semaines par an dans une station donnée, plus 50 € par mois de charges."
          },
          "bd01": {
                "title": "Immeuble de 4 logements — locataires stables"
          },
          "bd02": {
                "title": "Immeuble de 4 logements — loyers sous le marché",
                "text": "Les loyers sont 20 % sous le marché. C’est là que réside l’occasion."
          },
          "bd03": {
                "title": "Immeuble de 8 logements — le propriétaire veut vendre"
          },
          "bd04": {
                "title": "Immeuble de 8 logements — toiture à refaire",
                "text": "Le prix est bas à cause de la toiture."
          },
          "bd05": {
                "title": "Immeuble de 12 logements — entièrement loué"
          },
          "bd06": {
                "title": "Résidence de 20 logements"
          },
          "bd07": {
                "title": "Résidence de 30 logements"
          },
          "bd08": {
                "title": "Résidence de 60 logements"
          },
          "bd09": {
                "title": "Portefeuille de 3 maisons locatives"
          },
          "bd10": {
                "title": "40 hectares de terres agricoles",
                "text": "Un agriculteur voisin vous les loue."
          },
          "bd11": {
                "title": "16 hectares sur le front d’urbanisation",
                "text": "Aucun revenu. Pure spéculation."
          },
          "bd12": {
                "title": "Station de lavage automatique — 4 pistes"
          },
          "bd13": {
                "title": "Franchise de pizzeria",
                "text": "Système éprouvé, gestion à distance possible."
          },
          "bd14": {
                "title": "Laverie automatique — 24 machines",
                "text": "Fonctionne à pièces. Résistante aux récessions."
          },
          "bd15": {
                "title": "Centre de self-stockage"
          },
          "bd16": {
                "title": "Petit immeuble de bureaux — 6 lots"
          },
          "bd17": {
                "title": "Entrepôt loué à un distributeur",
                "text": "Un seul locataire, bail de dix ans."
          },
          "bd18": {
                "title": "Sandwicherie — gestion déléguée"
          },
          "bd19": {
                "title": "Entreprise d’espaces verts",
                "text": "Livrée avec les équipes, les véhicules et les contrats."
          },
          "bd20": {
                "title": "Anneaux d’amarrage au port de plaisance"
          },
          "bd21": {
                "title": "Parc de maisons mobiles — 25 emplacements",
                "text": "Vous possédez le terrain. Les locataires possèdent les maisons."
          },
          "bd22": {
                "title": "Redevance sur licence de logiciel",
                "text": "Aucun financement disponible. Achat comptant uniquement."
          },
          "bd23": {
                "title": "Un restaurant à votre nom",
                "text": "Un restaurant de 60 couverts. Il tourne actuellement 400 € par mois sous son seuil de rentabilité."
          },
          "bd24": {
                "title": "Voiture de collection « placement »",
                "text": "L’assurance et le gardiennage reviennent à 300 € par mois. Elle ne génère aucun loyer."
          },
          "bd25": {
                "title": "Immeuble de 10 logements — crédit vendeur",
                "text": "Le vendeur porte le crédit : l’apport est faible et la dette élevée."
          },
          "bd26": {
                "title": "Chambres d’hôtes"
          },
          "dd01": {
                "title": "Téléphone de remplacement",
                "text": "L’ancien est tombé dans l’évier."
          },
          "dd02": {
                "title": "Dîner au restaurant entre amis",
                "text": "L’addition est déjà sur la table."
          },
          "dd03": {
                "title": "Vêtements de travail"
          },
          "dd06": {
                "title": "Réparation auto — boîte de vitesses"
          },
          "dd07": {
                "title": "Note de dentiste"
          },
          "dd08": {
                "title": "Renouvellement de l’abonnement à la salle de sport",
                "text": "Douze mois, payables d’avance."
          },
          "dd10": {
                "title": "Cadeau de mariage pour un cousin"
          },
          "dd11": {
                "title": "Frais de vétérinaire"
          },
          "dd12": {
                "title": "Billets promis de longue date"
          },
          "dd14": {
                "title": "Amende pour excès de vitesse"
          },
          "dd17": {
                "title": "Plomberie en urgence"
          },
          "dd18": {
                "title": "Billets pour un gala de charité"
          },
          "dd19": {
                "title": "Régularisation d’abonnements",
                "text": "Onze abonnements, facturés ensemble."
          },
          "dd26": {
                "title": "Lave-linge en panne"
          },
          "dd27": {
                "title": "Pneus"
          },
          "dd28": {
                "title": "Franchise d’assurance après un petit accident"
          },
          "dd21": {
                "title": "Voyage scolaire",
                "text": "Par enfant. Sans enfant, aucun coût."
          },
          "dd22": {
                "title": "Fête d’anniversaire"
          },
          "dd23": {
                "title": "Appareil dentaire"
          },
          "dd04": {
                "title": "Home cinéma",
                "text": "Un ensemble à six enceintes pour le salon."
          },
          "dd05": {
                "title": "Séjour organisé",
                "text": "Sept nuits, vol et hôtel compris."
          },
          "dd09": {
                "title": "Le tout dernier ordinateur portable",
                "text": "Le modèle actuel. Le vôtre a trois ans."
          },
          "dd13": {
                "title": "Meubles en promotion",
                "text": "Un salon trois pièces, en promotion cette semaine."
          },
          "dd15": {
                "title": "Montre de luxe",
                "text": "Une automatique suisse sur bracelet acier."
          },
          "dd16": {
                "title": "Clubs de golf",
                "text": "Une série complète, ajustée à votre morphologie."
          },
          "dd20": {
                "title": "Achats des fêtes",
                "text": "Des cadeaux pour toute la famille."
          },
          "dd24": {
                "title": "Voiture neuve à crédit",
                "text": "Un apport de 5 000 €, puis 300 € par mois tant que vous la gardez."
          },
          "dd25": {
                "title": "Bateau à crédit",
                "text": "Un apport de 3 000 €, puis 200 € par mois d’amarrage et d’entretien."
          },
          "mk01": {
                "title": "Acheteur pour maisons 3 ch./2 sdb",
                "text": "Une famille en mutation paiera 75 000 € pour chaque maison 3 ch./2 sdb que vous possédez."
          },
          "mk02": {
                "title": "Acheteur pour maisons 3 ch./2 sdb",
                "text": "Un investisseur propose 65 000 € par maison 3 ch./2 sdb."
          },
          "mk03": {
                "title": "Marché tendu sur les maisons 3 ch./2 sdb",
                "text": "Une surenchère. 90 000 € par maison 3 ch./2 sdb."
          },
          "mk04": {
                "title": "Acheteur d’appartements",
                "text": "50 000 € pour chaque appartement que vous possédez."
          },
          "mk05": {
                "title": "Acheteur d’appartements",
                "text": "42 000 € pour chaque appartement que vous possédez."
          },
          "mk06": {
                "title": "Acheteur de maisons à deux logements",
                "text": "32 000 € par logement pour toute maison de deux logements que vous possédez."
          },
          "mk07": {
                "title": "Acheteur d’immeubles — petits logements",
                "text": "40 000 € par logement pour tout immeuble que vous possédez."
          },
          "mk08": {
                "title": "Acheteur institutionnel",
                "text": "Un fonds de pension achète. 55 000 € par logement."
          },
          "mk09": {
                "title": "Offre au rabais sur les immeubles",
                "text": "28 000 € par logement. Vous n’êtes nullement tenu d’accepter."
          },
          "mk10": {
                "title": "Promoteur foncier",
                "text": "3 000 € l’hectare pour tout terrain que vous possédez."
          },
          "mk11": {
                "title": "Terrain reclassé en zone constructible",
                "text": "La commune a reclassé le terrain. 7 400 € l’hectare."
          },
          "mk12": {
                "title": "Acheteur d’entreprise",
                "text": "Un acheteur propose 40 fois le flux mensuel pour toute entreprise que vous possédez."
          },
          "mk13": {
                "title": "Acheteur stratégique",
                "text": "Un concurrent veut vos clients et propose 60 fois le flux mensuel."
          },
          "mk14": {
                "title": "Acheteur pour n’importe quel bien",
                "text": "Un investisseur extérieur propose 30 % au-dessus de votre prix d’achat pour un bien de votre choix."
          },
          "mk15": {
                "title": "Acheteur pour n’importe quel bien — vente rapide",
                "text": "Paiement sous sept jours, mais seulement 15 % au-dessus de votre prix d’achat."
          },
          "mk16": {
                "title": "L’or atteint un record",
                "text": "Les collectionneurs paient 1 200 € la pièce d’or."
          },
          "mk17": {
                "title": "L’or décroche",
                "text": "Les négociants proposent 400 € la pièce. La vente est facultative."
          },
          "mk18": {
                "title": "Un locataire dégrade un logement",
                "text": "Si vous possédez un bien locatif, payez 1 000 € de réparations."
          },
          "mk19": {
                "title": "Réévaluation de la taxe foncière",
                "text": "Payez 200 € pour chaque bien que vous possédez."
          },
          "mk20": {
                "title": "Pertes dues au vol à l’étalage",
                "text": "Payez 500 € pour chaque entreprise que vous possédez."
          },
          "mk21": {
                "title": "Toiture à refaire",
                "text": "Payez 500 € pour chaque bien que vous possédez."
          },
          "mk22": {
                "title": "Les taux d’intérêt restent stables",
                "text": "Rien ne se passe ce mois-ci. Tous les mois ne sont pas mouvementés."
          },
          "mk23": {
                "title": "Le marché est calme",
                "text": "Ni acheteur, ni vendeur, ni nouvelle."
          },
          "mk24": {
                "title": "Tout le monde parle d’un krach",
                "text": "Parler n’est pas transiger. Rien ne se passe."
          }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
