// download: recurrence-lesson.html
// output: html
``<pre style="white-space: pre-wrap;font-family:sans-serif">
@let nex = 3 /* n used in examples */
@letrec sum nx = if(nx == 1) "" + nx else
  (sum (nx - 1)) + "+" + nx
@letrec cumul nx = if(nx == 0) nx else (nx + cumul (nx - 1))
@let [P, n, k, lang] = ["P", "n", "k", "en"]
@letrec translations = {
  default = \x. translations.en,
  en = {
    title = "Proof by induction",
    language = "Language",
    chooseamong = "choose among",
    ifproof = "If we want to prove a proposition %s for any integer %s",
    needproof = "we first need to prove that %s holds",
    andproof = "and that if we know %s for any given %s, we can obtain %s"
  },
  fr = {
    title = "Preuve par récurrence",
    language = "Langue",
    chooseamong = "choisissez parmi",
    ifproof = "Si nous voulons prouver une proposition %s pour n'importe quel entier %s",
    needproof = "nous devons d'abord prouver %s",
    andproof = "et que si nous savons %s pour n'importe quel %s donné, nous pouvons prouver %s"
  }
}
@letrec langs = (keysOf translations) match {
  case [head] ++ tail => join tail ","
}
@letrec format s args = args match {
  case [] => s
  case [head] ++ tail => format (replaceFirstIn "%s" s head) tail
}
@let tr = translations lang
@let tag = { default=\x.\y. "<" + x + ">" + y + "</" + x + ">" }
@let h1 = tag.h1
@let i = tag.i
@let b = tag.b
(@tr.language = @lang -- @tr.chooseamong @langs)
@h1{@tr.title@}
A @i{proof by induction@} makes use of @i{the axiom of recurrence@}.
The axiom of recurrence states that, for a proposition @P depending on an integer @n, if the following precondition is satisfied:

    @P(1)   ∧   ∀@n⩾1. @P(@n) ⇒ @P(@n+1)

then the following result holds:

    ∀@n⩾1. @P(@n)

@(format tr.ifproof [(P + "(" + n + ")"),n]), @(format tr.needproof [P+"(1)"]), @(format tr.andproof [P+"(" + k+")", k, P+"("+k+"+1)"]).

A simple application of proof by induction is to prove that the sum of numbers between 1 and @n is equal to @n*(@n+1)/2.
This can be conjectured for particular number, for example @n=@nex (you can change this number): the sum of numbers between 1 and @nex is @(sum nex) = @(cumul nex).
On the other side @nex*(@nex+1)/2 = @nex*@(nex + !1)/2 = @(nex*(nex+ !1))/2 = @(nex*(nex+ !1)/ !2). Hence @P(@nex) holds.

Now let us prove this result by recurrence.
<ul><li>The proposition @P(1) is trivially true.</li><li>Given an integer @k, suppose that @P(@k) is true, that is, 1+…+@k = @k(@k+1)/2. Adding @k+1 to both sides gives: 1+…+@k+(@k+1) = @k(@k+1)/2 + @k+1 = (@k+1)@k/2 + (@k+1)*2/2 = (@k+1)(@k+2)/2. So we proved @P(@k+1).</li></ul>
By recurrence, we prove that @P(@n) is true for all @n.

There are many variants of proof by induction: induction basis equal to 2, prefix induction, induction on multiple counters, infinite descent</pre>``