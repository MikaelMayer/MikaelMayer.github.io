let result =

   "Hello world"


in
let [w1, w2] = result match {
  case w1m + "world" => [w1m, "world"]
  case "Hello " + w2m => ["Hello ", w2m]
  case out =>
    let regex = "^((?:H(?:e(?:l(?:l(?:o(?: )?)?)?)?)?)?)(.*?)((?:(?:(?:(?:(?:w)?o)?r)?l)?d)?)$" in
    let left = replaceAllIn regex out "$1" in
    let middle = replaceAllIn regex out "$2" in
    let right = replaceAllIn regex out "$3" in
    [left + middle, right]
} in
\x. w1 + w2