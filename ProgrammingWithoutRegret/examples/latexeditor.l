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
let tokenize txt pos = if(txt == "") [{tag="EOF", pos = pos, origText = ""}] else txt match {
  case "\\" + rem => rem match {
    case "\\" + rem =>
      extractFirstIn ``(\\\\)([\s\S]*)`` txt match {
        case { value = [bs, rem] } =>
          [{tag="newline", pos=pos, origText = bs}, rem, pos + 2]
      }
    case _ =>
      extractFirstIn ``^((\\\w+\b|\\.)\s*)([\s\S]*)`` txt match {
        case {value=[commandspace, command, remainder]} =>
          [{tag="command", name=command, pos=pos, origText = commandspace}, remainder, pos + commandspace.length]
        case _ =>
          [{tag="error", pos=pos, value="Expected a command after \\, got " + txt}, rem, pos + 1]
      }
       
  }
  case "%" + rem =>
    extractFirstIn "^(%(.*(?:\r?\n|$)))([\\s\\S]*)" txt match {
      case {value=[percentcomment, comment, remainder]} =>
        [{tag="linecomment", value=comment, pos=pos, origText=percentcomment}, remainder, pos + percentcomment.length]  
    }
  case "{" + rem =>
    [{tag="open", pos=pos, origText=(extractFirstIn ``^(\{)([\s\S]*)`` txt).value 0}, rem, pos + 1]
  case "}" + rem =>
    [{tag="close", pos=pos, origText=(extractFirstIn ``^(\})([\s\S]*)`` txt).value 0}, rem, pos + 1]
  case "$" + rem =>
    [{tag="equationdelimiter", pos=pos, origText=(extractFirstIn ``^(\$)([\s\S]*)`` txt).value 0}, rem, pos + 1]
  case "#" + rem =>
    extractFirstIn ``^(#(\d))([\s\S]*)`` txt match {
      case {value = [original, integer, rem]} =>
        [{tag="replacement", pos = pos, nth = strToInt integer, origText = original}, rem, pos + 2]
      case {} => 
        [{tag="error", pos = pos + 1, value="Expected number after #"}, rem, pos + 1]
    }
  case "^" + rem =>
    [{tag="command", name="^", pos=pos, origText=(extractFirstIn ``^(\^)([\s\S]*)`` txt).value 0}, rem, pos + 1]
  case "_" + rem =>
    [{tag="command", name="_", pos=pos, origText=(extractFirstIn ``^(_)([\s\S]*)`` txt).value 0}, rem, pos + 1]
  case _ =>
    extractFirstIn ``^(\r?\n\r?\n\s*)([\s\S]*)`` txt match {
      case {value = [rawspace, remainder]} =>
        [{tag="newpar", origText = rawspace}, remainder, pos + rawspace.length]
      case _ =>
        extractFirstIn ``^((?:(?!\r?\n\r?\n)[^\\\{\}\$%\^_#])+)([\s\S]*)`` txt match {
          case {value = [rawtext, remainder]} =>
          [{tag="rawtext", value=rawtext, pos = pos, origText = rawtext}, remainder, pos + rawtext.length]
          case res =>
          [{tag="error", pos = pos, value="Expected text, got " + txt}]
        }
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
  letrec aux opts acc tokens =
    tokens match {
    case [] => [opts, acc, tokens]
    case [{tag="EOF"}] => [opts, acc, []]
    /*case [{tag="equationdelimiter"}] ++ rem =>
      if(opts.equationmode) 
        let newOpts = opts & {equationmode = false} in
        [newOpts, acc, tokens]
      else
        let newOpts = opts & {equationmode = true} in
        aux newOpts acc rem match { // Parse the equation
          case [newOpts2, newAcc, rem2] => // Normally rem2 should be a 
        }*/
        
    case [{tag="close"}] ++ rem => 
      [opts, acc, tokens]
    case [x & {tag="open"}] ++ rem =>
      aux opts [] rem match {
        case [newOpts, res, rem] =>
          rem match {
            case [{tag="close"}] ++ r2 =>
              let newAcc = acc ++ [{tag="block", children=res}] in
              aux newOpts newAcc r2
            case _ =>
              [{tag="error", value="Unclosed { at " + x.pos }]
          }
        case x => x
      }
    case [x] ++ rem =>
      let newAcc = acc ++ [x] in
      aux opts newAcc rem
  } in aux { equationmode = false} [] tokens 1 in
let incSectionCounter opts = 
  let newCounter = opts.sectionCounter + !1 in
  opts & { sectionCounter = newCounter} & { currentLabelValue = !"" + newCounter } in
let incSubsectionCounter opts = 
  let newCounter = opts.subsectionCounter + 1 in
  opts & { subsectionCounter = newCounter} & { currentLabelValue = !"" + opts.sectionCounter + "." + newCounter } in
let htmlError help display= {tag="span", styles={color="red"}, attributes={title=help},
  children=display match { case "" + d => [{tag="#text", value=d}] case {} => [display] case [] ++ d => display}} in
let htmlWrapper htmlArgsWrapper =
    { arity = 1
    , toHtml = \toHtml.\opts.\args.
      let [argsHtml, newOpts] = toHtml opts args in
      [htmlArgsWrapper argsHtml, newOpts]} in
let htmlConst html =
    { arity = 0,
    toHtml = \toHtml.\opts.\arg. [html, opts]} in
let newcommandinstantiate args =
  letrec aux html = (log "result" ((log "newcommandinstantiate" html) match {
    case {tag="block", children=c} =>
      html & { children = aux c }
    case {tag="replacement", nth=n} =>
      if(n <= args.length)
        args (n - 1)
      else
        html
    case [head] ++ tail =>
      [aux head] ++ aux tail
    case _ => html
  })) in aux in
let commands = {
/*  `\noindent` = // negative space.
    { arity = 0
    , toHtml = \toHtml.\opts.\arg. [{tag="span", attributes=},*/
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
      let newOpts = incSectionCounter opts & {indent = false, newline = false} in
      let [argHtml, newOpts2] = toHtml newOpts arg in
      [{tag="h1", children=[{tag="#text", value=newOpts2.currentLabelValue + ". "}] ++ argHtml},
        newOpts2 & {indent = true}]},
  `\subsection` = 
    { arity= 1
    , toHtml = \toHtml.\opts.\arg.
      let newOpts = incSubsectionCounter opts & {indent = false, newline = false} in
      let [argHtml, newOpts2] = toHtml newOpts arg in
      [{tag="h2", children=[{tag="#text", value=newOpts2.currentLabelValue + ". "}] ++ argHtml},
        newOpts2 & {indent = true}]},
  `\textbf` = htmlWrapper (\argsHtml. {tag="b", children=argsHtml}),
  `\textit` = htmlWrapper (\argsHtml. {tag="i", children=argsHtml}),
  `\textsc` = htmlWrapper (\argsHtml. {tag="span", styles={`font-variant` = "small-caps"}, children=argsHtml}),
  `\ldots` = htmlConst {tag="span", children=[{tag = "#text",
 value = "…"}]},
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
    , toHtml = \toHtml.\opts.\args.
      if(args.length == 1) [htmlError (args 0) "???", opts] else (
        let [cmdName, arity, definition] = args in
        let newOpts = opts & { customCommands = opts.customCommands &
          record cmdName
            { arity = arity,
              toHtml = \toHtml.\opts.\args.
                // Perform the replacement of #1 with argument 1, #2 with argument 2, and so on.
                // For now, just output the definition.
                let instantiatedDefinition = newcommandinstantiate args definition in
                let [argHtml, newOpts] = toHtml opts [instantiatedDefinition] in
                [argHtml, newOpts]
            }
          } in
        [{tag="span", attributes={class="newcommand"}}, newOpts]
      )
    },
  `\frac` =
  { arity = 2
  , toHtml = \toHtml.\opts.\arg.
      if(opts.mathmode) 
        let [arg1html, newOpts1] = toHtml opts     [arg 0] in
        let [arg2html, newOpts2] = toHtml newOpts1 [arg 1] in
        [{tag="div", attributes={class="fraction"}, children = [
         {tag="span", attributes={class="fup"}, children = arg1html},
         {tag="span", attributes={class="bar"}, children=[{tag="#text", value="/"}]},
         {tag="span", attributes={class="fdn"}, children= arg2html}]}, newOpts2]
      else
        [htmlError "\\frac allowed only in math mode" "???", opts]
  },
  `\_` = htmlConst {tag="span", children=[{tag = "#text",
 value = "_"}]},
  `_` =
  { arity = 1
  , toHtml = \toHtml.\opts.\args.
    if(opts.mathmode)
      let [arghtml, newOpts] = toHtml opts args in
      [{tag="sub", children = arghtml}, newOpts]
    else
      [htmlError "_ allowed only in math mode" "???", opts]
  },
  `^` =
  { arity = 1
  , toHtml = \toHtml.\opts.\args.
    if(opts.mathmode)
      let [arghtml, newOpts] = toHtml opts args in
      [{tag="sup", children = arghtml}, newOpts]
    else
      [htmlError "^ allowed only in math mode" "???", opts]
  },
  default = \x.
    { arity = 0
    , toHtml = \toHtml.\opts.\arg.    
    [htmlError "Unknown Command" x, opts]}
} in
let indent opts = if(opts.indent) [{tag="span", attributes={class="paraindent"}, children="&nbsp;"}] else [] in 
let newline opts = if(opts.newline) [{tag="br"}] else [] in 
let splitargs n array =
  letrec aux acc n array =
    if(n == 0) [acc, array] else
    array match {
      case [{tag="rawtext", value=text}] ++ rem =>
        extractFirstIn ``^\s*(\S)(.*)`` text match {
          case {value = [arg, other]} =>
            let newAcc = acc ++ [{tag="rawtext", value=arg}] in
            let newN = n - 1 in
            let newArray = [{tag="rawtext", value=other}] ++ rem in
            aux newAcc newN newArray
          case {} =>
            aux acc n rem
        }
      case [head] ++ rem =>
        let newAcc = acc ++ [head] in
        let newN = n - 1 in
        aux newAcc newN rem
      case [] =>
        [[], array]
  } in aux [] n array in
letrec toHtmlWithoutRefs state tree =
  letrec aux state acc tree = tree match {
    case [] => [acc, state]
    case [{tag="block", children=children}] ++ rem => let newTree = children ++ rem in
      aux state acc newTree
    case [{tag="rawtext", value=text}] ++ rem =>
      if(state.indent && matchIn ``^[\s]*\S`` text)
        let newState = state & {indent = false, newline = false} in
        let accWithParagraph = acc ++ newline state ++ indent state in
        let newAcc = accWithParagraph ++ [{tag="#text",value=text}] in
        aux newState newAcc rem
      else
        let newAcc = acc ++ [{tag="#text",value=text}] in
        aux state newAcc rem
    case [{tag="newpar"}] ++ rem =>
      let newState = state & { indent = true, newline = true } in
      aux newState acc rem
    case [{tag="equationdelimiter"}] ++ rem => // Todo: Group the equation into an inline span?
      let newState = state & { mathmode = if(state.mathmode) false else true } in
      aux newState acc rem
    case [{tag="replacement", nth=n}] ++ rem => // Create a dummy tag that can be later replaced.
      let newAcc = acc ++ [{tag="span", attributes={class="replacement"}, children=[n]}] in
      aux state newAcc rem
    case [{tag="command", name=cmdname}] ++ rem =>
      let tmpState = if(cmdname == ``\noindent``) state & {indent = false} else state in // TODO: Need to not convert to html, but expand the command first.
      let cmddef = (commands & tmpState.customCommands) cmdname in
      let [args, remainder] = cmddef match {
        case {arity=n} =>
          splitargs n rem
        case {inspect=inspect} =>
          inspect rem
      } in
      let [toAdd, newState] = cmddef.toHtml toHtmlWithoutRefs tmpState args in
      let newAcc = acc ++ [toAdd] in
      aux newState newAcc remainder

    case [{tag="linecomment", value=value}] ++ rem =>
      let newAcc = acc ++ [{tag="span", styles={background="#888", color="#FFF"}, children = [{tag="#text", value="(" + value + ")"}]}] in
      aux state newAcc rem
  } in 
  aux state [] tree in
let initOptions = {
  indent = false,
  newline = false,
  customCommands = {},
  currentLabelValue= !"0",
  sectionCounter= !0,
  subsectionCounter= !0,
  mathmode = false  } in
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
\section{\LaTeX{} editing in \textsc{Html}}\label{sec:introduction}
This \small{} \LaTeX{} editor is \textit{bidirectional} and supports \small{} \textbf{textual} changes. Rename '\small{}' to 'lightweight' to see\ldots
\section{It supports reference update}\label{sec:commands}
This editor features a subset of \LaTeX{} commands, for example references.
Section \ref{sec:introduction}.
Change the previous number to 2 or 2.1. See how it updates the source code.
\subsection{Others}\label{others}
Only frac, exponent and indices in math mode: $\frac{b^2-4ac}{2}$.
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
.fraction {
  display: inline-block;
  position: relative;
  vertical-align: middle; 
  letter-spacing: 0.001em;
  text-align: center;
  font-size: 12px;
  }
.fraction > span { 
  display: block; 
  padding: 0.1em; 
  }
.fraction span.fdn {border-top: thin solid black;}
.fraction span.bar {display: none;}
``},
{tag="textarea", attributes = {
   onchange="this.textContent = this.value",
   onkeyup=``if(typeof timer != "undefined") clearTimeout(timer); timer = setTimeout((function(self){ return function() { self.textContent = self.value; } })(this), 2000);``  
}, styles={`font-family`="monospace", width="100%", `min-height` = "200px"}, children = [{tag="#text", value = latex}]},
  {tag="div", attributes={id="content"}, styles={display="inline-block"}, children=
toHtml 
  (parse (tokens latex)) }]
