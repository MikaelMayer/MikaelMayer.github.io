include = if listDict.get "include" vars == Just "true" then include else (always [])

lineOf filename whatregexp =
  case Regex.extract ("^([\\s\\S]*)" + whatregexp) (fs.read filename|> Maybe.withDefault "") of
    Just (linesBefore :: _) -> Regex.split "\n" linesBefore |> List.length
    _ -> 0

preludeEnv = __CurrentEnv__

Maybe = { Maybe |
  map2 f ma mb = case ma of
    Just a -> case mb of
      Just b -> Just (f a b)
      Nothing -> Nothing
    Nothing -> Nothing
  
  andThen2 f ma mb = case ma of
    Just a -> case mb of
      Just b -> f a b
      Nothing -> Nothing
    Nothing -> Nothing
    }

language = listDict.get "lang" vars |> Maybe.withDefault "Elm"

ace language code = <div language=@language code=@code list-ghost-attributes="class draggable style" children-are-ghosts="true" save-ghost-attributes="style"></div>

markcodeghostactive step = """
var q = @(step).querySelectorAll("div[code][ghost-active]");
if(q.length == 0) {
  var whichone = @(step).matches(".second") ? 1 : 0;
  q = @(step).querySelectorAll("div[code]");
  for(var i = 0; i < q.length; i++) {
    q[i].setAttribute("ghost-active", i == whichone ? "true" : "false");
  }
}"""

with = "with"

(co, fw, ff, bw, bb, ok, err, maybefold, maybemap, maybewithdefault, result,
 message,
 language, otherlanguage) = case language of
  "Elm" ->
    (":", "|>", ">>", "<|", "<<", "Ok", "Err", "Maybe.fold", "Maybe.map", "Maybe.withDefault", "Result",
     [],
     "Elm", "Haskell")
  "Haskell" ->
    (" ::", "|>", ".>", "$ ", ". ", "Right", "Left", "maybe", "fmap", "fromMaybe", "Either",
     <span> (assuming the <a href="http://hackage.haskell.org/package/flow-1.0.17/docs/Flow.html">Flow operators for forward composition)</span>,
     "Haskell", "Elm")

langkeyword = String.toLowerCase language

otherurl = 
  listDict.get "buildFilename" vars
  |> Maybe.andThen (\buildFilename ->
       buildFilename otherlanguage |> Result.toMaybe)
  |> Maybe.withDefault  ("2019-02-08-essense-of-functional-programming.leo?lang=" + otherlanguage)

syncbuttons step = """
var first = @(step).querySelector("div[code]").getAttribute("ghost-active") == "true";
@(step).querySelector("button.previous").setAttribute("ghost-active", first ? "false" : "true");

var final = @(step).querySelector("div[code]:last-of-type").getAttribute("ghost-active") == "true";
@(step).querySelector("button.next").setAttribute("ghost-active", final ? "false" : "true");
@(step).querySelector("button.final").setAttribute("ghost-active", final ? "false" : "true");
"""

steps otherclasses codeEditors =
  <div class=@("step" + otherclasses)><button class="previous" onclick="""
var step = this.parentNode;
@(markcodeghostactive "step");
var q = step.querySelector("div[code][ghost-active=true]");
if(q && q.previousElementSibling && q.previousElementSibling.matches("div[code]")) {
  q.setAttribute("ghost-active", "false");
  q.previousElementSibling.setAttribute("ghost-active", "true");
}
@(syncbuttons "step")""">&lt;Previous</button>&mdash;<button class="next" onclick="""
var step = this.parentNode;
@(markcodeghostactive "step");
var q = step.querySelector("div[code][ghost-active=true]");
if(q && q.nextElementSibling && q.nextElementSibling.matches("div[code]")) {
  q.setAttribute("ghost-active", "false");
  q.nextElementSibling.setAttribute("ghost-active", "true");
  step.querySelector("button.previous").setAttribute("ghost-active", "true");
}
@(syncbuttons "step")""">Next&gt;</button><button class="final" onclick="""
var step = this.parentNode;
@(markcodeghostactive "step");
var qs = step.querySelectorAll("div[code][ghost-active]");
var q = step.querySelector("div[code][ghost-active=true]");
if(q && qs.length > 0 && qs[qs.length - 1].matches("div[code][ghost-active=false]")) {
  var last = qs[qs.length - 1];
  q.setAttribute("ghost-active", "false");
  last.setAttribute("ghost-active", "true");
}
@(syncbuttons "step")""">Last&gt;&gt;</button>@codeEditors<script>
var step = document.currentScript.parentElement;
@(markcodeghostactive "step")
@(syncbuttons "step")</script></div>

<html><head><meta content="text/html; charset=UTF-8" http-equiv="content-type">
<link rel="stylesheet" type="text/css" href="index.css">
<style>
.step > button {
  min-height: 48px;
  font-size: 0.5rem;
}
div.step:not(.second) button.previous:not([ghost-active=true]), div.step button.previous[ghost-active=false] {
  opacity: 0.5;
  cursor: inherit;
}
button.next[ghost-active=false] {
  opacity: 0.5;
  cursor: inherit;
}
button.final[ghost-active=false] {
  opacity: 0.5;
  cursor: inherit;
}
div.step > div[code] {
  display: none;
}
div.step:not(.second) > div[code]:not([ghost-active=false]):first-of-type {
  display: block;
}
div.step.second > div[code]:not([ghost-active=false]):nth-of-type(2) {
  display: block;
}

div.step > div[code][ghost-active=true] {
  display: block;
}
div.step > div[code][ghost-active=false] {
  display: none;
}
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
  margin-top: 5px;
  margin-bottom: 5px;
}
</style>
</head><body>@(include "menu.elm")<div>

<h1>The essence of functional programming</h1>
<em>2019/02/08 &mdash; Mikaël Mayer</em>.<br>
<i>This article requires readers to be familiar with the notion of functional programming. It is written in @language. If you prefer @otherlanguage, you can also <a href=@otherurl>read the @otherlanguage version of the article</a>.</i>
<br><br>
Programming is an art. There are many ways to achieve the same purpose. In this article, I will informally review some of the common idioms when it comes to chaining operations on data.
<br><br>
Let us look at the following function in Javascript. It converts the input using three converters: <code>convert</code> might return <code>null</code>, <code>convert2</code> always succeeds, and <code>convert3</code> might return null. <code>convertData</code> returns either an error or a result:

@(ace "javascript" """var convertData = (input) => {
  var intermediate = convert(input);
  if(intermediate === null)
    return {ctor: "@err", _0: "problem 1"};
  var intermediate2 = convert2(intermediate);
  intermediate3 = convert3(intermediate2);
  if(intermediate3 === null)
    return {ctor: "@err", _0: "problem 2"};
  return {ctor: "@ok", _0: intermediate3};
};""")

<h2>From imperative to pattern matching</h2>
To rewrite <code>convertData</code> to a functional language, such as @language, we first assume the following type definitions for the functions <code>convert</code>, <code>convert2</code> and <code>convert3</code>:

@(ace langkeyword """convert@co a -> Maybe b
convert2@co b -> c
convert3@co c -> Maybe d""")
Now we can rewrite <code>convertData</code> using pattern matching:
@(ace langkeyword """convertData@co a -> @result String d
convertData input =
  case convert input of
    Nothing ->
      @err "problem 1"

    Just intermediate ->
      let intermediate2 = convert2 intermediate in
      case convert3 intermediate2 of
        Nothing ->
          @err "problem 2"

        Just intermediate3 ->
          @ok intermediate3""")

<h2>From pattern matching to monadic style</h2>
However, besides type-checking, pattern matching does not provide that much benefit. For example, we still have intermediate names.
To avoid intermediate names, we can re-write our function in a monadic style (press Next&gt; to view the refactoring step by step):
@(steps " second" [
ace langkeyword """convertData@co a -> @result String d
convertData input =
  case convert input of
    Nothing ->
      @err "problem 1"

    Just intermediate ->
      let intermediate2 = convert2 intermediate in
      case convert3 intermediate2 of
        Nothing ->
          @err "problem 2"

        Just intermediate3 ->
          @ok intermediate3""",
ace langkeyword """convertData@co a -> @result String d
convertData input =
  convert input
  @fw @maybemap (\intermediate ->
      let intermediate2 = convert2 intermediate in
      case convert3 intermediate2 of
        Nothing ->
          @err "problem 2"

        Just intermediate3 ->
          @ok intermediate3
    )
  @fw @maybewithdefault (@err "problem 1")""",
ace langkeyword """convertData@co a -> @result String d
convertData input =
  convert input
  @fw @maybemap convert2
  @fw @maybemap (\intermediate2 ->
      case convert3 intermediate2 of
        Nothing ->
          @err "problem 2"

        Just intermediate3 ->
          @ok intermediate3
    )
  @fw @maybewithdefault (@err "problem 1")""",
ace langkeyword """convertData@co a -> @result String d
convertData input =
  convert input
  @fw @maybemap convert2
  @fw @maybemap (\intermediate2 ->
      convert3 intermediate2
      @fw @maybemap (\intermediate3 ->
        @ok intermediate3)
      @fw @maybewithdefault (@err "problem 2")
    )
  @fw @maybewithdefault (@err "problem 1")""",
ace langkeyword """convertData@co a -> @result String d
convertData input =
  convert input
  @fw @maybemap convert2
  @fw @maybemap (
      convert3
      @ff @maybemap (\intermediate3 ->
        @ok intermediate3)
      @ff @maybewithdefault (@err "problem 2")
    )
  @fw @maybewithdefault (@err "problem 1")""",
ace langkeyword """convertData@co a -> @result String d
convertData input =
  convert input
  @fw @maybemap convert2
  @fw @maybemap (
      convert3
      @ff @maybemap @ok
      @ff @maybewithdefault (@err "problem 2")
    )
  @fw @maybewithdefault (@err "problem 1")""",
ace langkeyword """convertData@co a -> @result String d
convertData =
  convert
  @ff @maybemap convert2
  @ff @maybemap (
      convert3
      @ff @maybemap @ok
      @ff @maybewithdefault (@err "problem 2")
    )
  @ff @maybewithdefault (@err "problem 1")"""])
The operator <code>@fw</code> passes the computation to its left as the last argument of the expression to the right, and the operator <code>@ff</code> composes functions such that the function on its left is executed first@message.<br> This formulation is useful, because now we don't need to name intermediates, we can just chain functions.
<br><bt>

<h2>From pattern matching to continuation-passing style</h2>
There are several drawbacks to the monadic approach. First, compared to pattern matching, it reports problems at the end and in reverse order, which is not intuitive.
Second, it still needs indentation that will increase if we add conversions, which we did not need in the JavaScript imperative version.
<br><br>
Fortunately, there is another way to express the initial chain to catch early errors, using the <code>@maybefold</code> operator:
@(ace langkeyword """@maybefold@co c -> (a -> c) -> Maybe a -> c
@maybefold onNothing onJust value =
  case value of
    Nothing ->
      onNothing
    
    Just x ->
      onJust x
""")

Using <code>@maybefold</code>, let's start over from pattern matching and express <code>convertData</code> in another way:
@(steps "" [
ace langkeyword """convertData@co a -> @result String d
convertData input =
  case convert input of
    Nothing ->
      @err "problem 1"

    Just intermediate ->
      let intermediate2 = convert2 intermediate in
      case convert3 intermediate2 of
        Nothing -> @err "problem 2"
        Just intermediate3 ->
          @ok intermediate3""",
ace langkeyword """convertData@co a -> @result String d
convertData input =
  convert input
  @fw @maybefold (@err "problem 1") (\intermediate ->
      let intermediate2 = convert2 intermediate in
      case convert3 intermediate2 of
        Nothing -> @err "problem 2"
        Just intermediate3 ->
          @ok intermediate3
     )""",
ace langkeyword """convertData@co a -> @result String d
convertData input =
  convert input
  @fw @maybefold (@err "problem 1") (\intermediate ->
      let intermediate2 = convert2 intermediate in
      convert3 intermediate2
      @fw @maybefold (@err "problem 2") (\intermediate3 ->
          @ok intermediate3
      )
     )""",
ace langkeyword """convertData@co a -> @result String d
convertData input =
  convert input
  @fw @maybefold (@err "problem 1") (\intermediate ->
      let intermediate2 = convert2 intermediate in
      convert3 intermediate2
      @fw @maybefold (@err "problem 2") @ok
     )"""])

It might seem that we cannot refactor further. Fortunately, we can define <code>@with</code> that transforms function application to callback style:
@(ace langkeyword """@with@co (a -> b) -> (b -> c) -> a -> c
@with function callback value =
       callback (function value)""")
so that now we can continue the transformation:
@(steps " second" [
ace langkeyword """convertData@co a -> @result String d
convertData input =
  convert input
  @fw @maybefold (@err "problem 1") (\intermediate ->
      let intermediate2 = convert2 intermediate in
      convert3 intermediate2
      @fw @maybefold (@err "problem 2") @ok
    )""",
ace langkeyword """convertData@co a -> @result String d
convertData input =
  @with convert 
    (@maybefold (@err "problem 1") (\intermediate ->
      let intermediate2 = convert2 intermediate in
      convert3 intermediate2
      @fw @maybefold (@err "problem 2") @ok
    )) input""",
ace langkeyword """convertData@co a -> @result String d
convertData =
  @with convert 
    (@maybefold (@err "problem 1") (\intermediate ->
      let intermediate2 = convert2 intermediate in
      convert3 intermediate2
      @fw @maybefold (@err "problem 2") @ok
    ))""",
ace langkeyword """convertData@co a -> @result String d
convertData =
  @with convert 
    (@maybefold (@err "problem 1") (\intermediate ->
      @with convert2 (\intermediate2 ->
      convert3 intermediate2
      @fw @maybefold (@err "problem 2") @ok
      ) intermediate
    ))""",
ace langkeyword """convertData@co a -> @result String d
convertData =
  @with convert 
    (@maybefold (@err "problem 1") (
      @with convert2 (\intermediate2 ->
      convert3 intermediate2
      @fw @maybefold (@err "problem 2") @ok
    )))""",
ace langkeyword """convertData@co a -> @result String d
convertData =
  @with convert 
    (@maybefold (@err "problem 1") (
      @with convert2 (\intermediate2 ->
      @with convert3 
        (@maybefold (@err "problem 2") @ok)
        intermediate2
    )))""",
ace langkeyword """convertData@co a -> @result String d
convertData =
  @with convert 
    (@maybefold (@err "problem 1") (
      @with convert2 (
      @with convert3 
        (@maybefold (@err "problem 2") @ok)
    )))""",
ace langkeyword """convertData@co a -> @result String d
convertData =
  @with convert 
  @bw @maybefold (@err "problem 1") (
      @with convert2 (
      @with convert3 
        (@maybefold (@err "problem 2") @ok)
    ))""",
ace langkeyword """convertData@co a -> @result String d
convertData =
  @with convert 
  @bw @maybefold (@err "problem 1")
  @bw  @with convert2 (
      @with convert3 
        (@maybefold (@err "problem 2") @ok)
    )""",
ace langkeyword """convertData@co a -> @result String d
convertData =
  @with convert 
  @bw @maybefold (@err "problem 1")
  @bw  @with convert2
  @bw  @with convert3 
        (@maybefold (@err "problem 2") @ok)""",
ace langkeyword """convertData@co a -> @result String d
convertData =
  @with convert 
  @bw @maybefold (@err "problem 1")
  @bw  @with convert2
  @bw  @with convert3 
  @bw    @maybefold (@err "problem 2") @ok""",
ace langkeyword """convertData@co a -> @result String d
convertData =
    @with convert 
  @bw @maybefold (@err "problem 1")
  @bw @with convert2
  @bw @with convert3 
  @bw @maybefold (@err "problem 2")
  @bw @ok"""])

The operator <code>@bw</code> passes the expression at its right (in our case, always a callback) as the last argument of the expression to its left.<br> In general, callbacks have also the advantage of being immediately compatible with asynchronous computations.<br>
Moreover, what if <code>convertData</code> also accepted a callback as the first argument? Then we would be able to express it concisely as well.

@(steps " second" [
ace langkeyword """convertData@co a -> @result String d
convertData =
    @with convert 
  @bw @maybefold (@err "problem 1")
  @bw @with convert2
  @bw @with convert3 
  @bw @maybefold (@err "problem 2")
  @bw @ok""",
ace langkeyword """convertData@co a -> @result String d
convertData input =
  ( @with convert 
  @bw @maybefold (@err "problem 1")
  @bw @with convert2
  @bw @with convert3 
  @bw @maybefold (@err "problem 2")
  @bw @ok ) input""",
ace langkeyword """convertData@co (@result String d -> e) -> a -> e
convertData callback input =
  ( @with convert
  @bw @maybefold (@err "problem 1")
  @bw @with convert2
  @bw @with convert3
  @bw @maybefold (@err "problem 2")
  @bw @with @ok
  @bw callback) input""",
ace langkeyword """convertData@co (@result String d -> e) -> a -> e
convertData callback =
    @with convert
  @bw @maybefold (@err "problem 1")
  @bw @with convert2
  @bw @with convert3
  @bw @maybefold (@err "problem 2")
  @bw @with @ok
  @bw callback""",
ace langkeyword """convertData@co (@result String d -> e) -> a -> e
convertData =
    @with convert
  @bb @maybefold (@err "problem 1")
  @bb @with convert2
  @bb @with convert3
  @bb @maybefold (@err "problem 2")
  @bb @with @ok"""])
The operator <code>@bb</code> composes functions naturally, meaning <code>(f @bb g) x</code> = <code>f (g x)</code>.<br><br>
At this point, it's normal to pause and marvel a bit. We use the operator <code>@bb</code> which is normally used to chain functions from right to left, that is,<br><code>(f @bb g) x</code> = <code>f (g x)</code>. In our case, because they are callbacks, the chaining makes the callbacks to be executed left to right, because <br><code>(f @bb g) callback x</code> = <br><code>(f @bw g callback) x</code> = <br><code>f (g callback) x</code> = <br><code>f (\y -> g callback y) x</code><br>which guarantees that g is executed with the result of f, not the other way round.

<h2 id="non-linear-workflows">Non-linear workflows</h2>

The previous style is great, but what if we need to refer to some of the intermediate results to parametrize a further computation?
Although named disappeared, it's possible to reintroduce them.<br>
Suppose that the new signature for <code>convert3</code> is the following:
@(steps " second"  [
ace langkeyword """convert@co a -> Maybe b
convert2@co b -> c
convert3@co c -> Maybe d""",
ace langkeyword """convert@co a -> Maybe b
convert2@co b -> c
convert3@co b -> c -> Maybe d"""])

Because of the callback-style workflow, it would be natural to write:
@(steps " second" [
ace langkeyword """convertData@co (@result String d -> e) -> a -> e
convertData callback =
     @with convert
  @bw @maybefold (@err "problem 1")

  @bw @with convert2
  @bw @with convert3
  @bw @maybefold (@err "problem 2")
  @bw @with @ok
  @bw callback""",
ace langkeyword """convertData@co (@result String d -> e) -> a -> e
convertData callback =
     @with convert
  @bw @maybefold (@err "problem 1")
  @bw \b ->
  (  @with convert2
  @bw @with (convert3 b)
  @bw @maybefold (@err "problem 2")
  @bw @with @ok
  @bw callback) b"""
])
However, it is hard to see how to reduce that further, and remove the <code>b</code> after parentheses.
Looking closely, we see that the callback is in any case applying <code>b</code> to some function.
This means we can give a name to this construct.
Let us introduce the <code>nameIt</code> operator that builds a callback by applying the value twice to it:
@(ace langkeyword """nameIt@co (a -> a -> b) -> a -> b
nameIt nameToCallback value =
  (nameToCallback value) value""")
Now, the workflow can be rewritten:
@(steps " second" [
ace langkeyword """convertData@co (@result String d -> e) -> a -> e
convertData callback =
     @with convert
  @bw @maybefold (@err "problem 1")
  @bw \b ->
  (  @with convert2
  @bw @with (convert3 b)
  @bw @maybefold (@err "problem 2")
  @bw @with @ok
  @bw callback) b""",
ace langkeyword """convertData@co (@result String d -> e) -> a -> e
convertData callback =
     @with convert
  @bw @maybefold (@err "problem 1")
  @bw nameIt <| \b ->
     @with convert2
  @bw @with (convert3 b)
  @bw @maybefold (@err "problem 2")
  @bw @with @ok
  @bw callback"""
])
To fully get rid of the <code>callback</code> argument, we would have to make <code>nameIt</code> accept it as second argument:
@(ace langkeyword """withName@co (a -> a -> b) -> (b -> e) -> a -> e
withName nameToCallback callback value =
  (nameToCallback value callback) value""")
Thus the final function becomes:
@(steps " second" [
ace langkeyword """convertData@co (@result String d -> e) -> a -> e
convertData callback =
     @with convert
  @bw @maybefold (@err "problem 1")
  @bw nameIt <| \b ->
     @with convert2
  @bw @with (convert3 b)
  @bw @maybefold (@err "problem 2")
  @bw @with @ok
  @bw callback""",
ace langkeyword """convertData@co (@result String d -> e) -> a -> e
convertData callback =
     @with convert
  @bw @maybefold (@err "problem 1")
  @bw withName (\b ->
     @with convert2
  @bb @with (convert3 b)
  @bb @maybefold (@err "problem 2")
  @bb @with @ok )
  @bw callback""",
ace langkeyword """convertData@co (@result String d -> e) -> a -> e
convertData =
    @with convert
  @bb @maybefold (@err "problem 1")
  @bb withName (\b ->
     @with convert2
  @bb @with (convert3 b)
  @bb @maybefold (@err "problem 2")
  @bb @with @ok )"""
])

Because @bb has higher precedence over @bw, we cannot remove the final parentheses.
So choosing the earlier "@bw" version vs. the "@bb" version just above is a matter of taste.

<h2>Epilogue: Towards Church encoding</h2>
It is surprising that, using default operators such as <code>@bb</code>, we obtain a code as concise as the imperative style, with error catching in the correct order.<br><br>
In his minimalistic functional language where only functions are values, Church <a href="https://en.wikipedia.org/wiki/Church_encoding">naturally encodes</a> datatypes <code>Maybe</code> and <code>@result</code> as continuation passing style.<br>


Therefore, a <code>Just x</code> becomes a <code>(\onNothing onJust -> onJust x)</code>, whereas a <code>Nothing</code> becomes a <code>(\onNothing onJust -> onNothing)</code>.<br>

Continuation-passing style is therefore not something new, but the ancestral way of writing functional code.<br><br>

The inspiration of this article came from the build file itself I used to build this blog (<a href="""https://github.com/MikaelMayer/MikaelMayer.github.io/blob/master/blog/hydefile.elm#L@(lineOf "hydefile.elm" "#1 Use of CPS" + 1)""">here</a> and <a href="""https://github.com/MikaelMayer/MikaelMayer.github.io/blob/master/blog/hydefile.elm#L@(lineOf "hydefile.elm" "#2 Use of CPS" + 1)""">here</a>).
</div>
<script>
(typeof setGhostOnInserted != "undefined" ? setGhostOnInserted : []).push(insertedNode => insertedNode.tagName == "SCRIPT" && insertedNode.getAttribute("src") && insertedNode.getAttribute("src").startsWith("https://cdnjs.cloudflare.com/ajax/libs/ace/1.4.2/mode-"));
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
    aceeditor.setOption("highlightActiveLine", false);
    aceeditor.setOption("readOnly", true);
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