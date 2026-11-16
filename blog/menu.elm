extension = if listDict.get "filename" vars /= Nothing then
  ".html" else
  ".leo"

<div class="menu">
  <a href=@("index" + extension)>Back to index</a>
</div>