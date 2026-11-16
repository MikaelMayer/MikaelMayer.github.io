// output: raw
let skipws s = replaceFirstIn "^\\s+" s "" in
import {
  regexVar = "^(\\w+)(.*)",
  regexDot = "^(\\.)(.*)",
  regexSlash = "^(\\\\)(.*)",
  regexOpenP = "^(\\()(.*)",
  regexClosP = "^(\\))(.*)",
  constToken = \regex.\name.\s. if(matchIn regex s) [{token=name}, skipws (replaceAllIn regex s "$2")] else []
}._
import {
  dotToken = constToken regexDot "dot",
  slashToken = constToken regexSlash "slash",
  openPToken = constToken regexOpenP "open",
  closPToken = constToken regexClosP "close"
}._
let varToken s = if(matchIn regexVar s) [{token= "var", name=replaceAllIn regexVar s "$1"}, skipws (replaceAllIn regexVar s "$2")] else [] in
let tokenizers = [dotToken, varToken, slashToken, openPToken, closPToken] in
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
tokenize "\\x. y (z x)"