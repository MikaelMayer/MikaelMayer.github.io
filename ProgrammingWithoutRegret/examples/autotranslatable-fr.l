// download: document-auto-traduisible.html
// output: html
// hideprogram: false
let lang = "fr" in
let removeFirst x = x match {
  case [head] ++ tail => tail
  case e => e
} in
letrec translations = {
  default= \l.{
    default = \what.
      what match {
       case "para5" => !"<span style=\"color:red\">"+l+" n'est pas un langage reconnu. Essayez "+(join (removeFirst
 (keysOf translations)) ", ")+!"</span>"
       case e => translations.fr what
     }
  },
  fr= {
    header = "<h1>[%s] Document auto-traduisible</h1>",
    para1 = "Ce document est actuellement en français",
    para2 = "Pour lui créer une traduction, positionner le curseur après 'fr' ci-dessous, appuyez sur ENTREE et entrez un nouveau code de langage (par exemple en)",
    para3 = "En fonction de là où le code de langage est inséré, cela dupliquera une traduction existante.",
    para4 = "Ensuite, changez de traduction en cours en tapant le code inséré précédemment dans la boîte ci-dessous :",
    para5 = "Ensuite, traduisez simplement ce document phrase par phrase !"
  }
} in
let keys = join (removeFirst (keysOf translations)) "</li><li>" in
let tr = translations lang in
let nl = !"<br>" in
replaceAllIn "%s" tr.header lang +
tr.para1  + nl +
tr.para2 + nl +
"<ul><li>" + keys + !"</li></ul>" +
tr.para3 + nl +
tr.para4 + nl + !"<pre style=\"display: inline-block\">" +
lang + !"</pre>" + nl +
tr.para5