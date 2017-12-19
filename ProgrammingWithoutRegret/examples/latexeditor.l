//output: html
//hideprogram: true
//download: latex-to-html.html

letrec strToInt x = {`1`=1, `2`=2, `3`=3, `4`=4, `5`=5, `6`=6, `7`=7, `8`=8, `9`=9, `0`=0,
default = \x.
  extractFirstIn "^(.*)([0-9])$" x match {
    case {value=[init, last]} => (strToInt init)*10 + (strToInt last)
    case {} => 0
  }
}  x in
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
  let newCounter = opts.sectionCounter + !1 in
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
  `\LaTeX` =
    { arity = 0
    , toHtml = \toHtml.\opts.\arg.
      [{tag="span", attributes={class="latex"}, children = ``L<sup>a</sup>T<sub>e</sub>X``}, opts]
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
  `\ldots` = {arity = 0, toHtml = \toHtml.\opts.\arg. [{tag="span", children=[{tag = "#text",
 value = "…"}]}, opts]},
  `\newcommand` =
    let extractCommand  = \block.block match {
      case {tag="command", name=cmdName} => {value = cmdName}
      case {tag="block", children=[{tag="command", name=cmdName}]} => {value = cmdName}
      case _ => {}
    } in
    { inspect = \rightArgs. // Returns the arguments to the command and the remaining that it does not parse.
      rightArgs match {
        case [cmdOpt] ++ rem =>
          extractCommand cmdOpt match {
            case {value= cmdName} => rem match {
              case [{tag="rawtext", value=text}, definition] ++ rem =>
                extractFirstIn ``\[(\d+)\]`` text match {
                  case {value = [d]} => [[cmdName, strToInt d, definition], rem]
                  case {} => [["Expected [number] for the number of arguments, got " + text], rightArgs]
                }
              case [definition] ++ rem =>
                [[cmdName, 0, definition], rem]
              case _ => [["Expected \\newcommand{"+cmdName+"}[optional num args]{definition}"], rightArgs]
            }
            case {} =>  [["No command name after \\newcommand, from " + log "" cmdOpt], rightArgs]
          }
      }
    , toHtml = \toHtml.\opts.\arg.
      if(arg.length == 1) [htmlError (arg 0) "???", opts] else (
        let [cmdName, arity, definition] = arg in
        let newOpts = opts & { customCommands = opts.customCommands &
          record cmdName
            { arity = arity,
              toHtml = \toHtml.\opts.\arg.
                // Perform the replacement of #1 with argument 1, #2 with argument 2, and so on.
                // For now, just output the definition.
                let [argHtml, newOpts] = toHtml opts [definition] in
                [argHtml, newOpts]
            }
          } in
        [{tag="span", attributes={class="newcommand"}}, newOpts]
      )
    },
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
      let cmddef = (commands & state.customCommands) cmdname in
      let [args, remainder] = cmddef match {
        case {arity=n} =>
          splitAt n rem
        case {inspect=inspect} =>
          inspect rem
      } in
      let [toAdd, newState] = cmddef.toHtml toHtmlWithoutRefs state args in
      let newAcc = acc ++ [toAdd] in
      aux newState newAcc remainder

    case [{tag="linecomment", value=value}] ++ rem =>
      let newAcc = acc ++ [{tag="span", styles={background="#888", color="#FFF"}, children = [{tag="#text", value="(" + value + ")"}]}] in
      aux state newAcc rem
  } in 
  aux state [] tree in
let initOptions = {
  customCommands = {},
  currentLabelValue= !"0",
  sectionCounter= !0,
  subsectionCounter= !0 } in
let toHtml x =
  let [raw, opts] = toHtmlWithoutRefs initOptions x in
  letrec replaceReferences tree = tree match {
    case [head] ++ tail => [replaceReferences head] ++ (replaceReferences tail)
    case [] => []
    case {tag="ref",value=refname} => let txt = opts ("label-" + refname) in
      let replaceKey = {
        apply = \refname,txt. log ``refname = @refname, txt= @txt`` txt,
        update = \p. // Lookup for the reference in the options.
          let [oldRefname, oldTxt] = p.input in
          let newText = p.outputNew in
          letrec traverse keys = keys match {
            case [] => {} // No solution, cancel update.
            case [x & ("label-" + newRefname)] ++ tail =>
              if(opts x == newText)
                {value = [newRefname, oldTxt]}
              else traverse tail 
            case [_] ++ tail => traverse tail
          } in
          traverse (keysOf opts)
      } in
      {tag="span", attributes={class="reference", onclick="if(window.location.hash=='') window.location.hash = '" + refname + "';"}, children=[{tag="#text", value = replaceKey [refname, txt]}]}
    case {children=c} => tree & {children = replaceReferences c}
    case _ => tree
  } in
  replaceReferences raw in
let latex = ``\newcommand{\small}{mini}
\section{\LaTeX{} editing in Html}\label{sec:introduction}
This \small{} \LaTeX{} editor is \textit{bidirectional} and supports \small{} \textbf{textual} changes. Rename '\small{}' to 'lightweight' to see\ldots
\section{It supports reference update}\label{sec:commands}
This editor features a subset of \LaTeX{} commands, for example references.
Section \ref{sec:introduction}.
Change the previous number to 2 or 2.1. See how it updates the source code.

\subsection{Others}\label{others}
%TODO support more commands.`` in
[
{tag="style", attributes={type="text/css"}, children=``
#content {
  font-family: 'Computer Modern Serif';
}
#content h1 {
  font-size: 24px;
  margin-top: 10px;
}
#content h2 {
  font-size: 18px;
  margin-top: 10px;
}

.tex sub, .latex sub, .latex sup {
  text-transform: uppercase;
}

.tex sub, .latex sub {
  vertical-align: 0ex;
  margin-left: -0.1667em;
  margin-right: -0.125em;
}

.tex, .latex, .tex sub, .latex sub {
  font-size: 1em;
}

.latex sup {
  font-size: 0.85em;
  vertical-align: -0.3em;
  margin-left: -0.36em;
  margin-right: -0.15em;
}
``},
{tag="textarea", attributes = {onchange="this.textContent = this.value"}, styles={`font-family`="monospace", width="100%", `min-height` = "200px"}, children = [{tag="#text", value = latex}]},
  {tag="div", attributes={id="content"}, children=
toHtml 
  (parse (tokens latex)) }]
