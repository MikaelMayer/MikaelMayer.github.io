letrec take n array =
  if(n==array.length) array else (array match {
    case [] => array
    case init ++ [last] =>
      take n init
  }) in
letrec drop n array =
  if(n==0) array else (array match {
    case [] => array
    case [head] ++ tail =>
      let newN = n- 1 in
      drop newN tail
  }) in
let map = (\f. {
  apply= \input.
  letrec map_aux = {
    apply = \l. l match {
      case [head] ++ tail => [f head] ++ (map_aux tail)
      case [] => []
    } /*,
    unapply = \lOut.(lOut match {
      case [] => {value = []}
      case [f head] ++ (map_aux tail) => {value = [head] ++ tail }
      case _ => {}
    }) */
  } in map_aux input,
  updateAlign = \m.
    let [input, index, deleted, inserted] = [m.input, m.insertionIndex, m.deletedCount, m.inserted] in
    let updateIndex = if(index == input.length) index - 1 else index in
    letrec aux acc inserted = inserted match {
      case [] =>
        { value = take index input ++ acc ++ drop (index+deleted) input }
      case [head] ++ tail =>
        (update f (input updateIndex) head) match {
          case {value=v} => aux (acc ++ [v]) tail
          case _ => {}
        }
    } in aux [] inserted
}) in
let filter f list = 
  letrec aux acc list = list match {
  case [] => acc
  case [head] ++ tail => 
    if(f head) aux (acc ++ [head]) tail
    else aux acc tail
 } in aux [] list in
let option = {apply=\value,selected,content. {tag= "option", attributes={value=value} & (if(selected) {selected="selected"} else {}), children=content},
unapply=\t. (t match {
  case {attributes={value=value,selected=_}, children=content} => {value = [value, true, content] }
  case {attributes={value=value},children=content} =>
   {value = [value, false, content] }
  case _ => {}
}) } in
let select array = {
  apply=\index.
   letrec aux acc i options = options match {
     case [] => acc
     case [opt] ++ tail =>
       let newAcc = acc ++ [option [i + "", i == index, opt]] in
       let newI = i + 1 in
       aux newAcc newI tail
   } in
  {tag="select", attributes={`selected-index`=index + "", onchange="this.setAttribute('selected-index', this.selectedIndex)"}, children= aux [] 0 array}
} in
let sum l =
  letrec aux c l = l match {
    case [] => c
    case [head] ++ tail => aux (c + head) tail
  } in aux 0 l in
let zipWithIndex l = 
  letrec aux acc i l = l match {
    case [] => acc
    case [head] ++ tail => aux (acc ++ [[head, i]]) (i+1) tail
  } in aux [] 0 l in
letrec range min max = if(min == max) [min] else 
  [min] ++ range (min + 1) max in
let joueurs = [
  {name="Mikaël", betselfs=[], scores=[]}, // Each element of betselfs is a 2-element array containing the best and the own card number
  {name="Erwin", betselfs=[], scores=[]},
  {name="Laurent", betselfs=[], scores=[]}
] in
let currentRound = (joueurs 0).scores.length in
let allbetsdone = sum (map (\j. if(j.betselfs.length == currentRound) 0 else 1) joueurs) == (joueurs.length - 1) in
let betself i =
{ apply= \player.
    ["C'est à " + player.name + " de parier!",{tag="br"},
     "Numéro de ta carte ? ", 0,
     "<br>Numéro de ton pari ? ", 0,
     "<br>Je confirme: ", false],
  update= \r. r.outputNew match {
   case [_, _, _, card, _, bet, _, confirm] =>
     if(confirm) (
       {value={name=r.input.name, betselfs=r.input.betselfs ++ [[bet, card]], scores=r.input.scores}}
     ) else {value=r.input}
}} (joueurs i)
in
let nomDe = (\j. {tag="li", children=j.name}) in
let joueursnoms = map nomDe joueurs in 
let joueursEnCours = filter (\j. j.betselfs.length == currentRound ) joueurs in
let joueurEnCoursIndex = 0 in
let joueurFromName name =
  (filter (\j. j.name == name) joueurs) 0 in
let joueurIndexFromName name =
  letrec aux i = 
    if((joueurs i).name == name) i else
    if(i >= joueurs.length) -1 else
    aux (i + 1) in aux 0 in
[{tag="h1", children="Feuille de jeu Dixit"},
"Pour jouer au Dixit, entrez ci-dessous le nom des "+joueurs.length+" joueurs:",
map nomDe joueurs,
"Nous sommes au tour " + (currentRound+1) + ".<br>",
"Scores actuels:<br>",
map (\j. j.name + ": " + !(sum (j.scores)) + "<br>") joueurs,
if(allbetsdone)
  let joueursWithIndex = zipWithIndex joueurs in
  let dealerIndex = (filter (\j.(j 0).betselfs.length == currentRound) joueursWithIndex) 0 1 in
  let totalNumCards = sum (range 1 joueurs.length) in
  let totalInCards = sum (map (\j. if(j.betselfs.length == currentRound + 1) (j.betselfs currentRound) 1 else 0) joueurs) in
  let correctCard = totalNumCards - totalInCards in
  let nGuessedOk = sum (map (\j. if(j.betselfs.length == currentRound + 1 && j.betselfs currentRound 0 == correctCard) 1 else 0) joueurs) in
  let joueursAyantVotePour nCarte = sum (map (\j. if(j 1 == dealerIndex) 0 else if((j 0).betselfs currentRound 0 == nCarte) 1 else 0) joueursWithIndex) in
  let scoreIncrementRaw =     
    map (\j.  let [joueur, index] = j in
    [joueur,
       if(index == dealerIndex)
         if(nGuessedOk == 0 || nGuessedOk == joueurs.length - 1) 0 else 3
       else (
         let [bet, self] = (j 0).betselfs currentRound in
         (if(nGuessedOk == 0 || nGuessedOk == joueurs.length - 1) 2 else (
           if (bet == correctCard) 3 else 0)) +
           joueursAyantVotePour self)]) joueursWithIndex in
{ apply = \joueurs.
[
  "Les paris sont faits ! voici les résultats de ce tour:",{tag="br"},
   "Le dealer était " + (joueurs dealerIndex).name + ", sa carte était la " + correctCard, {tag = "br"}, nGuessedOk + " l'ont correctement devinée", {tag="br"},
   map (\j. [(j 0).name + ": +" + (j 1), {tag="br"}]) scoreIncrementRaw,
  "Tour suivant:", false
], update = \r. r.outputNew match {
    case init ++ [next] =>
      if(next) (
        {value = map (\j.
           let [{name = n, betselfs = b, scores = s}, increment] = j in
           {name = n,
            betselfs = if(b.length <= currentRound) b ++ [[0, 0]] else b,
            scores = s ++ [increment]} ) scoreIncrementRaw
        }
      ) else {}
  }
} joueurs
else [
"Qui parie actuellement?", select (map (\j. j.name) joueursEnCours) joueurEnCoursIndex, {tag="br"},
betself (joueurIndexFromName (joueursEnCours joueurEnCoursIndex).name)
]
]