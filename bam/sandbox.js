var {Reuse, New, ReuseArray, Custom, apply, backPropagate, nd, up, debug, stringOf, andThen, path, List} = bam;
var ifIdleAfter = (() => {
    let waiting = {};
    return function(ms, key, callback) {
      if(key in waiting) {
        clearTimeout(waiting[key]);
      }
      waiting[key] = setTimeout(() => {
        delete waiting[key];
        callback();
      }, ms);
    }
  })();
var defaultTiming = 500;
  
var toSave = {};
function save(self) {
  toSave[self.getAttribute("id")] = self.value;
  localStorage.setItem("saved", JSON.stringify(toSave));
}
function reset() {
  for(let k in toSave) {
    let e = document.getElementById(k);
    if(e) {
      e.value = "";
    }
  }
}
function restore() {
  toSave = JSON.parse(localStorage.getItem("saved") || "{}");
  for(let k in toSave) {
    let e = document.getElementById(k);
    if(e) {
      e.value = toSave[k];
    } else {
      delete toSave[k];
      console.log(k + " does not exist in document. Removing it");
    }
  }
}

function runBamApply() {
  let step = "Evaluating edit action";
  try {
    let evalStep = eval(editaction.value);
    step = "Evaluating program";
    let prog = eval("(" + originalprog.value + ")");
    step = "Applying the edit action";
    let result = bam.apply(evalStep, prog)
    let resultStr = bam.uneval(result, "");
    computedProg.value = resultStr;
    computedProg.originalValue = result;
    newComputedProg.value = resultStr;
    newProgEdit.editSinceComputation = undefined;
    newProgEdit.lastProgVal = undefined;
    computeDiff();
  } catch(e) {
    computedProg.value = "["+step+"]\n" + e.stack
  }
}
function computeDiff() {
  let step = "computeDiff - evaluate new program";
  try {
    let newProgVal = eval("(" + newComputedProg.value + ")");
    let d;
    if(newProgEdit.editSinceComputation) {
      step = "computeDiff - diffing with last";
      d = bam.diff(newProgEdit.lastProgVal, newProgVal);
      step = "merging diffs";
      d = bam.andThen(d, newProgEdit.editSinceComputation);
    } else {
      step = "computeDiff - diffing with original";
      d = bam.diff(computedProg.originalValue, newProgVal);
    }
    step = "computeDiff - stringify";
    newProgEdit.value = bam.stringOf(d);
    newProgEdit.editSinceComputation = d;
    newProgEdit.lastProgVal = newProgVal;
  } catch(e) {
    newProgEdit.value = "["+step+"]\n" + e.stack
  }
}
function computeNewProg() {
  let step = "computeNewProg - read prog edit";
  try {
    let ed = eval(newProgEdit.value);
    newProgEdit.editSinceComputation = ed;
    step = "computeNewProg - apply prog edit";
    console.log(ed, computedProg.originalValue);
    let result = bam.apply(ed, computedProg.originalValue);
    newProgEdit.lastProgVal = result;
    step = "computeNewProg - rendering result";
    newComputedProg.value = bam.uneval(result, "");
  } catch(e) {
    newComputedProg.value = "["+step+"]\n" + e.stack
  }
}

function backprop() {
  let step = "Evaluating eval step";
  let updatedProgStep = false;
  try {
    let evalStep = eval(editaction.value);
    step = "Evaluating user step";
    let userAction = eval(newProgEdit.value);
    step = "Back-propagating user step";
    let initAction = bam.backPropagate(evalStep, userAction);
    step = "rendering step";
    let resultStr = bam.stringOf(initAction);
    updatedEditAction.value = resultStr;
    updatedProgStep = true;
    step = "Getting original program";
    let prog = eval("(" + originalprog.value + ")");
    step = "Applying to original program";
    let initProgUpdated = bam.apply(initAction, prog);
    step = "rendering updated original program";
    let initProgUpdatedStr = bam.uneval(initProgUpdated, "");
    updatedProg.value = initProgUpdatedStr;
  } catch(e) {
    let x = updatedProgStep ? updatedProg : updatedEditAction;
    x.value = "["+step+"]\n" + e.stack
  }
}