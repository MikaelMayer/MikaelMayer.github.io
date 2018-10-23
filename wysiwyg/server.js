
const fs = require("fs");
const http = require('http');
const url = require('url');
const hostname = '127.0.0.1';
const port = 3000;

document = {} // So that the evaluation of sns.js does not throw exceptions.

function loadpage(name, overrides) {
  // __dirname = path.resolve(); // If in the REPL
  var source = "";
  if(typeof overrides != "object") overrides = {};
  try {
    source =  fs.readFileSync(__dirname + "/src/" + name, "utf8");  
  } catch (err) {
    return { ctor: "Err", _0: `File ${name} does not exists`}
  }
  Object.keys(overrides).forEach((key) => {
    // TODO: Security flaw here, code injection possible.
    source = `${key}=${overrides[key]}\n\n` + source;
  })
  console.log(source);
  var result = module.exports.EvalUpdate.api.evaluate(source)
  if(result.ctor == "Ok") {
    var out = module.exports.EvalUpdate.api.valToHTMLSource(result._0)
    if(out.ctor == "Ok") {
      return out;
      //fs.writeFileSync(__dirname + "/index.html", out._0, "utf8");
    } else {
      return { ctor: "Err", _0: "Error while converting the result to HTML source file: " + out._0}
    }
  } else {
    return { ctor: "Err", _0: `Error while interpreting ${name}: ` + out._0}
  }
}

const server = http.createServer((request, response) => {
  if(request.method == "GET") {
    var urlParts = url.parse(request.url, parseQueryString=true);
    var pathname = urlParts.pathname.substring(1); // Without the slash.
    var htmlContent = loadpage(pathname, urlParts.query);
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    if(htmlContent.ctor == "Err") {
      response.end(`<html><body style="color:#cc0000">${htmlContent._0}</body></html>`)
    } else {
      response.end(htmlContent._0);
    }
  } else if(request.method == "PUSH") {
    response.end("action not possible");
    // Later, deal with update.
  }
});


// Load the Elm program into our namespace.
with (global) {
	eval(fs.readFileSync(__dirname + "/../sketch-n-sketch/sns.js", "utf8"));
  console.log("Sketch-n-sketch Server ready !")
  server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
  });
}