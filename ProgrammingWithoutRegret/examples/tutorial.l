// download: tutorial.html
// output: html
// updatedelay: 0
// hideprogram: true
let delay = {apply=\x.x, unapply=\out.{value = if(out <= 0) 0 else out}} 1 in // Delay in second before triggering changes
let miniwindow options initialProgram =
let options = {id="", height="5.5em", html=false} & options in
let onkeyup = ``clearTimeout(typeof mwintimer == "undefined" ? 0 : mwintimer); mwintimer = setTimeout((function(self) { return function() { self.textContent = self.value } })(this), @(delay*1000) )`` in
{tag = "div", styles = {`text-align` = "center",`margin-top` = "0.5em", `margin-bottom`="1em", height=options.height}, children =
  [{tag="textarea", attributes={id=options.id, onkeyup=onkeyup,placeholder="Enter a program here"}, styles = {`vertical-align` = "middle", width = "calc(50% - 2em)", height="100%"}, children=[{tag="#text", value=initialProgram}]},
  "&nbsp;→&nbsp;",
  if(options.html) (
    evaluate initialProgram match {
      case {value = v} => v
      case {error = m} => {tag="span", styles={color="red"}, children = [{tag="#text", value=m}]}
    }
  ) else {tag="textarea", attributes={onkeyup=onkeyup,placeholder="Here is the value of the program"}, styles = {`vertical-align` = "middle", width = "calc(50% - 2em)", height="100%"}, children=[{tag="#text", value=evaluate initialProgram match {
 case {value = v} => print v case { error=msg} => msg }}]}, {tag="br"}]} in
let code id codestr =
 { tag="code", attributes={onclick="document.getElementById(\"" + id + "\").textContent = this.textContent"}, styles={cursor="pointer"},
   children = [{tag="#text", value = codestr}]} in
[
{tag="h1", children="Programming Without Regret"},
``Welcome to this tutorial for programming without regret.
Often, when we create a webpage or a document using a programming language, writers suffer the pain of not being able to modify the generated document.
With this language, this restriction is waived. You can edit both the program or the output.``,{tag="br"},
``Click on the examples to run them in the nearest evaluation box below them.
More interestingly, you can also modify the example programs to play with them, or modify their output.
Because the way this page is generated, there is a <abbr title="Modify the delay directly!">@delay-second</abbr> delay before any change triggers something.``,
{tag="h2",children="Constant programs"},
``We start by very simple programs. The simplest programs are values that do not need computation. Values are either lambda expressions like ``, code "programValue" "\x.x + 1",
", strings like ", code "programValue" ``"Hello world"``,
", array literals ", code "programValue" ``[1, "Hello"]``,
", records ", code "programValue" ``{ name = "Joe", age = 31}``,
", integers ", code "programValue" "0", ", ", code "programValue" "3",
"... and booleans ", code "programValue" "true", " and ", code "programValue" "false",
``. Evaluating them (to the right) does not modify them. You can try some of the values above by clicking them to insert them below:``, {tag="br"},
miniwindow {id = "programValue", height="2em"} ``"Hello world"``,
{tag="h2", children="Simple operations"},
`` Constant programs can be composed with operations to create computations. Most arithmetic operations are reversible. You can try below for example to modify the result or the computation itself of ``,
"strings concatenations ",  code "programOps" ``"Hello" + "world"``,
", array concatenations ", code "programOps" ``[1, 2] ++ [] ++ [4, 5, 6]``,
", integer operations ", code "programOps" ``(10 + 2)/4``,
", record extraction ", code "programOps" ``{name = "Joe", age="31"}.name``,
" and merging ", code "programOps" ``{name = "Mrs. Doe", age=31} & {name = "Mrs. Joe"}``,
", and booleans conditions ", code "programOps" ``(false || false) && true && false``,
". If you wish a value to never be modified, prepend it with an exclamation point (such as ", code "programOps" ``(10 + !2)/4``, "). The ! is very useful to prevent modifying values (including functions).",
miniwindow {id = "programOps", height="3.5em"} ``"Hello" + " " + "world"``,
{tag="h2", children="Variables, Functions, Long strings"},
"To assign expressions to variables, use the let-in construct (e.g. ", code "programVars" ``let x = "a" in x + x``,
"). Variables names should be usual; if they are not (keywords, spaces, special chars), you need to enclose them in backticks ",
code "programVars" ``let `div-element` = {`margin-top`="15px"} in
`div-element`.`margin-top` ``,
". You can abbreviate the definition of functions with arguments (lambda expressions) ", code "programVars" ``let greet x = "Hello " + x in greet "World"``,
". You can define recursive functions such as ", code "programVars" ``letrec sum acc x =
  if(x <= 1) (acc+x) + " = " + x
  else (sum (acc + x) (x - !1) + "+" + x) in sum !0 5``,
". Also, long strings enable you to have multi-line strings, variable and function definitions without the `in` keyword, and to interpolate variables or expressions. ",
code "programVars" ``let x = "amazing" in \\``@@let t = { bold=\x. "<b>" + x + "</b>" }
Interpolation is @@t.bold{awesome and @@x@@}. 1+1=@@(1+1)\\````, ". Note how to call functions !",
miniwindow {id = "programVars", height="6.5em"} ``let greet = "Hello " in
greet + greet + "world!"``,
{tag = "h2", children="Create HTML pages"},
``Finally, values can be converted to HTML elements.
Records (if set correctly) can be either a text node``,code "programHTML" ``{tag="#text", value="Hello world"}``,
`` or an element, ``, code "programHTML" ``{tag="span", attributes={id="dummy"}, styles={background="#0F0"}, children=[{tag="#text", value="Hello green world"}]}``,  ``
 (attributes, styles and children are all optional, tag is not). Strings become the innerHTML of a span,``, code "programHTML" ``"String "+"<b>concatenation</b>"``, ``
arrays become the children of a span (and are faster to update than strings),``, code "programHTML" ``["<i>Array</i> ", {tag="br"}, "with elements"]``,``
integers become a input box for integers,``, code "programHTML" ``(10 + 2) / 4``,``
booleans become switches.``, code "programHTML" ``false && false && false``,
``. You can even create copy-paste SVG in long strings: ``, code "programHTML" ``\\``@@let x = 10
<svg viewBox="0 0 110 60" width="110px">
  <line x1="@@x" y1="10" x2="100" y2="50" stroke="#000" stroke-width="2"></line>
  <text x="50" y="10" fill="black">x = @@x</text></svg>\\````,
miniwindow {id = "programHTML", height="9em", html=true} ``"<b>Hello</b> world"``,
{tag="h2", children="Pattern matching"},
``You can check if a value passes a given pattern and recover its sub-values: ``,
code "programMatch" ``{n=["Hello world", 2, 3]} match { case {n=["Hello " + w] ++ tail} => w + tail.length}``,
``<br>You can define your own matchers by using 'unapply' fields.``,
code "programMatch" ``let f = {unapply=\x. {value = "H" + x} } in
"ello" match { case f greet => greet }``,
``<br>You can use patterns directly in let expressions:``,
code "programMatch" ``let [a, {name = b}] = ["A", {title="Mr.", name="John"}] in
a + b``,
``<br>Pattern matching works great with records having duplicate keys:``,
code "programMatch" ``{ k = "1", k = "2"} match {
  case m & { k = a, k = b } => a + b + m.k
}``,
miniwindow {id = "programMatch", height="5em"} ``{n=1} match { case {n=m} => m }``,
{tag="h2", children="Advanced functions"},
``In this section you'll find a mix of features you might love.``, {tag="br"},
code "programMix" ``keysOf { fr = "Salut", en = "Hello" }``, ": obtain the keys of a record<br>",
code "programMix" ``join ["a", "b", "cd"] "-"``, ": join string array<br>",
code "programMix" ``replaceAllIn "(\\d+)" "1, 2, 3" "-$1"``, ": replace all occurrences of regular expressions<br>",
code "programMix" ``replaceAllIn "(\\d+)" "1, 2, 3" (\m."-" + m.group 1)``, ": replace all occurrences of regular expressions (functional replacement)<br>",
code "programMix" ``replaceFirstIn "(\\d+)" "E: 1, 2, 3" "-$1"``, ": replace all occurrences of regular expressions<br>",
code "programMix" ``if(matchIn "^Hello.*" "Hello world") "Nice" else "Not nice"``, ": check if a regex matches<br>",
code "programMix" ``{apply=\x. "H" + x} "ello world"``, ": apply in records turns them into functions<br>",
code "programMix" ``{default=\x. "H" + x}.ello``, ": default in records captures fields not in the record.<br>",
miniwindow {id = "programMix", height="4em"} ``replaceAllIn "(\\w)o" "Hello world" "$1$1a"``,
{tag="h2", children="Full editor"} ,
``You can open the full editor by clicking on the switch below. This will reveal the source code of this page. You can continue and create your own !``, {tag="br"},
{tag="div", styles={`text-align` = "center"}, children=[
  {tag="button",
   children = "Display the program!", attributes={onclick="document.getElementById('displayprogram').click(); window.scrollTo(0, 0);"}}]},
"Also, you can browse the examples as well."
]
