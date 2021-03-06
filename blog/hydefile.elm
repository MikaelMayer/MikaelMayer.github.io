with: (a -> b) -> (b -> c) -> a -> c
with function callback value =
       callback (function value)

startWith: a -> (a -> b) -> b
startWith initValue callback =
  callback initValue
{-
nameLast: (b -> c) -> (b -> c)
nameLast nameToCallback value =
  nameToCallback value 
-- Can be skipped. It's the same as writing <| \name -> startWith ...
-}
nameIt: (a -> a -> b) -> a -> b
nameIt nameToCallback value =
  nameToCallback value value
  
Tuple = { Tuple |
    fold function1 function2 callback (first, second) =
      callback (function1 first, function2 second)
    foldSecond function = fold identity function
    foldFirst function = fold function identity
    
    flip (a, b) = (b, a)
}

Result = { Result |
    with: (a -> b -> c) -> Result err b -> (Result err c -> d) -> a -> d
    with combine result callback value =
      callback <| Result.map (combine value) result
}

Debug = { Debug |
  fold msg callback value =
    callback <| Debug.log msg value
}

curry f (a, b) = f a b

-- #1 Use of CPS
include vars {-filename-} =
   nameIt <| \filename ->
   with fs.read
   <| Maybe.foldLazy (\_ -> <span class="error">File @filename could not be found</span>)
   <| with (\x -> __evaluate__ (("vars", vars)::("include", include vars)::__CurrentEnv__) x)
   <| Result.fold (\msg -> <span class="error">Error: @msg</span>)
   <| identity

-- Specific to this file

eval vars = __evaluate__ (("vars", listDict.insert "include" "true" vars)::("include", include vars)::__CurrentEnv__)

name = {
  html filename =
    case Regex.extract "^(.*)\\.leo$" filename of
      Just [x] -> Ok <| x + ".html"
      Nothing -> Err <| "Not a valid leo file: " + filename

  htmlWithSuffix suffix filename =
    case Regex.extract "^(.*)\\.leo$" filename of
      Just [x] -> Ok <| x + suffix + ".html"
      Nothing -> Err <| "Not a valid leo file: " + filename
}

errToError = Result.fold Error

-- #2 Use of CPS
convert vars nameBuilder {-filename-} =
    nameIt <| \filename ->
    with fs.read
        <| Maybe.fold (Error <| "Could not open file " + filename)
    <| with (eval (("filename", filename)::vars))
        <| errToError
    <| with valToHTMLSource
    <| Result.with (flip (,)) (nameBuilder filename)
        <| errToError
    <| curry Write

essenceFilename = "2019-02-08-essence-of-functional-programming.leo"
essence () =
  let filename = essenceFilename in
  let addSuffix language filename =
       case language of
         "Elm" -> name.html filename
         x -> name.htmlWithSuffix ("-" + String.toLowerCase x) filename
  in
  flip List.map ["Elm", "Haskell"] <|
    \lang ->
      convert [("buildFilename", flip addSuffix filename), ("lang", lang)] (addSuffix lang) filename

exceptions = [essenceFilename]

notexceptions () = 
  fs.listdir "."
  |> List.filter (Regex.matchIn "\\.leo$")
  |> List.filter (not << flip List.contains exceptions)
  |> List.map (convert [] name.html)

all () =
  notexceptions () ++ essence ()

last () =
  fs.listdir "."
  |> List.filter (Regex.matchIn "\\.leo$")
  |> List.filter (not << (== "index.leo"))
  |> List.reverse
  |> List.head
  |> Maybe.map (convert [] name.html)
  |> Maybe.withDefault []
  