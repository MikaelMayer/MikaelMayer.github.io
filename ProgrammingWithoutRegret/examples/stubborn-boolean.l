// download: stubborn-boolean.html
// output: html
let [x1, x2, x3, x4, x5, x6] = [false, false, false, false, false, false] in
[{tag="h1", children="Stubborn update (boolean)"},
``The first switch is a conjunction of six <code>false</code> values.
Try to set it to true:<br>``,
x1 && x2&& x3&& x4&& x5&& x6, " = ",
x1, " ∧", x2, " ∧", x3, " ∧", x4, " ∧", x5, " ∧", x6
]