// download: sorting.html
// output: html
let li_toComparable x = x match {
  case {children = v} => v
  case _ => ""
} in
letrec insert toComparable prev sorted elem = sorted match {
  case [] => prev ++ [elem]
  case [head] ++ tail => if(toComparable head > toComparable elem) (prev ++ [elem, head] ++ tail) else (let newPrev = prev ++ [head] in insert toComparable newPrev tail elem)
} in
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
      let newN = n - 1 in
      drop newN tail
  }) in
letrec sort toComparable = { apply=\list.
  letrec sort_aux acc toInsert = toInsert match {
    case [] => acc
    case [head] ++ tail => sort_aux (insert toComparable [] acc head) tail
  } in sort_aux [] list,
  updateAlign=\m. (
    let [list, origOut, out, index, deleted, inserted] = [m.input, m.outputOriginal, m.outputNew, m.insertionIndex, m.deletedCount, m.inserted] in
    let zipWithIndex list =
      letrec aux index acc list = list match {
        case [] => acc
        case [head] ++ tail => let newAcc = acc ++ [[head, index]] in
          let newIndex = index + 1 in
          aux newIndex newAcc tail
      } in aux 0 [] list in
    let listI = zipWithIndex list in
    let sortedListI = sort (\x. toComparable (x 0)) listI in
    // Now we can compare against outputOriginal and the insertions.
    if(inserted.length == 1 && deleted == 1) (
      // Replacement. We get the index thanks to the second element and we update it in the original list.
      let modifiedIndex = sortedListI index 1 in
      {value = (take modifiedIndex list) ++ inserted ++ (drop (modifiedIndex+1) list) }
    ) else if(deleted == 0) ( // just inserted. We insert the new values at the end
      {value = list ++ inserted}
    ) else if(inserted.length == 0) ( //Only deletion
      if(deleted == 1) (
        let modifiedIndex = sortedListI index 1 in
        {value = (take modifiedIndex list) ++ (drop (modifiedIndex+1) list) }
      ) else (
        {} // Delete more?!
      )
    ) else if(inserted.length == 1 && deleted == 2) ( // The first one is modified, the second is deleted
      let modifiedIndex1 = sortedListI index 1 in
      let deletedIndex2 = sortedListI (index+1) 1 in
      let res1 = take modifiedIndex1 list ++ inserted ++ drop (modifiedIndex1 +1) list in
      {value = take deletedIndex2 res1 ++
        drop (deletedIndex2+1) res1 }
    ) else {}
  )
} in
[{tag="h1",children="Sorting"},
"This page automatically sorts the list below. Try to delete and modify some of the items, or to insert new ones."] ++
[{ tag="ul", children =
sort li_toComparable [
  {tag="li", children="Grea"},
  {tag="li", children="Trial"},
  {tag="li", children="Success"},
  {tag="li", children="Zed"}] }]