//updatedelay: 0
//output: html
let n = 4 in
let modify defaultContent trigger f = { apply = \i. defaultContent,
update = \p. if(p.outputNew == trigger) {value = f p.input} else {value = p.input}
} in
let button name action variable = 
  {tag="input", attributes={type="button", value=name, trigger=modify "" "#" action variable, onclick = "this.setAttribute('trigger', '#')"}} in
let custom = "if(n%2 == 0) n / 2 else n*3+1" in
[{tag="h1", children=[{tag="#text", value="React-like state"}]},
``Using special lenses, you can specify actions that fire when a button is clicked.<br>
n = @n. What do you want to do?<br>``,
button ``Increment n`` (\n. n + 1) n,
button ``Decrement n`` (\n. n - 1) n,
button ``Multiply n by 2`` (\n. n * 2) n,{tag="br"},
button ``Custom:`` (\n. (evaluate ``let n = @n in @custom``).value) n, !" " + custom]