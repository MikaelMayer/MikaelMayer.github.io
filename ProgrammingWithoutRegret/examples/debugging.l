// download: debugging.html
// output: html
let debug msg = {
  apply = \body. let x = console.log msg in body,
  unapply = \out.{value=out}
} in
let debugraw txt = debug txt txt in
let who = "world" in
[{tag="h1",children=debugraw "Debugging"},
"By defining your own lenses with <code>apply</code> and <code>unapply</code>, you can define your own debug statement. Indeed, the program compiles to javascript, so <code>console.log</code> and <code>eval</code> will work, but they should absolutely not go through the evaluator. This is where unapply is useful.",{tag="br"},"For example, every time you modify this page, it will print to the console the title of this page as well as an hello to `" ,
debug ("Hello "+who) who, "` (and you can change it here)"]