// download: HTML form elements.html
// output: html
let option = {apply=\value,selected,content. {tag= "option", attributes={value=value} & (if(selected) {selected="selected"} else {}), children=content},
unapply=\t. (t match {
  case {attributes={value=value,selected=_}, children=content} => {value = [value, true, content] }
  case {attributes={value=value},children=content} =>
   {value = [value, false, content] }
  case _ => {}
}) } in
let select array = {
  apply=\index.
   letrec aux acc i options = options match {
     case [] => acc
     case [opt] ++ tail =>
       let newAcc = acc ++ [option [i + "", i == index, opt]] in
       let newI = i + 1 in
       aux newAcc newI tail
   } in
  {tag="select", attributes={`selected-index`=index + "", onchange="this.setAttribute('selected-index', this.selectedIndex)"}, children= aux [] 0 array}
} in
let [index, vi, vt, o1, o2, o3] = [0, "", "", "Mr.", "Mrs.", "Dear"] in
[{tag="h1", children="HTML5 Form elements"},
"In this demo, we demonstrate that we can put HTML5 demo elements and recover their values during update. For that, we force the change of an input to update its content.",{tag="br"},
select [o1, o2, o3] index ,{tag="br"},
{tag="input", attributes={type="text", value=vi, placeholder="Enter your name", onchange="this.setAttribute('value',this.value)"}},{tag="br"},
{tag="textarea", attributes={onchange="this.textContent = this.value",placeholder="What is your dream"}, children=[{tag="#text", value=vt}]},
{tag="br"},
"Once you fill in the above, below you will find an interactive and retro-compatible summary.",{tag="br"},
if(index >= 0) ["Selected index: ", index, {tag="br"}] else [],
if(vi != "") [{tag="span",styles={color="red",`font-size`="2em"},children =
  ([o1, o2, o3] index) + !" " + vi + (if(vt != "") ", I hope that you will be able " + vt else "")}] else []
]