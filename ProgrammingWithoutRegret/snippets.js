const snippets = {
  multilang: `let translations = {fr: {hello: "Bonjour", howareyou: "Comment cela va"}, en: {hello: "Hello", howareyou: "How are you doing"}} in
let tr = translations.en in
let name = "Mikael" in
tr.hello + "! " + tr.howareyou + ", " + name + "?"`,

  mkstring: `let list = {hd: "1", tail: {hd: "2", tail: {hd: "3", tail: {}}}} in
letrec mkString = λl.λsep.l match {
case {hd: p, tail: r & {hd: q}} => p + sep + mkString r sep
case {hd: p} => p
case {} => ""
} in
mkString list ","`
}