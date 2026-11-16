let x = (λn.λp.p n n) (λf.λx.x) in
              let who = { name= "Joe", ending= "!", unused= "?" } in
let greet = "Hello" in
let whom = who match { case {name= n, ending= e} => " " + n + e } in
let greetings = greet + whom in
λp.p greetings x