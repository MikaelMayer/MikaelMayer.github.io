let cmdregex name = ``\\@name(?:\{([^\\{\\}]*?)\}|\\b +(.))`` in
let unnestedLatexToHTML latex =
  let latex = replaceAllIn (cmdregex "section") latex "<h2>$1$2</h2>" in
  let latex = replaceAllIn (cmdregex "subsection") latex "<h3>$1$2</h3>" in
  let latex = replaceAllIn (cmdregex "subsubsection") latex "<h4>$1$2</h4>" in
  let latex = replaceAllIn (cmdregex "textbf") latex "<b>$1$2</b>" in
  let latex = replaceAllIn (cmdregex "textit") latex "<i>$1$2</i>" in
  let latex = replaceAllIn "\n\n" latex "<br>" in
  { apply= \x.replaceAllIn "\\$([^\\$]*?)\\$" x (\m."\\(" + m.group 1 + "\\)"),
    unapply= \out. 
      let o2 = replaceAllIn ``<span class="MathJax_Preview".*?<script type="math/tex("|; mode=display") id="MathJax-Element-\d+">(.*?)</script>`` out (
        \m. if(m.group 1 == "\"") "$" + m.group 2 + "$" else "\\[" + m.group 2 + "\\]") in
      {value = o2 }
  } latex in
letrec latexToHTML latex =
  let res = unnestedLatexToHTML latex in
  if(res == latex) res else latexToHTML res in
[
{tag="script", children=``
if(document.getElementById("mathjaxscript") == null) {
  var script = document.createElement("script");
  script.setAttribute("id", "mathjaxscript");
  script.setAttribute("src", "https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.2/MathJax.js?config=TeX-MML-AM_CHTML");
  document.head.append(script);
}``},
{ tag="div", attributes={id="content"}, children=
latexToHTML ``
\section{LaTeX to HTML converter}
This document $\frac{1}{2}$ demonstrates a \textbf{lightweight} LaTeX to HTML converter based on regular expressions.

Two lines insert a newline in LaTeX. You can add math formulae as well !
``},
{tag="script", children=``
  var currentContent = document.getElementById("content").textContent
  if(currentContent.indexOf("\\[") > -1 && currentContent.indexOf("\\]") > -1 || currentContent.indexOf("\\(") > -1 && currentContent.indexOf("\\)") > -1) {
    MathJax.Hub.Typeset();
  }
``}]