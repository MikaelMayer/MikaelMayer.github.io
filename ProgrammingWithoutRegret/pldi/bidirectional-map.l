// download: bidirectional-map.html
// output: html
letrec take n array =
  if(n==array.length) array else (array match {
    case [] => array
    case init ++ [last] =>
      take n init
  }) in
letrec drop n array =
  if(n==0) array else (array match {
    case [] => array
    case [head] ++ tail =>
      let newN = n- 1 in
      drop newN tail
  }) in
let map = (\f. {
  apply= \input.
  letrec map_aux = {
    apply = \l. l match {
      case [head] ++ tail => [f head] ++ (map_aux tail)
      case [] => []
    } /*,
    unapply = \lOut.(lOut match {
      case [] => {value = []}
      case [f head] ++ (map_aux tail) => {value = [head] ++ tail }
      case _ => {}
    }) */
  } in map_aux input,
  updateAlign = \m.
    let [input, index, deleted, inserted] = [m.input, m.insertionIndex, m.deletedCount, m.inserted] in
    let updateIndex = if(index == input.length) index - 1 else index in
    letrec aux acc inserted = inserted match {
      case [] =>
        { value = take index input ++ acc ++ drop (index+deleted) input }
      case [head] ++ tail =>
        (update f (input updateIndex) head) match {
          case {value=v} => aux (acc ++ [v]) tail
          case _ => {}
        }
    } in aux [] inserted
}) in
let names = ["Leonard", "Benjamin",   "Marion"] in
let mapped = map (\x. { tag= "LI", children= [{tag = "#text", value = "Hello " + x}]}) names in
{ tag = "DIV", children=[
{ tag = "H1", children=[{tag="#text", value="Bidirectional map"}]},
{ tag = "#text", value = "Normally, updating a function recursively mapping an array to another only supports modification of elements, not insertion or deletion. This is because insertion and deletion would require more recursion cycles, which update cannot do. "}, { tag = "BR", children = [] },
{ tag = "#text", value = "Thanks to the method unapply that computes the method map in reverse (note its shape !), you can have truly bidirectional mapping functions. Here is an example transforming a list of strings to an unordered list of the same strings prefixed by \"Hello\". Delete or copy-paste elements in the list below to insert, delete and modify elements in the original list. If it can update, you will see that this array is updated:"}, { tag = "BR", children = [] },{ tag = "CODE", children = [{tag = "#text", value = "[" + (join names ",") + "]"}]},
{ tag = "UL", children= mapped}
]}  