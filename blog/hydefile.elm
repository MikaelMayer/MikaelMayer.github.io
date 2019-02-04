do = flip

read: (Maybe String -> a) -> String -> a
read callback name  =
  callback <| fs.read name
  
Maybe = { Maybe | 
  fold : a -> (x -> a) -> Maybe x -> a
  fold onNothing onJust content =
    case content of
      Nothing -> onNothing
      Just c -> onJust c
  }

Result = { Result | 
  fold : (err -> a) -> (x -> a) -> Result err x -> a
  fold onErr onOk content =
    case content of
      Err msg -> onErr msg
      Ok c -> onOk c
  }

evalContinue: (Result String value -> a) -> String -> a
evalContinue callback source =
  callback <| __evaluate__ __CurrentEnv__ source

{- -- Cons: nesting. Pro: Catches errors in chronological order
all = 
  case fs.read "FutureofProgramming.leo" of
    Nothing -> Error "Could not open file"
    Just c ->
      case __evaluate__ __CurrentEnv__ c of
        Err msg -> Error msg
        Ok x ->
          Write "FutureofProgramming.html" <| valToHTMLSource x
-}


{- -- Pro: better composition?. Cons: Catches errors only at the end; nested structure.
all = 
  fs.read "FutureofProgramming.leo"
  |> Maybe.map (\c ->
    __evaluate__ __CurrentEnv__ c
    |> Result.map (\x ->
      Write "FutureofProgramming.html" <| valToHTMLSource x)
    |> Result.withDefaultMapError Error 
  )
  |> Maybe.withDefault (Error "Could not open file")
-}
 
-- Pro: Conciseness, no nesting 
all = do
  read "FutureofProgramming.leo" <|
  Maybe.fold (Error "Could not open file") <|
  evalContinue <|
  Result.fold Error <| \content ->
    valToHTMLSource content |>
    Write "index.html"
