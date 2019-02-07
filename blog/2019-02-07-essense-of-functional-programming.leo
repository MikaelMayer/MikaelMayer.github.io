preludeEnv = __CurrentEnv__

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
div[code] { 
  font-size: inherit !important;
}
</style>
</head><body><div>

<h1>The essence of functional programming</h1>
<em>2019/02/07 &mdash; Mikaël Mayer</em>
<p><i>This article requires readers to be familiar with the notion of functional programming<i></p>
<p>
Programming is an art. There are many ways to achieve the same purpose. In this article, I will informally review some of the common idioms when it comes to chaining operations on data.
</p>
<p>
Let us look at the following function in Javascript:
</p>
<pre><div code="""
var convertData = function(input) {
  var intermediate = convert(input)
  if(intermediate == null)
    return {ctor: "Err", _0: input + " is not convertible"};
  var intermediate2 = convert2(intermediate); // Always succeed
  intermediate3 = convert2(intermediate2);
  if(intermediate3 == null) return {ctor: "Err", _0: input + " is not convertible again"};
  return {ctor: "Ok", _0: intermediate3}
}
""" list-ghost-attributes="class draggable style" children-are-ghosts="true" save-ghost-attributes="style"></div></pre>
</div>
<script>
var script = document.createElement('script');
script.src = 'https://cdnjs.cloudflare.com/ajax/libs/ace/1.4.2/ace.js';
script.async = false;
script.setAttribute("isghost", "true");
document.head.appendChild(script);
script = document.createElement('script');
script.innerText = `
  var q = document.querySelectorAll("pre > div[code]");
  for(var i = 0; i < q.length; i++) {
    var aceeditor = ace.edit(q[i], {
      mode: "ace/mode/javascript",
      selectionStyle: "text",
      maxLines: 30
    });
    aceeditor.setValue(q[i].getAttribute("code"));
    aceeditor.on("change", ((qi, aceeditor) => (e) => {
      qi.setAttribute("code", aceeditor.getValue());
      })(q[i], aceeditor))
  }`;
script.async = false;
script.setAttribute("isghost", "true");
onAceLoaded = (delay) => () => {
  if(typeof ace != "undefined") {
    console.log("ace loaded.")
    document.head.appendChild(script)
  } else {
    console.log("ace not loaded. Retrying in " + (delay * 2) + "ms");
    setTimeout(onAceLoaded(delay * 2), 100);
  }
}
onAceLoaded(1)();
</script>
</body></html>