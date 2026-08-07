letrec flatmap l f = l match {
  case [head] ++ tail => (f head) ++ flatmap tail f
  case [] => []
} in
flatmap ["f", "g"] (\x.x match {
  case "f" => ["k", "j"]
  case "g" => ["i"]
})