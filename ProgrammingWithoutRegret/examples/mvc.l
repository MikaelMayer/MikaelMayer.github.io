//updatedelay: 0
//output: html

// Library
let modify defaultContent trigger f = { apply = \i. defaultContent,
update = \p. if(p.outputNew == trigger) {value = f p.input} else {value = p.input}
} in
let button name controller model = 
  {tag="input", attributes={type="button", value=name, trigger=modify "" "#" controller model, onclick = "this.setAttribute('trigger', '#')"}} in

let model = {
  n = 16,
  custom = "if(n%2 == 0) n / 2 else n*3+1"
} in
let controllers = {
  increment = \model. model & {n = model.n + 1},
  decrement = \model. model & {n = model.n - 1},
  multby = \k. \model. model & {n = model.n * k },
  customEval = \model. model & {n = (evaluate ``let n = @(model.n) in @model.custom``).value }
} in
let view = 
[{tag="h1", children=[{tag="#text", value="Model-View-Controller"}]},
``Using special lenses, you can architect your software as the usual model-view-controller.<br>
n = @model.n What do you want to do?<br>``,
button ``Increment n`` controllers.increment model,
button ``Decrement n`` controllers.decrement model,
button ``Multiply n by 2`` (controllers.multby 2) model,{tag="br"},
button ``Custom:`` controllers.customEval model, !" " + model.custom] in
view