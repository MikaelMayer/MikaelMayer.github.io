let miniwindow options initialProgram =
let options = {id="", height="5.5em"} & options in
let timername = options.id + "timer" in
let onkeyup = ``clearTimeout(typeof @timername == "undefined" ? 0 : @timername); @timername = setTimeout((function(self) { return function() { self.textContent = self.value } })(this), 1000)`` in
{tag = "div", styles = {`text-align` = "center",`margin-top` = "0.5em", `margin-bottom`="1em", height=options.height}, children =
  [{tag="textarea", attributes={id=options.id, onkeyup=onkeyup,placeholder="Enter a program here"}, styles = {`vertical-align` = "middle", width = "calc(50% - 2em)", height="100%"}, children=[{tag="#text", value=initialProgram}]}, "&nbsp;→&nbsp;", {tag="textarea", attributes={onkeyup=onkeyup,placeholder="Here is the value of the program"}, styles = {`vertical-align` = "middle", width = "calc(50% - 2em)", height="100%"}, children=[{tag="#text", value=evaluate initialProgram match { 
 case {value = v} => print v case { error=msg} => msg }}]}, {tag="br"}]} in
let code id codestr =
 { tag="code", attributes={onclick="document.getElementById(\"" + id + "\").textContent = this.textContent"}, styles={cursor="pointer"},
   children = [{tag="#text", value = codestr}]} in
[
{tag="h1", children="Programming Without Regret Tutorial"},
``Welcome to this tutorial for programming without regret. Click on the examples to run them in the nearest evaluation box below them.
More interestingly, you can also modify the example programs to play with them, or modify their output.
Because this pageg is generated, there is a 2 second delay before any change trigger something.``,
{tag="h2",children="Constant programs"},
``We start by very simple programs. The simplest programs are values that do not need computation. Values are either ",
"lambda expressions like ``, code "programValue" "\x.x + 1",
", strings like ", code "programValue" ``"Hello world"``,
", array literals ", code "programValue" ``[1, "Hello"]``,
", records ", code "programValue" ``{ name = "Joe", age = 31}``,
", positive integers ", code "programValue" "0", ", ", code "programValue" "3",
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
". If you with a value to be not modified, prepend it with an exclamation point (such as ", code "programOps" ``(10 + !2)/4``, "). The ! is very useful to prevent modifying values.",
miniwindow {id = "programOps", height="3.5em"} ``"Hello" + " " + "world"``,
{tag="h2", children="Variables, Functions"},
"To assign expressions to variables, use the let-in construct (e.g. ", code "programVars" ``let x = "a" in x + x``,
"). Variables names should be usual; if they are not (keywords, spaces, special chars), you need to enclose them in backticks ",
code "programVars" ``let `div-element` = {`margin-top`="15px"} in
`div-element`.`margin-top` ``,
". You can abbreviate the definition of functions with arguments (lambda expressions) ", code "programVars" ``let greet x = "Hello " + x in greet "World"``,
". You can define recursive functions such as ", code "programVars" ``letrec sum acc x =
  if(x <= 1) (acc+x) + " = " + x
  else (sum (acc + x) (x - !1) + "+" + x) in sum !0 5``,
miniwindow {id = "programVars", height="6.5em"} ``let greet = "Hello " in
greet + greet + "world!"``,
{tag="h2", children="Conditions, Pattern matching"},
"Multi-args lambdas, deconstruction in lets," + "<code>{unapply=\input. ..., unapply</code>",
{tag="h2", children="Regular expressions"},
"replaceAllIn, replaceFirstIn, matchIn",
{tag="h2", children="String Interpolation"},
{tag="h2", children="Regular expressions and other built-ins"},
{tag="h2", children="Advanced lenses"},
"unapply, update, updateAlign"
]
