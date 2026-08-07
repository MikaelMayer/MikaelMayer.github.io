// download: complex-numbers-unapply.html
// output: html
let cplx real imag = { real= real, imag= imag } in
let oneifempty x = x match { case "" => "1" case x => x } in
let zeroifnegzero x = x match { case "-0" => "0" case x => x } in
let cplx_to_string = { apply= \x. x.imag match {
  case "0" => x.real
  case "1" => x.real match {
    case "0" => "i"
    case real => real + "+i"
  }
  case "-1" => x.real match {
    case "0" => "-i"
    case real => real + "-i"
  }
  case "-" + imagneg => x.real match {
      case "0" => "-" + imagneg + "i"
      case real => real + "-" + imagneg + "i"
    }
  case imag => x.real match {
    case "0" => imag + "i"
    case real => real + "+" + imag + "i"
  }
}, unapply = \x. { value = if(matchIn "^(-?)\\d+(\\+|\\-)\\d*i$" x) (
  let real = replaceAllIn "^(-?)(\\d+)(\\+|\\-)(\\d*)i$" x "$1$2" in
  let imag = replaceAllIn "^(-?)(\\d+)(\\+|\\-)(\\d*)i$" x (\m. m.group 3 match {
      case "+" => (oneifempty (m.group 4))
      case "-" => zeroifnegzero ("-" + (oneifempty (m.group 4))) } ) in
  { real= real, imag = imag }
) else if(matchIn "^(-?)\\d*i$" x) (
  let imag = replaceAllIn "^(-?)(\\d*)i$" x (\m. (m.group 1) + (oneifempty (m.group 2))) in
  { real= "0", imag = imag }
) else if(matchIn "^(-?)\\d+$" x) (
  let real = replaceAllIn "^(-?\\d+)$" x "$1" in
  { real= real, imag = "0"}
) else  { real= "0", imag = "0"} }
} in
let str_computed = "1+i" in
let code x = !"<code>" + x + !"</code>" in
"<h1>{unapply= ...} in records</h1>"+
"<code>unapply</code> in records should be a lambda returning either <code>{value= ...}</code> or <code>{}</code>.<br>It serves two purposes:<ul><li>It is called to update the 'apply' call.</li><li>It is used in pattern matching for custom extraction</li></ul>" +
"In this example, we use <code>unapply</code> to parse an integral complex number that <code>apply</code> pretty-prints.<br><br>"+
(let c = cplx "-1" "2" in
"Pretty-printed complex number:" +
(code (cplx_to_string c)) +
"<br>Try i, -i, 0+i, 2-0i, 1i, -5i, ...\nYou can also change its real and imaginary parts:<br>Original real:" +
code c.real + "<br>Original imag:" + code c.imag + "<br><br>" +
"String representing a complex number:" + code str_computed + "<br>" +
(str_computed match {
  case cplx_to_string {real= r, imag = i} =>
    "Computed real:" + code r +
    "<br>Computed imag:" + code i
  case error => "Cannot parse " + code error
}))
