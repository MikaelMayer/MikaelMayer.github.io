// download: pizzas.html
// output: html
let wrapElem x = x match {
  case "" + y => {tag= "#text", value= y}
  case {tag= i} => x
  case y => {tag= "DIV"} & y
} in
letrec map l f = l match {
  case [x] ++ y => [f x] ++ (map y f)
  case [] => []
} in
letrec wrap xs = xs match {
  case "" + y => [wrapElem y]
  case [] => []
  case [x] ++ y => [wrapElem x] ++ wrap y
} in
let elem tag children = {tag= tag, children= wrap children} in
let b = elem "B" in
let i = elem "I" in
let ul = elem "UL" in
let li = elem "LI" in
let pizzas = ["Margherite", "Sudjuk", "Salami"] in
ul (map pizzas (\pizza. li ("Pizza " + pizza)))