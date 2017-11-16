// download: Markdown.html
// output: html
// hideprogram: false
let original =
``#[Markdown](https://fr.wikipedia.org/wiki/Markdown) demo
This is *an **almost :"bidirectional":*** markdown
editor. You can **fully** edit the value of the variable `original` on the right,
and _partially_ edit the html on the right.

*Limitation*: Since this is a regex-based transformation, it cannot correctly nest italics into bold (unless you use underscores instead of stars)
#### For the program on the left:
* Headers of level n are prefixed with n #
* Use * to introduce bullets
* Use 1. to introduce numbered lists

#### For the markdown on the right:
1. Use SHIFT+ENTER for new lines.
2. Do not use CTRL+V

#### Anywhere
2. Add bold by wrapping with two stars.
3. Add emphasis by wrapping with stars.
1. Use backtick to insert `code`

>Markdown is a lightweight markup
>language with plain text formatting syntax

`` in
let trim s =
  let trimmed_left = replaceAllIn "^[ \n]+" s "" in
  replaceAllIn "[ \n]+$" trimmed_left "" in
letrec sprintf str inline = inline match {
  case [a] ++ tail => sprintf (replaceFirstIn "%s" str a) tail
  case [] => str
  case "" + a => replaceFirstIn "%s" str a
} in
let strlen str = str.length  in
letrec foldLeft init list fun = list match {
  case [] => init
  case [head] ++ tail => let newInit = (fun init head) in
    foldLeft newInit tail fun
} in
// Thanks to https://gist.github.com/jbroadway/2836900
let markdown text =
    let self = {
    para = \regs.
      let line = regs.group 2 in
      let trimmed = trim line in
      if (matchIn "^</?(ul|ol|li|h|p|bl)" trimmed) (
        (regs.group 1) + line
      ) else (
        sprintf "%s<p>%s</p>\n" [regs.group 1, line]
      )
    ,
    ul_list = \regs.
      let item = regs.group 1 in
      sprintf "\n<ul>\n\t<li>%s</li>\n</ul>" (trim item)
    ,
    ol_list = \regs.
      let item = regs.group 1 in
      sprintf "\n<ol>\n\t<li>%s</li>\n</ol>" (trim item)
    ,
    blockquote = \regs.
      let item = regs.group 2 in
      sprintf "\n<blockquote>%s</blockquote>" (trim item)
    ,
    header = \regs.
      let {group= [tmp, nl, chars, header]} = regs in
      let level = chars.length.toString in
      sprintf "<h%s>%s</h%s>" [level, trim header, level]
  } in
  let rules = [
    ["(\n|^)(#+)(.*)", self.header],                              // headers
    ["\\[([^\\[]+)\\]\\(([^\\)]+)\\)", "<a href='$2'>$1</a>"],    // links
    ["(\\*\\*|__)(?=[^\\s\\*_])(.*?)\\1", "<strong>$2</strong>"], // bold
    ["(\\*|_)(?=[^\\s\\*_])(.*?)\\1", "<em>$2</em>"],             // emphasis
    ["\\~\\~(.*?)\\~\\~", "<del>$1</del>"],                       // del
    ["\\:\"(.*?)\"\\:", "<q>$1</q>"],                             // quote
    ["`\\b(.*?)\\b`", "<code>$1</code>"],                         // inline code
    ["\n\\*(.*)", self.ul_list],                                  // ul lists
    ["\n[0-9]+\\.(.*)", self.ol_list],                            // ol lists
    ["\n(&gt;|\\>)(.*)", self.blockquote],                        // blockquotes
    ["\n-{5,}", "\n<hr>"],                                        // horizontal rule
    ["\\n\\n(?!<ul>|<ol>|<p>|<blockquote>)","<br>"],              // add newlines
    ["\\n</ul>\\s?<ul>", ""],                                     // fix extra ul
    ["\\n</ol>\\s?<ol>", ""],                                     // fix extra ol
    ["</blockquote>\\s?<blockquote>", "\n"]                       // fix extra blockquote
  ] in
  let finaltext = "\n" + text + "\n" in
  foldLeft finaltext rules (\acc.\elem. elem match {
      case [regex, replacement] => replaceAllIn regex acc replacement
    }
  )
in
"<pre>" + original + "</pre>" +
!markdown original