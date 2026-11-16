// download: universal-numbers.html
// output: html
let [lengthStr, alphabetArray] = [!"0" + "0000000", ["L","A","R"]] in
let [nbDigits, alphabet] = [lengthStr.length.toString, join alphabetArray ""] in
let universal_number lengthStr =
  let alphabetSizeStr =
    letrec aux acc a = a match { case [] => acc case [head]++tail => aux (acc + "#") tail} in
    aux "" alphabetArray in
  let stringRepeat sequence size =
    letrec aux acc sz = sz match {
      case "#" + tail => aux (acc + sequence) tail
      case "" => acc
    } in aux "" size in
  let times sequence sizeBinary =
    letrec string_aux acc sizeB = sizeB match {
      case "" => acc
      case "0" + tail =>
        let newAcc = stringRepeat acc alphabetSizeStr in
        string_aux newAcc tail
      case "1" + tail =>
        let newAcc = stringRepeat acc alphabetSizeStr + sequence in string_aux
        newAcc tail
    } in
    string_aux "" sizeBinary in
  let numabBin = ("1" + replaceFirstIn "." lengthStr "") in
  let numab = (times "#" numabBin).length in
  let init =
    letrec aux acc letterList =
      letterList match {
        case [] => acc
        case [head] ++ tail => aux (acc + (times head numabBin)) tail
      } in
    aux "" alphabetArray
  in
  let repeatedPrefix = "^.{" + numab.toString + "}" in
  let positionNext posStr =
    letrec aux acc pos =
      if(matchIn repeatedPrefix pos) (
        let newPos = replaceFirstIn repeatedPrefix pos "" in
        let newAcc = acc + "#" in
        aux newAcc newPos
      ) else (
        acc + (letrec k a l = l match { case "#" + tail => k (a + pos) tail case "" => a } in k "" alphabetSizeStr)
      )
    in aux "" posStr in
  let init0 = replaceAllIn "." init "0" in
  letrec cycle startStr currentStr state acc =
    let newCurrentStr = positionNext currentStr in
    let newCurrentStrLength = newCurrentStr.length.toString in
    let newAcc = acc + (
      replaceFirstIn ("^.{" + currentStr.length.toString + "}(.).*$") init "$1"
    ) in
    let newState = replaceFirstIn ("^(.{"+newCurrentStrLength+ "," +newCurrentStrLength +"}).") state (\m. (m.group 1) + "1") in
    if (matchIn ("^" + startStr + "$") newCurrentStr) (
      [newState, newAcc]
    ) else (
      cycle startStr newCurrentStr newState newAcc
    ) in
  letrec loop state acc =
    if (matchIn "^1*$" state)
      acc
    else (
      let startPos = replaceAllIn "." (replaceFirstIn "^(1*)0.*$" state "$1") "#" in
      let [newState, newAcc] = cycle startPos startPos state acc in
      loop newState newAcc
    ) in
  let debrujin = loop init0 "" in
  let lm1 = (replaceFirstIn "." lengthStr "").length.toString in
  debrujin + (replaceFirstIn ("^(.{"+lm1+"}).*$") debrujin "$1") in
[ {tag = "h1", children="Finite Universal Numbers"},
"This program serves as an example of creating a page that is way longer than the code used to produce it. If you download it, you will see that its size is almost constant, regardless on the size of the sequence displayed below.",
{tag="br"},{tag="br"},
"One of the smallest sequences on " + !"<code>"+alphabet+!"</code>" + " containing all " +
nbDigits + "-digit sequences has length ",
let u = universal_number lengthStr in [u.length.toString, " and is given below. The computation implements the idea given in the wikipedia article <a href=\"https://en.wikipedia.org/wiki/De_Bruijn_sequence#Construction\">De Bruijn Sequence</a>. To test the validity of this claim, press <kbd>CTRL+F</kbd> and look for any sequence of " +
nbDigits + " characters among " + !"`" + alphabet + !"`.",
{tag = "br"},
{tag = "code", children = u}]]