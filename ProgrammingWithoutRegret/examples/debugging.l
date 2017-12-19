// download: debugging.html
// output: html
let debug msg = {
  apply = \body. log msg body,
  unapply = \out.{value= log "unapply" out}
} in
let debugraw txt = debug txt txt in
let who = "world" in
[{tag="h1",children=debugraw "Debugging"},
"Use <code>log</code> to display a message and the value before returning the value itself.<br>Each time this is evaluated, it displays 'Hello "+who+"' in the console.<br>",
debug "Hello " who, "<br>(and you can change whom to greet here)"]