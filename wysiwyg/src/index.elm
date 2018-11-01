bodypermissions = [["contenteditable", "true"]]

user  = vars |> case of {user} -> user; _ -> "Laurent"
hl    = vars |> case of {hl} -> hl; _ -> "en"
delay = vars |> case of {delay} -> String.toInt delay; _ -> 1000

userdata = [
    ("Mikael", 2)
  , ("Ravi", 4)
  , ("Laurent", 2)
  ]
  
options = nodejs.fileread "src/pizzas.txt"
  |> Maybe.withDefaultReplace (freeze """[
    "$Margharita",
    "$Queen",
    "Montagnarde",
    "Barbecue"]""")
  |> evaluate

dictionnaire = [
  ("English", [ ("abbreviation", "en")
              , ("Salut", "Hey")
              , ("Tuveuxquellepizza", "Which pizza do you want")
              , ("Choixfinaux", "Final choices")
              , ("achoisiunepizza", "wants a pizza")
              , ("Choisistapizza", "Choose your pizza")
              , ("Margharita", "Margharita")
              , ("Queen", "Queen")
              ]),
  ("Français", [ ("abbreviation", "fr")
               , ("Salut", "Salut")
               , ("Tuveuxquellepizza", "Tu veux quelle pizza")
               , ("Choixfinaux", "Choix finaux")
               , ("achoisiunepizza", "a choisi une pizza")
               , ("Choisistapizza", "Choisis ta pizza")
               , ("Margharita", "Margherita")
               , ("Queen", "Reine")
               ])
]

abbreviations = dictionnaire |>
   List.map (\(name, trads) ->
     listDict.get "abbreviation" trads
     |> Maybe.withDefault name)

indexLangue = 
  List.findByAReturnB Tuple.second Tuple.first hl (List.zipWithIndex abbreviations)
  |> Maybe.withDefaultReplace (freeze 0)

main = Html.translate dictionnaire indexLangue <|
<html><head></head><body @bodypermissions>
  <span>$Salut @user!<br>
$Tuveuxquellepizza?
@Html.select[]("$Choisistapizza"::options)(
  listDict.get user userdata
  |> Maybe.orElseReplace (freeze (Just 0))
  |> Maybe.getUnless 0)
<br><br>
@Html.select[](List.map Tuple.first dictionnaire)(indexLangue)<br><br>
 $Choixfinaux<br>
@(List.map (\(name, id) ->
  <span>@name $achoisiunepizza @(List.findByAReturnB Tuple.first Tuple.second (id - 1) (List.zipWithIndex options) |> Maybe.withDefaultReplace (freeze "qui n'existe pas")).<br></span>
) userdata)
</span>
  <script>
    function domNodeToNativeValue(n) {
      if(n.nodeType == "3") {
        return ["TEXT", n.textContent];
      } else {
        var attributes = [];
        for(var i = 0; i < n.attributes.length; i++) {
          var key = n.attributes[i].name;
          var value = n.attributes[i].value;
          if(key == "style") {
            value = value.split(";").map(x => x.split(":")).filter(x => x.length == 2);
          }
          attributes.push([key, value]);
        }
        var children = [];
        for(i = 0; i < n.childNodes.length; i++) {
          children.push(domNodeToNativeValue(n.childNodes[i]));
        }
        return [n.tagName.toLowerCase(), attributes, children];
      }
    }
    function replaceContent(NC) {
      document.open();
      document.write(NC);
      document.close();
    }
    
    var t = undefined;
  
    function handleMutations(mutations) {
      // Send in post the new HTML along with the URL
      console.log("mutations", mutations);
      if(typeof t !== "undefined") {
        clearTimeout(t);
      }
      t = setTimeout(function() {
        t = undefined;
        console.log("sending post request");
        var xmlhttp = new XMLHttpRequest();
        xmlhttp.onreadystatechange = function () {
            if (xmlhttp.readyState == XMLHttpRequest.DONE) {
              //console.log("going to replace with");
              //console.log(xmlhttp.responseText);
              replaceContent(xmlhttp.responseText);
            }
        };
        xmlhttp.open("POST", location.pathname + location.search);
        xmlhttp.setRequestHeader("Content-Type", "application/json");
        xmlhttp.send(JSON.stringify(domNodeToNativeValue(document.body.parentElement)));
      }, @delay)
    }
  
    if (typeof outputValueObserver !== "undefined") {
      // console.log("outputValueObserver.disconnect()");
      outputValueObserver.disconnect();
      
    }
    

    setTimeout(function() {
      outputValueObserver = new MutationObserver(handleMutations);
      outputValueObserver.observe
       ( document.body.parentElement
       , { attributes: true
         , childList: true
         , characterData: true
         , attributeOldValue: true
         , characterDataOldValue: true
         , subtree: true
         }
       )
     }, 10)    
  </script>
  
</body></html>