let n = { name= "M. Joe", age= "31" } in
n match {
  case { name= "M. " + name } & m =>
  "My name is " + name + " and I'm " + m.age + " years old"
}