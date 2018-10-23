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

indexLangue = dictionnaire |>
  List.indexWhere (\(_, trads) ->
    List.find ((==) ("abbrevation", hl)) trads /= Nothing)
  |> max 0

main = Html.translate dictionnaire indexLangue <|
<html>
  <body>
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
    function handleMutations() {
      outputValueObserver.observe
      ( currentNode
      , { attributes: true
        , childList: true
        , characterData: true
        , attributeOldValue: true
        , characterDataOldValue: true
        , subtree: false
        }
      ); 
    }
  
    if (outputValueObserver) {
      // console.log("outputValueObserver.disconnect()");
      outputValueObserver.disconnect();
    }

     outputValueObserver = new MutationObserver(handleMutations);
  </script>
</html>

-- This should be configurable.
bodypermissions = [["contenteditable", "true"]]

user = "Mikael"
hl = "en"
