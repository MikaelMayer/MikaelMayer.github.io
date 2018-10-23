userdata = [
  ("Mikael", 1)
  ]
options = [
  "Margherita",
  "Reine",
  "Montagnarde"]

dictionnaire = [
  ("English", [ ("abbreviation", "en")
              , ("Salut1", "Hey")
              , ("Tuveuxquellepizz1", "Which pizza do you want")
              , ("Choixfinaux1", "Final choices")
              , ("achoisiunepizza1", "wants a pizza")
              ]),
  ("Français", [ ("abbreviation", "fr")
               , ("Salut1", "Salut")
               , ("Tuveuxquellepizz1", "Tu veux quelle pizza")
               , ("Choixfinaux1", "Choix finaux")
               , ("achoisiunepizza1", "a choisi une pizza")
               ])
]

abbreviations = dictionnaire |>
   List.map (\(name, trads) ->
     listDict.get "abbreviation" trads
     |> Maybe.withDefault name)

indexLangue = 
  List.indexWhere ((==) hl) abbreviations
  |> max 0

main = Html.translate dictionnaire indexLangue <|
<html>
  <body @bodypermissions>
  <span>$Salut1 @user!<br>
$Tuveuxquellepizz1?
@Html.select[]("Choisis ta pizza"::options)(
  listDict.get user userdata
  |> Maybe.orElseReplace (freeze (Just 0))
  |> Maybe.getUnless 0)
<br><br>
@Html.select[](List.map Tuple.first dictionnaire)(indexLangue)<br><br>
 $Choixfinaux1<br>
@(List.map (\(name, id) ->
  <span>@name $achoisiunepizza1 @(nth options (id - 1)).<br></span>
) userdata)
</span>
  </body>
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
  
    function handleMutations() {
      // Send in post the new HTML along with the URL
      
    }
  
    if (outputValueObserver) {
      // console.log("outputValueObserver.disconnect()");
      outputValueObserver.disconnect();
    }

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
      ); 
  </script>
</html>

-- Everything beyond this is configurable from the URL.
bodypermissions = [["contenteditable", "true"]]

user = "Mikael"
hl = "en"
