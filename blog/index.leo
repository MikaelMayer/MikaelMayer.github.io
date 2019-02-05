entries = [("2019-02-05-future-of-programming.html", "Abstract and Concrete: Future of Programming")]

dateOf name = Regex.extract """(\d\d\d\d-\d+-\d+)""" name 
  |> Maybe.map (\[x] -> x + ": ")
  |> Maybe.withDefault ""

<html>
<head>
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
</style>
</head>
<body>
<div>
<h1>Mikaël Mayer's blog</h1>
@(["ul", [], flip List.map entries <| \(file, title) ->
  <li><a href=@file>@(dateOf file) @title</a></li>
])
</div>
</body>
</html>