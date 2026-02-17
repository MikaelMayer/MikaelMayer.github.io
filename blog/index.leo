extension = if listDict.get "filename" vars /= Nothing then
  ".html" else
  ".leo"

entries = [
  ("2019-02-13-google-docs-formulas", "Formulas for Google Docs"),
  ("2019-02-08-essence-of-functional-programming", "Essence of functional programming"),
  ("2019-02-05-future-of-programming", "Abstract and Concrete: Future of Programming")
]

dateOf name = Regex.extract """(\d\d\d\d-\d+-\d+)""" name 
  |> Maybe.map (\[x] -> x)
  |> Maybe.withDefault ""

<html>
<head>
<link rel="stylesheet" type="text/css" href="index.css">
<style>
img.mini {
  width: 15em;
}
ul {
  list-style-type: none;
}
a.entry {
  text-decoration: none;
  display: inline-block;
  vertical-align: top;
}
div.entry {
  display: inline-block;
  width: 15.1em;
  height: 9em;
  margin-right: 0.4em;
  margin-bottom: 1em;
}
div.subtitle {
  height: 3em;
  width: 15.1em;
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
  a.entry {
    width: 100%;
    display: block;
  }
  img.mini {
    width: 98%;
    margin-top: 1%;
    margin-left: 1%;
  }
  div.entry {
    width: 100%;
    display: block;
    height: auto;
    font-size: 5vh;
  }
  div.subtitle {
    height: auto;
    width: 100%;
  }
  a.entry:nth-child(even) {
    background: #DDD;
  }
}
</style>
</head>
<body>
<div>
<h1>Mikaël Mayer's blog</h1>
<button style="display:none" onclick="""
  var ul = document.getElementById("entries");
  

"""></button>
@(flip List.map entries <| \(file, title) ->
  let mini = "miniatures/" + file + ".png" in
  <a class="entry" href=@(file + extension)><div class="entry">@(if fs.isfile mini then [<img class="mini" src=@mini>] else [])<div class="subtitle" title=@(dateOf file)>@title</div></div></a>)
</div>
</body>
</html>