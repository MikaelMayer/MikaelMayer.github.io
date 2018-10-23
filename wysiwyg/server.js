
const fs = require("fs");
const http = require('http');
const url = require('url');
const hostname = '127.0.0.1';
const port = 3000;

document = {} // So that the evaluation of sns.js does not throw exceptions.

function loadpage(name, overrides, newvalue) {
  // __dirname = path.resolve(); // If in the REPL
  var source = "";
  if(typeof overrides != "object") overrides = {};
  try {
    source =  fs.readFileSync(__dirname + "/src/" + name, "utf8");  
  } catch (err) {
    return { ctor: "Err", _0: `File ${name} does not exists`}
  }
  /*Object.keys(overrides).forEach((key) => {
    var value = overrides[key];
    // special c
    var maybeFloat = parseFloat(value)
    if(maybeFloat === maybeFloat) {
      // TODO: Security flaw here, code injection possible if value is a closure.
      source = `${key}=${maybeFloat}\n\n` + source;
    } else { -- NaN
      source = `${key}="""${value}"""\n\n` + source;
    }
  })*/
  //console.log("############\n" + source);
  function evaluate(source) {
    var result = module.exports.EvalUpdate.api.evaluate(source);
    if(result.ctor == "Ok") {
      var out = module.exports.EvalUpdate.api.valToHTMLSource(result._0)
      if(out.ctor == "Ok") {
        return out;
      } else {
        return { ctor: "Err", _0: "Error while converting the result to HTML source file: " + out._0}
      }
    } else {
      return { ctor: "Err", _0: `Error while interpreting ${name}: ` + result._0}
    }
  }
  
  if(typeof newvalue == "undefined") {
    return evaluate(source);
  } else { // We update the page and re-render it.
    var newVal = module.exports.EvalUpdate.api.nativeToVal(newvalue);
    var result = module.exports.EvalUpdate.api.update(source)(newVal);
    // TODO: Deal with query vars.
    if(result.ctor == "Ok") {
      var newSource = result._0[0]; // TODO: If toolbar, interact to choose ambiguity
      fs.writeFileSync(__dirname + "/src/" + name, newSource, "utf8");
      return evaluate(newSource);
    } else return result;
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
      response.end(`<html><body style="color:#cc0000"><div   style="max-width:600px;margin-left:auto;margin-right:auto"><h1>Error report</h1><pre style="white-space:pre-wrap">${htmlContent._0}</pre></div></body></html>`)
    } else {
      response.end(htmlContent._0);
    }
  } else if(request.method == "POST") {
    var urlParts = url.parse(request.url, parseQueryString=true);
    var pathname = urlParts.pathname.substring(1); // Without the slash.
    var body = '';
    request.on('data', function (data) {
        body += data;
        console.log("Partial body: " + body);
    });
    request.on('end', function () {
        var pushedValue = JSON.parse(body);
        // Old code
        response.statusCode = 200;
        var htmlContent = loadpage(pathname, urlParts.query, pushedValue);
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        if(htmlContent.ctor == "Err") {
          response.end(`<html><body style="color:#cc0000"><div   style="max-width:600px;margin-left:auto;margin-right:auto"><h1>Error report</h1><pre style="white-space:pre-wrap">${htmlContent._0}</pre></div></body></html>`)
        } else {
          response.end(htmlContent._0);
        }
        });
    // Later, deal with update.
  } else {
    response.statusCode = 200;
    response.end("Unknown method");
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