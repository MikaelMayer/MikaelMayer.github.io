include = if listDict.get "include" vars == Just "true" then include else (always [])

preludeEnv = __CurrentEnv__

booleandesc = <span>boolean (<code>true</code> or <code>false</code>).</span>

colordesc = <span>a string representing a color like <code>"#FF00FF"</code>.</span>

<html><head><meta content="text/html; charset=UTF-8" http-equiv="content-type">
<link rel="stylesheet" type="text/css" href="index.css">
<style>
@@media (orientation: landscape) {
  body > div {
    margin-left: auto;
    margin-right: auto;
    max-width: 32em;
  }
}
@@media (orientation: portrait) {
  body > div {
    margin-left: 5px;
    margin-right: 5px;
  }
}
span.h1 {
  font-size: 2em;
  font-weight: bold;
  display: block;
}
blockquote {
  font-family: Arial;
}
span.highlight {
  background: #00FF00;
}
span.formula {
  background: #FFAA22;
}
</style>
</head><body>@(include "menu.elm")<div>

<h1>Formulas for Google Docs</h1>
<em>2019/02/13 &mdash; Mikaël Mayer</em>.<br>
Have you ever wished you could synchronize content within one Google doc? Do you need temporary placeholders that you will replace later? Do you want to generate text? Do you miss spreadsheets in docs?<br><br>
If you answered yes to one of these questions, this Google doc extension is for you. It enables you to define names (a.k.a. variables) anywhere in the document, and to insert computations that produce rich text anywhere in the document.<h2>Define names</h2>
You can define a name anywhere in your document. It has to start with a word, the sign equal '=' and <b>a non-empty space behind it</b>. If there is an opening parenthesis, the content will be evaluated as JavaScript. If there is no opening parenthesis, the remaining until the end of the newline is treated as raw text. Definitions can depend on previous definitions.<br>
The following are all valid definitions of names:
<blockquote>
version = 1.0 beta<br>
name = ("MySoft" + version)<br>
citations = ({ mayer18: "https://dl.acm.org/citation.cfm?id=3276497",  chugh16: "https://dl.acm.org/citation.cfm?id=2908103" })<br>
cite = (function (name) { return typeof citations[name] !== "undefined" ? ["[" + name + "]", {link: citations[name]}] : "[" + name + "???]"; })

</blockquote>

<h2>Write formulas in your document</h2>
Anywhere in the document, write = followed by either
<ul>
<li>a name</li>
<li>a name followed by a JavaScript expression in parentheses</li>
<li>a JavaScript expression inside parentheses or square brackets</li>
</ul>
For example, in a document, you would write raw
<blockquote>
  <span class="h1">=name is out!</span>
  =[name, {bold: true}] is a n=(function() { var x = ""; var i = 10; while(i-- > 0) x = x + "i"; return x} ())ce software based on bidirectional evaluation =cite("mayer18") that goes beyond the original ideas of prodirect manipulation =cite("chugh16")
</blockquote>

<h2>Render formulas</h2>
Open the menu "Formulas" and click on "Evaluate formulas". The document above would be rendered as:

<blockquote>
  <span class="h1">MySoft 1.0 beta is out!</span>
  <b>MySoft 1.0 beta</b> is a niiiiiiiiiice software based on bidirectional evaluation <a href="https://dl.acm.org/citation.cfm?id=3276497">[mayer18]</a> that goes beyond the original ideas of prodirect manipulation <a href="https://dl.acm.org/citation.cfm?id=2908103">[chugh16]</a>
</blockquote>

Formulas used in the document should either return raw text, or a 2-element array where the first element is the text, and the second is a Javascript object containing styling material. If the method <code>setThing</code> exists in <a href="https://developers.google.com/apps-script/reference/document/text">this page</a>, then <code>thing : value</code> is a valid style attribute. Here is a list of supported attributes and shortcuts
<ul>
  <li><code>backgroundColor</code> (or <code>background</code>): @colordesc</li>
  <li><code>bold</code>: @booleandesc</li>
  <li><code>fontFamily</code>: string representing a valid font name.</li>
  <li><code>fontSize</code>: integer representing a valid font size.</li>
  <li><code>foregroundColor</code> (or <code>color</code>): @colordesc</li>
  <li><code>italic</code>: @booleandesc</li>
  <li><code>linkUrl</code> (or <code>link</code>): string representing an URL.</li>
  <li><code>strikeThrough</code> (or <code>strike</code>): @booleandesc</li>
  <li><code>textAlignment</code> (or <code>align</code>): either <code>"normal"</code>, <code>"superscript"</code> or <code>"subscript"</code></li>
  <li><code>underline</code>: @booleandesc</li>
</ul>


<h2>Visualize where formulas are being used</h2>

To make sure a field is computed and not just text, open "Formulas" and then click on "Highlight computed fields". The document above would be transformed to:

<blockquote>
  <span class="h1"><span class="highlight">MySoft 1.0 beta</span> is out!</span>
  <span class="highlight"><b>MySoft 1.0 beta</b></span> is a n<span class="highlight">iiiiiiiiii</span>ce software based on bidirectional evaluation <span class="highlight"><a href="https://dl.acm.org/citation.cfm?id=3276497">[mayer18]</a></span> that goes beyond the original ideas of prodirect manipulation <span class="highlight"><a href="https://dl.acm.org/citation.cfm?id=2908103">[chugh16]</a></span>
</blockquote>

You can hide these highlights by opening "Formulas" and click on "Remove highlights".

<h2>Reveal formulas</h2>

It can be useful to change formulas. To do so, open "Formulas" and click on "Reveal formulas". It will replace all computed fields by their respective formulas and highlight them in orange. You can then edit any formula:

<blockquote>
  <span class="h1"><span class="formula">=name</span> is out!</span>
  <span class="formula">=name</span> is a n<span class="formula">=(function() { var x = ""; var i = 10; while(i-- > 0) x = x + "i"; return x} ())</span>ce software based on bidirectional evaluation <span class="formula">=cite("mayer18")</span> that goes beyond the original ideas of prodirect manipulation <span class="formula">=cite("chugh16")</span>
</blockquote>

Once you're done, click on "Formulas" and then "Evaluate formulas" to replace the formulas by their values.<br>If you click on "Reveal formula under cursor", and the cursor touches a formula, it will let you edit only this formula, for example

<blockquote>
  <span class="h1"><span class="formula">=name</span> is out!</span>
  <b>MySoft 1.0</b> is a niiiiiiiiiice software based on bidirectional evaluation <a href="https://dl.acm.org/citation.cfm?id=3276497">[mayer18]</a> that goes beyond the original ideas of prodirect manipulation <a href="https://dl.acm.org/citation.cfm?id=2908103">[chugh16]</a>
</blockquote>

<h2>Availability</h2>

This extension is available as a <a href="https://chrome.google.com/webstore/detail/kgjbgmonlnhglokmfnpnklegakfknbeh">Google docs add-on</a> that can be added to any document by opening it, open "Add-ons" and click "Add add-on", and look for "Formulas for Google Docs".

<h2>Wish list</h2>

There are many features one would like from this extension:
<ul>
<li>Modify a formula's value from anywhere in the document</li>
<li>Give a name to some portion of the text within the document</li>
<li>Automatically find the formula that would generate some text prefixed with @@</li>
</ul>
They will be coming soon, stay tuned!<br><br>

Copy-and paste unfortunately cannot be supported due to how formulas are stored. However, you can reveal a particular formula to duplicate it.
</div>
</body></html>