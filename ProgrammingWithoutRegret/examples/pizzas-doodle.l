// download: pizzas-doodle.html
// output: html
// hideprogram: false

letrec indices list = list match {
  case [] => []
  case [head] ++ tail => (indices tail) ++ [tail.length]
} in

letrec map list fun = list match {
  case [] => []
  case [head] ++ tail => [fun head] ++ (map tail fun)
} in

letrec ruleToString acc rules = rules match {
  case [] => acc
  case [head] ++ tail =>
     let newAcc = head match {
       case [key, value] => acc + !"\n  " + key + !":" + value + !";"
       case kv => acc + !"\n  " + kv
     } in
     ruleToString newAcc tail
} in
let style stylesheet =
  letrec style_aux acc stylesheet = stylesheet match {
  case [] => acc
  case [head] ++ tail =>
    let newAcc = acc + (head match {
      case [selector, rules] =>
        selector + !"{" + (ruleToString "" rules) + !"\n}"
    }) in
    style_aux newAcc tail
} in {tag = "STYLE", children=[{tag="#text", value=style_aux "" stylesheet}]} in
let rule = { apply=\selector.\rules.[selector, rules], default=\selector.\rules.[selector, rules]} in
let s = { default=\name.\value.[name, value],apply=\name.\value.[name, value] } in
let t = {
  default=\tagName.{
    withAttrs=\attributes.\children.{tag=tagName.toUpperCase, attributes=attributes, children=children} ,
    apply=\children.{tag=tagName.toUpperCase, children=children}
  },apply=\tagName.{
    withAttrs=\attributes.\children.{tag=tagName.toUpperCase, attributes=attributes, children=children} ,
    apply=\children.{tag=tagName.toUpperCase, children=children}
  }
} in
let text = { default=\value.{tag="#text", value=value},apply=\value.{tag="#text", value=value} } in
let css = style [
  rule ".partTableCell" [
    s.cursor "pointer"
  ],
  rule ".hiddenAcc" [
    s.display "block",
    s.position "absolute",
    s.top "-999em"
  ],
  rule ".form-control, textarea, select, input[type=\"text\"], input[type=\"password\"], input[type=\"datetime\"], input[type=\"datetime-local\"], input[type=\"date\"], input[type=\"month\"], input[type=\"time\"], input[type=\"week\"], input[type=\"number\"], input[type=\"email\"], input[type=\"url\"], input[type=\"search\"], input[type=\"tel\"], input[type=\"color\"], .uneditable-input" [
  s.height "30px",
  s "padding-top" "4px",
  s "padding-bottom" "4px",
  s "border-radius" "0",
  s "border-color" "#b7b7b7",
  s "font-size" "13px"
  ],
  rule ".textPoll th, .textPoll .foot td" [
      s "max-width" "94px"
  ],
  rule "label" [
      s "font-weight" "normal"
  ],
  rule "label" [
      s.display "inline-block",
      s "margin-bottom" "5px",
      s "font-weight" "bold"
  ],
  rule "table.poll tr.participation td" [
    s "text-align" "center",
    s "background-color" "#eaeaea"
  ],
  rule "table.poll tr.participant td.n" [
    s "background-color" "#ffccca"
  ],
  rule "table.poll tr.participant td.y" [
    s "background-color" "#d1f3d1"
  ],
  rule "table.poll tr.participant td" [
    s "text-align" "center",
    s "vertical-align" "middle",
    s.height "33px"
  ],
  rule "table.poll tr.participation td:hover, table.poll tr.participation.inEdit td:hover" [
    s "background-color" "#d6d6d6"],
  rule "table.poll tr.participation td.pname,table.poll tr.participant td.pname" [
      s.position "relative",
      s "min-width" "182px",
      s.width "182px",
      s "border-top" "1px solid #fff",
      s "border-bottom" "2px solid #fff",
      s.background "url('http://doodle.com/builtstatic/1465286543/doodle/graphics/sprites/common/normal-s92f91c2182.png') -15px -972px no-repeat #fff",
      s.imageRendering "-moz-crisp-edges",
      s.imageRendering "-o-crisp-edges",
      s.imageRendering "-webkit-optimize-contrast",
      s.imageRendering "crisp-edges",
      s "-ms-interpolation-mode" "nearest-neighbor",
      s.padding "0 2px 0 0"
  ],
  rule "table.poll tr.header.month th.xsep" [
      s.background "url(\"http://doodle.com/graphics/polls/tick31r.png\") right 0 repeat-y #3385e4",
      s "padding-right" "13px"
  ],
  rule "table.poll td.pname div.pname" [
      s "text-align" "left",
      s "font-size" "15px",
      s "line-height" "15px",
      s.padding "8px 0 5px 0",
      s "margin-left" "3px",
      s "white-space" "nowrap",
      s.overflow "hidden",
      s "max-width" "135px",
      s.width "135px",
      s.position "relative"
  ],
  rule "table.poll tr.date th, table.poll tr.date td" [
  s.background "#3385e4",
  s.color "#fff"
  ],
  rule "table.poll" [
    s "border-collapse" "separate"
  ],
  rule "table.poll tr.date.month th" [
    s "padding-top" "7px",
    s "padding-bottom" "3px"
  ],
  rule "table.poll tr.header th, table.poll tr.header td" [
    s.padding "0 10px 0"
  ],
  rule "table.poll th, table.poll td" [
    s "font-size" "13px",
    s "line-height" "17px",
    s "font-weight" "normal"
  ],
  rule "table.poll tr.participation td.pname input" [
  s "font-size" "12px",
  s.height "24px",
  s "line-height" "20px",
  s.margin "3px 0 3px 3px",
  s.width "131px",
  s.padding "2px 6px 2px 9px"
  ],

  rule "table.poll tr th.nonHeader.partCount, table.poll tr td.partCount" [
  s.background "#fff",
  s.padding "0 0 9px 0",
  s "vertical-align" "bottom",
  s "font-size" "13px",
  s.color "#323232",
  s "min-width" "184px",
  s.width "184px",
  s "font-weight" "bold",
  s "max-width" "none"
  ],
  rule "table.poll tr.sums td" [
  s "text-align" "center",
  s "line-height" "16px",
  s "padding-left" "5px",
  s "padding-right" "8px",
  s "padding-top" "5px",
  s.color "#6f6f6f"
  ],
  rule "table.poll tr.participant td.q" [
  s "background-color" "#eaeaea"
  ]
] in

let participants = [
  "John Doe",
  "Mam Butterfly",
  "Mysterious Man"
] in

let choix = [
  [0, 0, true ],
  [0, 1, false],
  [0, 2, false],
  [1, 0, false],
  [1, 1, true ],
  [1, 2, false],
  [2, 0, true ],
  [2, 1, true ],
  [2, 2, true ]
] in

let menus = [
  "Margharita",
  "Pepperoni",
  "Chicken"
] in


let addPerson = {
  apply = \participants,choix. "",
  update = \p.
    let [oldParticipants, oldChoix] = p.input in
    let newParticipant = p.outputNew in
    if(newParticipant != "")
      let newParticipants = oldParticipants ++ [newParticipant] in
      let newChoix = choix ++ (map (indices menus) (\i. [oldParticipants.length, i, false])) in
      {value = [newParticipants, newChoix] }
    else {value = [oldParticipants, oldChoix]}
} in


let total menuId =
  let menuIdStr = menuId.toString in
  letrec counter acc choices = choices match {
    case [[userId, mId,check]] ++ tail =>
      let newAcc = if(check) (if(matchIn menuIdStr mId.toString) acc + "#" else acc) else acc in
      counter newAcc tail
    case [] => acc.length.toString
  } in
  let n = counter "" choix in
  t.td [text n]
in

let checkBox colonne =
  t.td.withAttrs
    {class= "xsep", data= colonne.toString, id="box"+colonne.toString, title = "...."}
    [
      t.label.withAttrs
        { class= "hiddenAcc",
          forid="option" + colonne.toString }
        [text (menus colonne),
          t.input.withAttrs
            {id = "option" + colonne.toString,
             name ="p",
             type ="checkbox"} []
        ]
    ] in
letrec find list predicate = list match {
  case [] => {}
  case [head] ++ tail => if(predicate head) { value=head} else find tail predicate
} in

let WantsToEat personId menuId =
  let predicate = \entry.entry match { case [pId, mId, b] => if (matchIn pId.toString personId.toString) matchIn mId.toString menuId.toString else false } in
  (find choix predicate) match {
  case {value=choix} =>
    { apply=\choix.
  if (choix 2)
    t.td.withAttrs {
      class= "partTableCell y xsep pok",
      onclick = "this.classList.remove('pok');this.classList.add('pn');this.innerHTML = '<span>cancelling...</span>'",
      title= (participants personId) + ", " + (menus menuId) + ": Yes"
    } [t.span.withAttrs {class="glyphicon glyphicon-ok"} []]
  else
    t.td.withAttrs {
      class = "partTableCell n xsep pn",
      onclick = "this.classList.remove('pn');this.classList.add('pok');this.innerHTML='confirming...';",
      title = (participants personId) + ", " + (menus menuId)+ ": No"
    } [],
     unapply=\td. td match {
       case {children=[{tag="#text",value=v}]} =>
         {value= [choix 0, choix 1, true] }
       case _ => {value= [choix 0, choix 1, false] }
     }
    } choix
  case {}=>
    t.td.withAttrs {
      class = "partTableCell q sep pog",
      title = (participants personId) + ", " + (menus menuId)
    } [text "?"]
} in


let ligne menu =
    t.th [text menu] in

let nom personId =
  t.tr.withAttrs {class = "participant partMyself"} ([
    t.td.withAttrs {class = "pname", id = "part1367130755"} [
      t.div.withAttrs {class = "pname "} [
        text (participants personId)
      ]
    ]] ++
      (map (indices menus) (\menusId. WantsToEat personId menusId)))
  in

let page =
t.table.withAttrs {
  cellpadding = "0",
  cellspacing = "0",
  class = "poll textPoll ",
  summary ="LARA Thai"} [
  t.tbody ([
    t.tr.withAttrs {class = "header date month"} ([
      t.th.withAttrs {class = "nonHeader partCount boldText"} [
        t.div [text (participants.length.toString + " participants")]]] ++
      (map menus ligne)
    ),
    t.tr []] ++
    (map (indices participants) nom) ++ [
    t.tr.withAttrs {class = "participation yesNo"} ([
      t.td.withAttrs {class = "pname"} [
        t.label.withAttrs {class = "hiddenAcc", forid ="pname", title = "l10n_yourName"} [],
        t.input.withAttrs {class = "form-control", id = "pname", maxlength ="64", name ="name", placeholder="Your name",
          onkeypress = ``if(event.keyCode == 13) this.setAttribute("value", this.value);``,
        type ="text", value = addPerson [participants, choix]} []
      ]
    ] ++ (map (indices menus) checkBox))
  ] ++
    [t.tr.withAttrs { class = "sums" } ([
      t.td.withAttrs { class = "nonHeader" } []] ++
       (map (indices menus) total)
    )]
  )
] in
t.div [
  css,
  t.h1 [text "Pizza meeting"],
  t.p [text "Choose your favorite pizzas. We will order some to satisfy everyone."],
  page
]