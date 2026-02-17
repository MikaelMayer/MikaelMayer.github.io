// download: svg-test.html
// output: html
let fill = "yellow" in
let circle cx cy fill = {tag = "circle", attributes = {cx = cx, cy = cy, r = "40", stroke = "green", fill = fill}, children = []} in
{tag = "svg", attributes = {width = "250", height = "100"}, children = [circle "50" "50" fill, circle "120" "50" fill,
  { tag = "text", attributes = {fill="red",x="0",y="100"}, children = [{tag= "#text", value="The color is currently "+fill}]}
]}