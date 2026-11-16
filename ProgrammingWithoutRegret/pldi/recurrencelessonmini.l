let lang = "en"  in
let translations = { 
 en= {
   lang= "Language",
   avail= "available",
   title= "Proof by induction",
   prop= "P",
   index= "n",
ind= "If %p1, and %p%n for all %n, then %p%n for all %n",
using= ``Using this we can prove that
1+2+...+%n = %n*(%n+1)/2``,
   conject= \e.``This can be conjectured for %n = @e.
Indeed:``,
   actual= "We prove the general case using induction:"
},
 fr= {
   lang= "Langue",
   avail= "disponible",
   title= "Preuve par récurrence",
   prop= "P",
   index= "n",
ind= "Si %p1, et %p%n pour tout %n, alors %p%n pour tout %n",
using= ``En utilisant ce résultat, on peut prouver que :
1+2+...+%n = %n*(%n+1)/2``,
   conject= \e.``Ce résultat peut être conjecturé pour %n = @e.
En effet:``,
   actual= "On peut prouver le cas général par récurrence :"
}} in
let tr = translations lang in
let notations x = 
  let xn = replaceAllIn "%n" x tr.index in
  replaceAllIn "%p(.)" xn
  (\m. tr.prop + "(" + (m.group 1) + ")") in
let e = 3 in
letrec enum i =
  if(i == 1) i + "" else (enum (i - 1) + "+" + i) in
letrec sum i =
  if(i == 1) i else (sum (i - 1) + i) in
let langs = join (keysOf translations) !"," in
notations ``<pre>@tr.lang: @lang (@tr.avail: @langs)
@tr.title
@tr.ind
@tr.using
@tr.conject{@e@}
@(!enum e) = @(!sum e).
@e*(@e+1)/2 = @e*@(e+1)/2 = @(e*(e+1))/2 = @(e*(e+1)/2).
@tr.actual
1+2...+(%n+1) = 1+2..+%n + (%n+1) =
%n*(%n+1)/2 + (%n+1)*2/2 = (%n+2)(%n+1)/2</pre>``