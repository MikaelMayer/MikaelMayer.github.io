// Applies a necklace-base shift register method to compute the de Bruijn sequence of length given by the length of the string "000" below.
let regexSmaller s =
  letrec regexSmaller_aux s = s match {
    case "" => ""
    case "0" + tail => "(?:0" + regexSmaller_aux  tail + ")"
    case "1" + tail => "(?:0.*|1" + regexSmaller_aux tail + ")"
  } in "^" + regexSmaller_aux s + "$"
in
let ge a b = matchIn (regexSmaller a) b in
let necklace s = 
  letrec necklace_aux current best =
    let newCurrent = replaceAllIn "^(.)(.*)$" current "$2$1" in
    let newBest = if(ge best newCurrent) newCurrent else best in
    if (matchIn s newCurrent)
      newBest
    else
      necklace_aux newCurrent newBest in
  necklace_aux s s in
let isNecklace s = matchIn (necklace s) s in
let next current =
  let shifted = replaceFirstIn "^(.)(.*)$" current (\m.(m.group 2) + "1") in
  if(isNecklace shifted)
      replaceFirstIn "^(.)(.*)$" current (\m.(m.group 2) + ((m.group 1) match {
  case "0" => "1" case "1" => "0" })) else
      replaceFirstIn "^(.)(.*)$" current "$2$1" in
let debruijn start =
  letrec daux current acc =
    let newCurrent = next current in
    let newAcc = acc + replaceAllIn "^(.).*$" current "$1"  in
    if (matchIn start newCurrent) newAcc + (replaceAllIn "^(.*).$" newCurrent "$1") else (
      daux newCurrent newAcc
    )
  in daux start "" in
debruijn "00000"