// updatedelay: 0

// If you write prop[number] in the text, it will display this number but it will be proportional to the number of cakes !
// If you write plurs[number] in the text, it will display a "s" if the number is greater than 1 !

  let base = 1000 in
  let temperature = 180 in
  letrec strToInt x = {`1`=1, `2`=2, `3`=3, `4`=4, `5`=5, `6`=6, `7`=7, `8`=8, `9`=9, `0`=0,
  default = \x.
    if(matchIn "^[0-9]+$" x) (
     let last = replaceAllIn "^(.*)(.)$" x "$2" in
     let init = replaceAllIn "^(.*)(.)$" x "$1" in
     (strToInt init)*10 + (strToInt last)
    ) else 0
  }  x in
  let language = "French" in
  let otherLanguage = if(language == "French") "English" else "French" in
  let txt = 
  ({French = ``
  <h1>Moelleux chocolat amandes</h1>
  Recette pour multdivby[20,1000] petits gâteaux.<br>
  Préchauffer le four à @(temperature)° (Celsius)
  <li>multdivby[4,1000] œufifmanys[4,1000]</li>
  <li>multdivby[1,2000] verre de sucre</li>
  <li>multdivby[200,1000]g de chocolat fondu</li>
  <li>multdivby[50,1000]g de poudre d’amande</li>
  <li>multdivby[2,1000] cs d’huile de tournesol</li>
  <li>Cannelle</li>
  <li>Pincée de sel</li>
  Au four pendant 10 minutes dans des moules à cupcakes.<br>
  On peut aussi mettre en déco des amandes effilées, ou remplacer le chocolat par un citron pressé``,
    English = ``
  <h1>Soft chocolate almond cakes</h1>
  Recipe for multdivby[20,1000] small cakes.<br>
  Preheat the oven at @(temperature * !9 / !5 + !32)° Fahrenheit
  <li>multdivby[4,1000] eggifmanys[4,1000]</li>
  <li>multdivby[1,2000] glass of sugar</li>
  <li>multdivby[200,1000]g of melted chocolate</li>
  <li>multdivby[50,1000]g of almond powder</li>
  <li>multdivby[2,1000] tbls of sunflower oil</li>
  <li>Cinnamon</li>
  <li>A pinch of salt</li>
  In the oven for 10 minutes in cupcakes pans.<br>
  One can also put as decoration sliced almonds, or replace chocolate by a squeezed lemon.``
  
  } language) in
  let result = replaceAllIn "(multdivby|ifmany\\w+)\\[(\\d+),(\\d+)\\]" txt (\m.
    let mult = strToInt (m.group 2) in
    let div = strToInt (m.group 3) in
    m.group 1 match {
      case "multdivby" =>
        let res = (base * !mult / !div) in
        if(res < 6) // We take into account 1/2, 1/4 and 3/4 until 5, else it makes no sense, but no more.
          {apply= \base.
             ((base * !mult * !4 / !div) - 4*res) match {
               case 0 => if(res == 0) "<¼" else "" + res
               case 1 => if(res == 0) "¼" else if(res >= 4) "" + res else "" + res + "¼"
               case 2 => if(res == 0) "½" else "" + res + "3/4"
               case 3 => if(res == 0) "¾" else if(res >= 4) "" + res else "" + res + "¾"
             },
           update= \p.
             if(p.outputNew == p.outputOriginal) {value=base} else
             let quantityTimes4 = p.outputNew match {
               case i + "¼" => if(i == "") 1 else 4*(strToInt i) + 1
               case i + "1/4" => if(i == "") 1 else 4*(strToInt i) + 1
               case i + " 1/4" => if(i == "") 1 else 4*(strToInt i) + 1
               case i + "+1/4" => if(i == "") 1 else 4*(strToInt i) + 1
               case i + "½" => if(i == "") 2 else 4*(strToInt i) + 2
               case i + "1/2" => if(i == "") 2 else 4*(strToInt i) + 2
               case i + " 1/2" => if(i == "") 2 else 4*(strToInt i) + 2
               case i + "+1/2" => if(i == "") 2 else 4*(strToInt i) + 2
               case i + "¾" => if(i == "") 3 else 4*(strToInt i) + 3
               case i + "3/4" => if(i == "") 3 else 4*(strToInt i) + 3
               case i + " 3/4" => if(i == "") 3 else 4*(strToInt i) + 3
               case i + "+3/4" => if(i == "") 3 else 4*(strToInt i) + 3
               case i => 4 * (strToInt i)
             } in
             quantityTimes4 * !div / !mult / 4
           } base
        else !"" + res
      case "ifmany" + ending =>
        let res = (base * !mult * !4 / !div) in
        {apply=\x. if(res > 4) ending else "", update = \p. if(p.outputNew == "" && p.outputOriginal == ending) {value=4} else {} } res
    }

    ) in
    ``<button onclick="this.setAttribute('value','@otherLanguage')" value="@language">To @otherLanguage</button><br>`` +
    ({English=``<i>Hint:</i> Use prop[5] for a proportional number 5, plurs[5] to place an s if the quantity (5) is greater than 1.``,
     French=``<i>Astuce:</i> Ecrire prop[5] pour un nombre proportionel 5, plurs[5] pour un 's' conditionel si la quantité 5 est plus grande que 1.``} language) + 
  ({ apply=\x. x ,
    unapply=\output. {
      value = 
        replaceAllIn "(prop\\w*|plur\\w+)\\[(\\d+)\\]" output (\m.
    let amount = strToInt (m.group 2) in
    m.group 1 match {
      case "prop" + _ => "multdivby[" + amount + "," + base + "]"
      case "plur" + plural => "ifmany" + plural + "[" + amount + "," + base + "]"
    }
  )
  } } result)