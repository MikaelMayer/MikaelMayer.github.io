// download: DSL-for-HTML.html
// output: html
letrec convertList list children attrs = list match {
  case [] => {attributes= attrs, children= children}
  case [head] ++ tail =>
    head match {
      case "" + _ =>
        let newChildren =  (children ++ [{ tag = "#text", value = head }]) in
        convertList tail newChildren attrs
      case [] ++ _ =>
        let newList = head++tail in
        convertList newList children attrs
      case {tag=_} =>
        let newChildren =  children ++ [head] in
        convertList tail newChildren attrs
      case {} =>
        let newAttributes = attrs & head in
        convertList tail children newAttributes
      case e => let newList = [head []] ++ tail in
        convertList newList children attrs
    }
    case e => convertList [e] children attrs
} in
letrec ruleToString acc rules = rules match {
  case [] => acc
  case [head] ++ tail =>
     let newAcc = head match {
       case [key, value] => acc + !"\n  " + key + !":" + value + !";"
       case kv => acc + !"\n  " + kv
     } in
     ruleToString newAcc tail
} in
let tag = { default=\tagName. \params. {tag = tagName} & (convertList params [] {}) } in
let style stylesheet =
  letrec style_aux acc stylesheet = stylesheet match {
  case [] => acc
  case [head] ++ tail =>
    let newAcc = acc + (head match {
      case [selector, rules] =>
        selector + !"{" + (ruleToString "" rules) + !"\n}"
    }) in
    style_aux newAcc tail
} in {tag = "STYLE", children=[{tag="#text", value=style_aux "" stylesheet}]} in
let s = { default=\name.\value.[name, value] } in
let rule = { apply= \selector.\rules. [selector, rules], default=\selector.\rules.[selector, rules]} in
let [h1, div, table, b, br, code, abbr,ul,li,h1color] = [tag.H1, tag.DIV, tag.TABLE, tag.B, tag.BR, tag.CODE, tag.ABBR,tag.UL,tag.LI,"blue"] in
{ tag = "DIV", children=[
  style [
    ["h1", [s.color h1color]]
  ],
  h1 ["A ",abbr [{title="Domain-Specific Language"}, "DSL"]," for HTML webpages"],
  div ["The program on the left uses a ",
       abbr [{title="Domain-Specific Language"}, "DSL"],
       " to build more easily HTML webpages.",
       br,
       "It main strength is automatic child detection, so that we can mix:",
       ul [
         li ["text nodes (e.g. ",code "\"text node\"",")"],
         li ["attributes (e.g. ",code "{title=\"Domain-Specific Language\"}",")"],
         li ["child nodes (e.g. ",code "{tag=\"DIV\", ...}",")"],
         li ["Any list of these bullet points."]
       ],
       "If only one argument is given, the square parentheses can be omitted (Look at the usage of ",code "code"," in the code)", br,
       "If the node requires no argument and is child of another node, the arguments list alltogether can be omitted (Look at ",code "br"," in the code)",br,
       "The styling is computed using a ", code "style", " function, which converts the pyramid of arrays to a local style. For example, the color of the title is ["+h1color+"], change it inside the square brackets!",br,
       "Note also that we discourage the use of such DSL because they are very slow to update."
  ]
]}