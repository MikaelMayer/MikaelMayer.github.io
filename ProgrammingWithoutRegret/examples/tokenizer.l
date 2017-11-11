// output: raw
let regexVar = "^(\\w+)(.*)" in
let regexDot = "^\\.(.*)" in
let skipws s = replaceFirstIn "^\\s+" s "" in
let dotToken s = if(matchIn regexDot s) [{token="dot"}, skipws (replaceAllIn regexDot s "$1")] else [] in
let varToken s = if(matchIn "^\\w" s) [{token= "var", name=replaceAllIn regexVar s "$1"}, skipws (replaceAllIn regexVar s "$2")] else [] in
let tokenizers = [dotToken, varToken] in
letrec tokenizer tmp_tokenizers s = s match {
  case "" => []
  case k => tmp_tokenizers match {
    case [] => "Could not tokenize " + s
    case [tk] ++ tail => (tk s) match {
      case [] => tokenizer tail s
      case [token, rest] => [token] ++ tokenizer tokenizers rest
    }
  }
} in
let tokenize = tokenizer tokenizers in
tokenize "x. y z"