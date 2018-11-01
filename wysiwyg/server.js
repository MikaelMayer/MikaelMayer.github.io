
const fs = require("fs");
const http = require('http');
const url = require('url');
const hostname = '127.0.0.1';
const port = 3000;

if(typeof document === "undefined" || document === null)
  document = {}; // So that the evaluation of sns.js does not throw exceptions.
if(typeof location === "undefined" || location === null)
  location = { hash : ""}; // so that the evaluation does not throw exceptions.

// Returns a [Result of string containing the requested page, new overrides]
// If newvalue is defined, performs an update before returning the page.
function loadpage(name, overrides, newvalue) {
  // __dirname = path.resolve(); // If in the REPL
  var source = "";
  if(typeof overrides != "object") overrides = {};
  var env = { vars: overrides };
  var envToOverrides = function (env) {
    return env.vars;
  }
  try {
    source =  fs.readFileSync(__dirname + "/src/" + name, "utf8");  
  } catch (err) {
    return [{ ctor: "Err", _0: `File ${name} does not exists`}, overrides];
  }
  function evaluate(env, source) {
    var result = exports.evaluateEnv(env)(source);
    if(result.ctor == "Ok") {
      var out = exports.valToHTMLSource(result._0)
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
    //console.log("just evaluate");
    return [evaluate(env, source), overrides];
  } else { // We update the page and re-render it.
    var newVal = exports.nativeToVal(newvalue);
    //console.log("newVal", newVal);
    //console.log("env", env);
    var result = exports.updateEnv(env)(source)(newVal);
    //console.log("result", result);
    if(result.ctor == "Ok") {
      var newEnvSource = result._0._0; // TODO: If toolbar, interact to choose ambiguity
      var newEnv = newEnvSource._0;
      //console.log("new env", newEnv)
      var newSource = newEnvSource._1;
      fs.writeFileSync(__dirname + "/src/" + name, newSource, "utf8");
      return [evaluate(newEnv, newSource), envToOverrides(newEnv)];
    } else return [result, overrides];
  }
}

const server = http.createServer((request, response) => {
  if(request.method == "GET") {
    var urlParts = url.parse(request.url, parseQueryString=true);
    var pathname = urlParts.pathname.substring(1); // Without the slash.
    if(pathname == "") pathname = "index.elm";
    var [htmlContent, newQueryDiscarded] = loadpage(pathname, urlParts.query);
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
    if(pathname == "") pathname = "index.elm";
    var body = '';
    request.on('data', function (data) {
        body += data;
    });
    request.on('end', function () {
        var pushedValue = JSON.parse(body);
        response.statusCode = 200;
        var [htmlContent, newQuery] = loadpage(pathname, urlParts.query, pushedValue);
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('New-Query', JSON.stringify(newQuery));
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