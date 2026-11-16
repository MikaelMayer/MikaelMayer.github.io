// To have a textarea or input persist after close,
// just add oninput="save(self)" and an id="X" attribute

var toSave = {};
function saveAll() {
  localStorage.setItem("saved", JSON.stringify(toSave));
}
function save(self) {
  let value = self.value;
  if(value.indexOf("IF YOU CAN READ THIS TEXT") == -1) {
    toSave[self.getAttribute("id")] = self.value;
  }
  saveAll();
}
function reset() {
  toSave = {};
  saveAll();
}
function resetLastTextarea(self) {
  while(self && self.tagName != "TEXTAREA") {
    self = self.previousElementSibling;
  }
  if(self) {
    if(confirm('Restore original content?\n'+self.textContent)) self.value = self.textContent
  } else {
    alert("misplaced button - textarea not found.");
  }
}
function eraseEverything() {
  for(let k in toSave) {
    let e = document.getElementById(k);
    if(e) {
      e.value = "";
    }
  }
}
function restore() {
  toSave = JSON.parse(localStorage.getItem("saved") || "{}");
  console.log("toSave.evaluateCode2:\n"+ toSave.evaluateCode2);
  for(let k in toSave) {
    let e = document.getElementById(k);
    if(e) {
      e.value = toSave[k];
    } else { // Might exist somewhere else.
      //delete toSave[k];
      //console.log(k + " does not exist in document. Removing it");
    }
  }
}

parse = (() => {
  var any = '[\\s\\S]';
  var bs = "\\\\";
  var allXept = function(regex, escapes) { return escapes ? "(?:(?:(?!"+regex+")"+any+")|"+escapes+")*?" :
                   "(?:(?!"+regex+")"+any+")*?" };
  var allXeptStringEnd  = allXept('"'+"|"+bs, ''+bs+'"|'+bs+bs+"|"+bs+"[0-9a-fA-F]+|"+bs+any);
  var stringRegex = '"'+allXeptStringEnd+'"';
  let parseAux = (source, index) => {
    let wsBefore = new RegExp(`^.{${index}}(\\s*)`).exec(source)[1];
    index = index + wsBefore.length;
    if(source[index] == "\\") {
      let m = new RegExp(`^.{${index}}(\\\\(\\s*)(\\w+)(\\s*)([=-]>|\\.))`).exec(source);
      let [body, newIndex] = parseAux(source, index + m[1].length);
      let wsAfter = new RegExp(`^.{${newIndex}}(\\s*)`).exec(source)[1];
      newIndex = newIndex + wsAfter.length;
      return [{ctor: "fun", format: {wsBefore: wsBefore, wsBeforeArgName: m[2], wsAfterArgName: m[4], wsAfter: wsAfter, arrow: m[5]}, argName: m[3], body: body}, newIndex];
    }
    let fun, newIndex, exp;
    while(index < source.length && source[index] != ")") {
      if(source[index] == "(") {
        [exp, newIndex] = parseAux(source, index + 1);
        let wsBeforeEnd = new RegExp(`^.{${newIndex}}(\\s*)`).exec(source)[1];
        exp.format.wsBefore = wsBefore + "(" + exp.format.wsBefore;
        exp.format.wsAfter = exp.format.wsAfter + wsBeforeEnd + ")";
        newIndex = newIndex + wsBeforeEnd.length + 1;
      } else if(source[index].match(/[a-zA-Z_$]/)) {
        let name = new RegExp(`^.{${index}}(\\w+)`).exec(source)[1];
        exp = {ctor: "var", format: {wsBefore: wsBefore, wsAfter: ""}, name: name};
        newIndex = index + name.length;
      } else if(source[index].match(/-?[0-9]/)) {
        let valueStr = new RegExp(`^.{${index}}(-?[0-9]+)`).exec(source)[1];
        let value = Number(valueStr);
        exp = {ctor: "const", format: {wsBefore: wsBefore, wsAfter: ""}, value: value};
        newIndex = index + valueStr.length;
      } else if(source[index] == "\"") {
        let valueStr = new RegExp(`^.{${index}}(` + stringRegex + `)`).exec(source)[1];
        let value = eval(valueStr);
        exp = {ctor: "const", format: {wsBefore: wsBefore, wsAfter: ""}, value: value};
        newIndex = index + valueStr.length;
      } else if(source[index].match(/[\+-^\*\$\#\~\&\|\@=<>%!]/)) {
        let name = new RegExp(`^.{${index}}([\\+-^\\*\\$\\#\\~\\&\\|\\@=<>%!_]+)`).exec(source)[1];
          exp = {ctor: "var", format: {wsBefore: wsBefore, wsAfter: ""}, name: name};
        newIndex = index + name.length;
      } else break;
      fun = fun ? { ctor: "app", format: {wsBefore: "", wsAfter: ""}, fun: fun, arg: exp} : exp;
      wsBefore = new RegExp(`^.{${newIndex}}(\\s*)`).exec(source)[1];
      index = newIndex + wsBefore.length;
    }
    fun.format.wsAfter += wsBefore;
    return [fun, index];
  };
  return (source) => parseAux(source, 0)[0];
})();

var G = x => document.querySelector(x);

function parseOrError(x) {
  let msg;
  try {
    msg = parse(x);
    msg = bam.uneval(msg, "");
  } catch(e) {
    msg = "" + e;
  }
  return msg;
}
function evalOrError(x, format) {
  let res;
  try { res = eval(x);
        if(format) res = bam.uneval(res, "");
  } catch(e) { res = e + ""; }
  return res;
}

function onInit() {
  restore();
  var a = document.querySelectorAll(".inputholder");
  for(var i = 0; i < a.length; i++) {
    a[i].oninput();
  }
}


document.addEventListener("DOMContentLoaded", onInit);

var S = dependencies => {
  let dependenciesNodes = document.querySelectorAll(dependencies);
  let dependenciesContent = [...dependenciesNodes].map(x => x.value).join("\n\n");
  return dependenciesContent;
}

function runTests(selector, rawValue) {
  var tests = document.querySelectorAll(selector);
  for(var i = 0; i < tests.length; i++) {
    let test = tests[i];
    let dependencies = test.getAttribute("dependencies");
    let whatToExecute = S(dependencies) + "\n\n" + test.value;
    let id = test.getAttribute("id");
    let zoneResult = document.querySelector("#" + id + "result");
    zoneResult.value = evalOrError(whatToExecute, !rawValue);
    
    // Check if the result is the one we wanted.
    let solution = zoneResult.getAttribute("title");
    if(!solution) return;
    let obtainedSolution, expectedSolutionStr;
    if(solution.startsWith("Result should be raw ")) {
      expectedSolutionStr = solution.substring("Result should be raw \"".length)
      if(expectedSolutionStr[expectedSolutionStr.length - 1] == "\"") {
        expectedSolutionStr = expectedSolutionStr.substring(0, expectedSolutionStr.length - 1);
      }
      obtainedSolution = zoneResult.value;
    } else if(solution.startsWith("Result should be ")) {
      let expectedSolution = "(" + solution.substring("Result should be ".length) + ")";
      try {
      expectedSolutionStr = bam.uneval(eval(expectedSolution));
      obtainedSolution = bam.uneval(eval("(" + zoneResult.value + ")"));
      } catch (e) {
        obtainedSolution = "???";
      }
    }
    zoneResult.classList.toggle("correct", expectedSolutionStr == obtainedSolution);
    zoneResult.classList.toggle("incorrect", expectedSolutionStr != obtainedSolution);
  }
}
