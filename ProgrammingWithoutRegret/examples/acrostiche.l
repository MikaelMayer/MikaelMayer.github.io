//updatedelay: 1
//output: html

let lettres = "Marion" in
letrec verses = {
 A = " toi que j'aime chaque heure",
 B = "elle comme la rosée d'une fleur",
 C = "e que tu vaux est à ton honneur",
 D = "is-donc, j'aime tes faveurs.",
 E = "t que ta vie soit sans douleur",
 F = "arouchement je suis charmeur",
 I = "ci, là-bas, partout, ailleurs",
 J = "e te souhaite que du bonheur",
 K = "oala à faire rêver les hauteurs",
 L = "e câble de ma télé, mon décodeur",
 O = "n ne te fera plus de frayeurs",
 M = "a confiture sur mon beurre",
 N = "e reçois tu pas toute ma ferveur?",
 R = "eçois le message de mon coeur",
 default = \l.
   {apply=\verses. " [éditer cette phrase]",
    unapply=\o.
     {value = verses & record l.toUpperCase o }
   } verses
} in
letrec poem lettres = if(lettres == "") [] else
  extractFirstIn "([a-zA-Z])(.*)" lettres match {
    case {value=[lettre, reste]} =>
     [{tag="span", styles={`font-size`="1.5em", `min-width` = "0.5em", display="inline-block"}, children=[{tag="#text", value = lettre.toUpperCase}]}, verses lettre.toUpperCase, {tag="br"}] ++ poem reste
    case {} => ["Le premier caractère de '" + lettres + "' doit être une lettre majuscule"]
  } in
[{tag="h1", children=!"A " + lettres},
{tag="br"}] ++ poem lettres ++ ["."]