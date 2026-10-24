//output: html
let splitAt n array =
  letrec aux acc n array =
    if(n == 0) [acc, array]
    else array match {
      case [] => [acc, array]
      case [head]++tail => 
        let newAcc = acc ++ [head] in
        let newN = n - 1 in
        aux newAcc newN tail
    } in aux [] n array in
let tokenize txt pos = if(txt == "") [{tag="EOF", pos = pos}] else txt match {
  case "\\" + rem => rem match {
    case "\\" + rem =>
      [{tag="newline", pos=pos}, rem, pos + 2]
    case _ =>
      extractFirstIn ``^(\\\w+)\b([\s\S]*)`` txt match {
        case {value=[command, remainder]} =>
          [{tag="command", name=command, pos=pos}, remainder, pos + command.length + 1]
        case _ =>
          [{tag="error", pos=pos, value="Expected a command after \\, got " + txt}]
      }
       
  }
  case "%" + rem =>
    extractFirstIn "^(.*(?:\r?\n|$))([\\s\\S]*)" rem match {
      case {value=[comment, remainder]} =>
        [{tag="linecomment", value=comment, pos=pos}, remainder, pos + comment.length + 1]  
    }    
  case "{" + rem =>
    [{tag="open", pos=pos}, rem, pos + 1]
  case "}" + rem =>
    [{tag="close", pos=pos}, rem, pos + 1]
  case "$" + rem =>
    extractFirstIn "^([^\\$]+)\\$([\\s\\S]*)" rem match {
      case {value = [equation, remainder]} => 
      let equation = replaceFirstIn "^([^\\$]+)\\$[\\s\\S]*" rem "$1" in
      let remainder = replaceFirstIn "^([^\\$]+\\$)" rem "" in
      [{tag="equation", pos = pos + 1, value=equation}, remainder, pos + equation.length + 1]
      case _ =>
      [{tag="error", pos = pos + 1, value="Unclosed equation"}]
    }
  case _ =>
    extractFirstIn "^([^\\\\\\{\\}\\$%]+)([\\s\\S]*)" txt match {
      case {value = [rawtext, remainder]} =>
      [{tag="rawtext", value=rawtext, pos = pos}, remainder, pos + rawtext.length]
      case _ =>
      [{tag="error", pos = pos, value="Expected text, got " + txt}]
    }
} in
let tokens txt =
  letrec aux txt acc pos =
  tokenize txt pos match {
    case [t & {tag="EOF"}] => acc ++ [t]
    case [{tag="error", pos = pos, value = value}] => value + " at pos " + pos + ":" + txt
    case [t, rem, newPos] =>
      let newAcc = acc ++ [t] in
      aux rem newAcc newPos
  } in
  aux txt [] 0 in
let parse tokens = // Group blocks together.
  letrec aux acc tokens =
    tokens match {
    case [] => [acc, tokens]
    case [{tag="EOF"}] => [acc, []]
    case [{tag="close"}] ++ rem => 
      [acc, tokens]
    case [x & {tag="open"}] ++ rem =>
      aux [] rem match {
        case [res, rem] =>
          rem match {
            case [{tag="close"}] ++ r2 =>
              let newAcc = acc ++ [{tag="block", children=res}] in
              aux newAcc r2
            case _ =>
              [{tag="error", value="Unclosed { at " + x.pos }]
          }
        case x => x
      }
    case [x] ++ rem =>
      let newAcc = acc ++ [x] in
      aux newAcc rem
  } in aux [] tokens 0 in
let incSectionCounter opts = 
  let newCounter = opts.sectionCounter + 1 in
  opts & { sectionCounter = newCounter} & { currentLabelValue = !"" + newCounter } in
let incSubsectionCounter opts = 
  let newCounter = opts.subsectionCounter + 1 in
  opts & { subsectionCounter = newCounter} & { currentLabelValue = !"" + opts.sectionCounter + "." + newCounter } in
let htmlError help display= {tag="span", styles={color="red"}, attributes={title=help},
  children=display match { case "" + d => [{tag="#text", value=d}] case {} => [display] case [] ++ d => display}} in
let commands = {
  `\label` =
    { arity = 1
    , toHtml = \toHtml.\opts.\arg. arg match {
      case [{tag = "block", children = [{tag = "rawtext", value = v}]}] =>
        [{tag="span", attributes={id = v}},
        opts & (record ("label-" + v) opts.currentLabelValue)
        ]
      case _ => 
        let [argHtml, newOpts] = toHtml opts arg in
      [htmlError "\\label must be followed by a {name}" argHtml, newOpts]
      }
    },
  `\ref` =
    { arity = 1
    , toHtml = \toHtml.\opts.\arg. arg match {
      case [{tag = "block", children = [{tag = "rawtext", value = v}]}] =>
        [{tag="ref", value=v}, opts]
      case _ => 
        let [argHtml, newOpts] = toHtml opts arg in
      [htmlError "\\label must be followed by a {name}" argHtml, newOpts]
      }
    },
  `\section` = 
    { arity= 1
    , toHtml = \toHtml.\opts.\arg.
      let newOpts = incSectionCounter opts in
      let [argHtml, newOpts2] = toHtml newOpts arg in
      [{tag="h1", children=[{tag="#text", value=newOpts2.currentLabelValue + ". "}] ++ argHtml},
        newOpts2]},
  `\subsection` = 
    { arity= 1
    , toHtml = \toHtml.\opts.\arg.
      let newOpts = incSubsectionCounter opts in
      let [argHtml, newOpts2] = toHtml newOpts arg in
      [{tag="h2", children=[{tag="#text", value=newOpts2.currentLabelValue + ". "}] ++ argHtml},
        newOpts2]},
  `\textbf` =
    { arity = 1
    , toHtml = \toHtml.\opts.\arg.
      let [argHtml, newOpts] = toHtml opts arg in
      [{tag="b", children = argHtml}, newOpts]},
  `\textit` =
    { arity = 1
    , toHtml = \toHtml.\opts.\arg.
      let [argHtml, newOpts] = toHtml opts arg in
      [{tag="i", children = argHtml}, newOpts]},
  default = \x.
    { arity = 0
    , toHtml = \toHtml.\opts.\arg.
    [htmlError "Unknown Command" x, opts]}
} in
letrec toHtmlWithoutRefs state tree =
  letrec aux state acc tree = tree match {
    case [] => [acc, state]
    case [{tag="block", children=children}] ++ rem => let newTree = children ++ rem in
      aux state acc newTree
    case [{tag="rawtext", value=text}] ++ rem => let newAcc = acc ++ [{tag="#text",value=text}] in
      aux state newAcc rem
    case [{tag="command", name=cmdname}] ++ rem =>
      commands cmdname match {
        case {arity=n, toHtml=fun} =>
          let [args, remainder] = splitAt n rem in
          let [toAdd, newState] = fun toHtmlWithoutRefs state args in
          //let debug = console.log newState in
          let newAcc = acc ++ [toAdd] in
          aux newState newAcc remainder
      }
    case [{tag="linecomment", value=value}] ++ rem =>
      let newAcc = acc ++ [{tag="span", styles={background="#888", color="#FFF"}, children = [{tag="#text", value="(" + value + ")"}]}] in
      aux state newAcc rem
  } in 
  aux state [] tree in
let initOptions = {
  currentLabelValue="0",
  sectionCounter=0,
  subsectionCounter=0 } in
let toHtml x =
  let [raw, opts] = toHtmlWithoutRefs initOptions x in
  letrec replaceReferences tree = tree match {
    case [head] ++ tail => [replaceReferences head] ++ (replaceReferences tail)
    case [] => []
    case {tag="ref",value=refname} => let txt = opts ("label-" + refname) in
      let replaceKey = {
        apply = \refname,txt. txt,
        update = \p. // Lookup for the reference in the options.
          let [refname, txt] = p.input in
          let newRef = p.outputNew in
          letrec traverse keys = keys match {
            case [] => {} // No solution, cancel update.
            case [head] ++ tail =>
              head match {
                case "label-" + labelname =>
                  if(opts head == newRef) {
                    {value = [head, txt]}
                  } else {
                    traverse tail
                  }
              }
          } in
          traverse (keysOf opts)
      }
      {tag="span", attributes={class="reference", onclick="window.location.hash = '" + refname + "'"}, children=[{tag="#text", value = replaceKey [refname, txt]}]}
    case {children=c} => tree & {children = replaceReferences c}
    case _ => tree
  } in
  replaceReferences raw in
let latex = ``\section{Introduction}\label{sec:introduction}
This is an \textit{introduction} to this paper. In section \ref{sec:motivation}, we will motivate it. % TODO: Please continue
\section{Motivation}\label{sec:motivation}
This section is self-motivating.
`` in
[{tag="textarea", attributes = {onchange="this.textContent = this.value"}, styles={`font-family`="monospace", width="100%", `min-height` = "150px"}, children = [{tag="#text", value = latex}]},
toHtml 
(parse (tokens latex))]
