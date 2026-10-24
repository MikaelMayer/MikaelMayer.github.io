// download: auto-translatable.html
// output: html
// hideprogram: false
let option = {apply=\value,selected,content. {tag= "option", attributes={value=value} & (if(selected) {selected="selected"} else {}), children=content},
unapply=\t. (t match {
  case {attributes={value=value,selected=_}, children=content} => {value = [value, true, content] }
  case {attributes={value=value},children=content} =>
   {value = [value, false, content] }
  case _ => {}
}) } in
let select array = {
  apply=\index.
   letrec aux acc i options = options match {
     case [] => acc
     case [opt] ++ tail =>
       let newAcc = acc ++ [option [i + "", i == index, opt]] in
       let newI = i + 1 in
       aux newAcc newI tail
   } in
  {tag="select", attributes={`selected-index`=index + "", onchange="this.setAttribute('selected-index', this.selectedIndex)"}, children= aux [] 0 array}
} in
letrec take n array =
  if(n==array.length) array else (array match {
    case [] => array
    case init ++ [last] =>
      take n init
  }) in
letrec drop n array =
  if(n==0) array else (array match {
    case [] => array
    case [head] ++ tail =>
      let newN = n- 1 in
      drop newN tail
  }) in
let indexLang = 0 in
let removeFirst x = x match {
  case [head] ++ tail => tail
  case e => e
} in
letrec translations = {
  default= \l.{
    default = \what.
      what match {
       case "para5" => !"<span style=\"color:red\">"+l+" is not a recognized language. Try one of "+(join (removeFirst
 (keysOf translations)) ", ")+!"</span>"
       case e => translations.English what
     }
  },
  English= {
    header = "<h1>Auto-translatable document</h1>",
    para1 = "This document is currently in&nbsp;",
    para2 = "To create a translation, write the name of the new language in the box below, and press ENTER:",
    para3 = "You can now, translate this document sentence by sentence!"
  },
  Français= {
    header = "<h1>Document auto-traduisible</h1>",
    para1 = "Ce document est actuellement en ",
    para2 = "Pour en créer une traduction, écrivez le nom de la langue ci-dessous et pressez entrée:",
    para3 = "Vous pouvez ensutie traduire ce document phrase par phrase!"
  }
} in
let languages = removeFirst (keysOf translations) in
let lang = languages indexLang in
let keys = join languages "</li><li>" in
let tr = translations lang in
let nl = !"<br>" in
let setLang = { apply=\languages.!"",
  update =\p. 
    {value = (take indexLang p.input) ++ [p.outputNew] ++ (drop indexLang p.input ) }
} in
[tr.header,
tr.para1, select languages indexLang, 
nl + tr.para2 + nl,
{tag="input", attributes={type="text", value=setLang languages, placeholder="New Language (e.g. fr)", onchange="this.setAttribute('value',this.value)"}},
nl + tr.para3 + nl]