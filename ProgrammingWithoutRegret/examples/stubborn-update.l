// download: stubborn-update.html
// output: html
letrec foldLeft acc list fun = list match {
  case [] => acc
  case [head] ++ tail =>
    let newAcc = (fun acc head) in
    foldLeft newAcc tail fun
} in
letrec foldRight acc list fun = list match {
  case [] => acc
  case init ++ [last] =>
    let newLast = (fun last acc) in
    foldRight newLast init fun
} in
let l = [false, false, false, false] in
[{tag="h1", children="Leave me alone stubborn update"},
"You can change the following switch from false to true up to 6 times before the update 'gives up' and produces something different:",
{tag="br"},
foldLeft false l (
  \x.\y. x match {
     case false => y match {
       case false => y
       case _ => x
     }
     case _ => false
  }
), {tag="br"},
"In the program, note that thet list of <code>false</code> fills up with <code>true</code> from the right.",
{tag="br"},
"Once the above switch is activated for good, you can change the following switch from true to false up to 6 times before the update produces false.", {tag="br"},
(foldRight true l (
  \x.\y. y match {
     case true => x match {
       case true => x
       case _ => y
     }
     case _ => true
  }
))]