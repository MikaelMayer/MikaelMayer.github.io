preludeEnv = __CurrentEnv__

ace language code = <div language=@language code=@code list-ghost-attributes="class draggable style" children-are-ghosts="true" save-ghost-attributes="style"></div>

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
@(ace "javascript" """var convertData = (input) => {
  var intermediate = convert(input)
  if(intermediate === null)
    return {ctor: "Err", _0: "problem 1"};
  var intermediate2 = convert2(intermediate); // Always succeed
  intermediate3 = convert3(intermediate2);
  if(intermediate3 === null)
    return {ctor: "Err", _0: "problem 2"};
  return {ctor: "Ok", _0: intermediate3}
}""")
<p>
It's a no-brainer to convert it to a functional language such as Haskell or Elm:
</p>
@(ace "haskell" """convertData input =
  case convert input of
    Nothing -> Err "problem 1"
    Just intermediate ->
      let intermediate2 = convert2 intermediate in
      case convert3 intermediate of
        Nothing -> Err "problem 2"
        Just intermediate3 ->
          Ok intermediate3""")
<p>However, this is not much more concise. Plus, we need indentation which looks ugly. Fortunately, we can re-write our function in a monadic style to avoid having to do pattern matching:</p>
@(ace "haskell" """convertData input =
  convert input
  |> Maybe.map convert2
  |> Maybe.andThen convert3
  |> Result.fromMaybe  "problem" """)
<p>
The operator <code>|&gt;</code> passes the computation to the left as the last argument of the expression to the right. This formulation is nice, because now we don't need to name intermediate, we can just chain functions.
However, we loose the possibility to report custom errors at step 1 and 3.
Fortunately, there is another way to express the same chain, using the fold operator:</p>
@(ace "haskell" """convertData input =
  do (convert input)
  <| Maybe.fold (Err "problem 1")
  <| do convert3
  <| Maybe.fold (Err "problem 2")
  <| Ok
  
do argument callback =
     callback argument
""")
</p>
</div>
<script>
(setGhostOnInserted || []).push(insertedNode => insertedNode.tagName == "SCRIPT" && insertedNode.getAttribute("src") && insertedNode.getAttribute("src").startsWith("https://cdnjs.cloudflare.com/ajax/libs/ace/1.4.2/mode-"));
var script = document.createElement('script');
script.src = 'https://cdnjs.cloudflare.com/ajax/libs/ace/1.4.2/ace.js';
script.async = false;
script.setAttribute("isghost", "true");
document.head.appendChild(script);
script = document.createElement('script');
script.innerText = `
  var q = document.querySelectorAll("div[code]");
  for(var i = 0; i < q.length; i++) {
    var language = q[i].getAttribute("language") || "javascript";
    var aceeditor = ace.edit(q[i], {
      mode: "ace/mode/" + language,
      maxLines: 30
    });
    aceeditor.setValue(q[i].getAttribute("code"));
    aceeditor.selection.clearSelection();
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