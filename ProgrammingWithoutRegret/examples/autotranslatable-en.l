// download: auto-translatable.html
// output: html
// hideprogram: false
let lang = "en" in
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
       case e => translations.en what
     }
  },
  en= {
    header = "<h1>[%s] Auto-translatable document</h1>",
    para1 = "This document is currently in English",
    para2 = "To create a translation, position your cursor after 'en' below, hit [ENTER] and type a new language code:",
    para3 = "Depending on where you insert it, it duplicates an existing language.",
    para4 = "Next, change the language code below to the new one:",
    para5 = "Afterwards, translate this document sentence by sentence!"
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