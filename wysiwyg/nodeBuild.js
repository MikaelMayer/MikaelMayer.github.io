
const fs = require("fs");
document = {}

// Load the Elm program into our namespace.
with (global) {
	eval(fs.readFileSync(__dirname + "/../sketch-n-sketch/sns.js", "utf8"));
  
  var source = fs.readFileSync(__dirname + "/src/index.elm", "utf8");
  var result = module.exports.EvalUpdate.api.evaluate(source)
  if(result.ctor == "Ok") {
    var out = module.exports.EvalUpdate.api.valToHTMLSource(result._0)
    if(out.ctor == "Ok") {
      fs.writeFileSync(__dirname + "/index.htlm", out._0, "utf8");
    } else {
      console.log("Error while converting the result to HTML source file: " + result._0)
    }
  } else {
    console.log("Error while interpreting: " + result._0)
  }
}