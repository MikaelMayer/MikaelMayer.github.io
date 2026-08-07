var immediatelyRun = typeof process !== 'undefined';

const MIN_PRICE = 90;
const MAX_PRICE = 110;
var ghostmarket = [];
var market = [];
var tradePrice = [];
var tradeType = [];
var sellers = [];
var buyers = [];
let lastPrice = 0;
let marketState = "";
let marketEntrant = undefined;
let marketDisplay = false;
let hourOfDay = 9*60;
let whathappensnextvariants = [
  "What happens next?",
  "Ok, so what?",
  "And then?",
  "Tell me more",
  "What happens afterwards?",
  "Please, tell me what happens",
  "Now what?",
  "Got it. And then?",
];
  
function restart(simulationId = 1) {
  ghostmarket = [];
  for(let i = MIN_PRICE; i <= MAX_PRICE; i++) {
    ghostmarket.push({"type": "Seller", price: i});
    if(simulationId == 3) {
      ghostmarket.push({"type": "Seller", price: i});
    }
    ghostmarket.push({"type": "Buyer", price: i});
    if(simulationId == 2) {
      ghostmarket.push({"type": "Buyer", price: i});
    }
  }
  shuffle(ghostmarket);
  market = [];
  tradePrice = [];
  tradeType = [];
  sellers = [];
  buyers = [];
  lastPrice = 0;
  hourOfDay = 9*60;
  marketState = "The market is empty.\n";
  marketEntrant = undefined;
  marketDisplay = false;
  if(typeof document !== "undefined") {
    document.getElementById("first-story").textContent = marketState;
    document.getElementById("restart-button").setAttribute("disabled", "");
    document.getElementById("next-button").removeAttribute("disabled");
  }
}

function entrantToString(entrant) {
  return entrant.type + "($"+entrant.price+")";
}

function next() {
  if(typeof document !== undefined) {
    document.getElementById("restart-button").removeAttribute("disabled");
  }
  if(marketDisplay) {
    marketState += "\n"+market.map(entrantToString).join(", ")+(
      market.length == 0 ? "No one is" :
      market.length == 1 ? " is now" :
      " are now")+" in the market.\n";
    marketDisplay = false;
  } else if(marketEntrant !== undefined) {
    let result = addToMarket(market, marketEntrant);
    if(result.traded) {
      if(marketEntrant.type == "Seller") {
        marketState += ", sells for $" + result.price + " and both leave the market.";
      } else {
        marketState += ", buys for $" + result.price + " and both leave the market.";
      }
      //tradePrice.push(result.price);
      //tradeType.push(marketEntrant.type);
      //lastPrice = result.price;
    } else {
      //tradePrice.push(lastPrice);
      //tradeType.push("");
      marketState += ", finds no deal so waits in the market.";
    }
    marketEntrant = undefined;
    marketDisplay = true;
  } else if(ghostmarket.length != 0) {
    hourOfDay = hourOfDay + 1 + Math.floor(8*Math.random());
    var hour = (hourOfDay-(hourOfDay%60))/60
    var minute = hourOfDay%60;
    if(minute < 10) {
      minute = "0" + minute;
    }
    var ampm = "am";
    if(hour >= 12) {
      ampm = "pm";
    }
    if(hour > 12) {
      hour -= 1;
    }
    var entrant = ghostmarket.pop();
    marketState += "At " + hour + ":" + minute + ampm + ", " + entrantToString(entrant) + " arrives";
    marketEntrant = entrant;
  }
  if(typeof document !== "undefined") {
    document.getElementById("first-story").textContent = marketState;
    if(marketDisplay == false && marketEntrant === undefined && ghostmarket.length == 0) {
      document.getElementById("next-button").setAttribute("disabled", "");
    }
    document.getElementById("next-button").textContent = whathappensnextvariants[Math.floor(whathappensnextvariants.length * Math.random())];
  }
}

function runMarket() {
  restart();
  // Market is sorted from minimum price of Buyer to maximum price of Seller
  
  while(ghostmarket.length > 0) {
    var entrant = ghostmarket.pop();
    console.log(entrant.type + " with price of $" + entrant.price + " enters the market.");
    let result = addToMarket(market, entrant);
    if(result.traded) {
      if(entrant.type == "Seller") {
        console.log("S:" + entrant.type + " sells his share at $" + result.price);
      } else {
        console.log("B:" + entrant.type + " buys a share at $" + result.price);
      }
      tradePrice.push(result.price);
      tradeType.push(entrant.type);
      lastPrice = result.price;
    } else {
      tradePrice.push(lastPrice);
      tradeType.push("");
    }
    sellers.push(market.filter(x => x.type == "Seller").map(x => x.price));
    buyers.push(market.filter(x => x.type == "Buyer").map(x => x.price))
  }
  console.log("Evolution of trade price during the day:"/*, tradePrice*/);
  for(let price = MAX_PRICE; price >= MIN_PRICE; price--) {
    var index = tradePrice.indexOf(price);
    var display = tradePrice.map((k, ik) =>
      k == price ? (tradeType[ik] == "" ? "-" : tradeType[ik] == "Seller" ? "S" : "B") : 
      sellers[ik].indexOf(price) >= 0 ? "s" : buyers[ik].indexOf(price) >= 0 ? "b" : " ").join("");
    console.log((price < 100 ? " " : "")+"$"+price+":"+display);
  }
  //console.log("Remaining market", market);
  console.log("Last exchanged price: $"+ tradePrice[tradePrice.length - 1]);
  console.log("Min asked price: $"+ sellers[sellers.length - 1][0])
}

function addToMarket(market, entrant) {
  if(entrant.type == "Buyer") {
    var buyerInsertionPosition = 0;
    for(let i = 0; i < market.length; i++) {
      var price = market[i].price;
      if(market[i].type == "Seller" && price <= entrant.price) {
        market.splice(i, 1);
        return {traded: true, price: price};
      }
      if(market[i].type == "Buyer" && price <= entrant.price) {
        buyerInsertionPosition = i + 1;
      }
    }
    market.splice(buyerInsertionPosition, 0, entrant);
    return {traded: false};
  }
  if(entrant.type == "Seller") {
    var sellerInsertionPosition = market.length;
    for(let i = market.length-1; i >= 0; i--) {
      var price = market[i].price;
      if(market[i].type == "Buyer" && price >= entrant.price) {
        market.splice(i, 1);
        return {traded: true, price: price};
      }
      if(market[i].type == "Seller" && price >= entrant.price) {
        sellerInsertionPosition = i;
      }
    }
    market.splice(sellerInsertionPosition, 0, entrant);
    return {traded: false};
  }
}

function shuffle(array) {
  let currentIndex = array.length,  randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex != 0) {

    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }

  return array;
}

var simulationAverages = {
  1: {sell: [], buy: [], price: []},
  2: {sell: [], buy: [], price: []},
  3: {sell: [], buy: [], price: []}
}
function meanAndStandardDeviation(array) {
  if(array.length == 0) {
    return {mean: "N/A", stddev: "N/A"};
  }
  const n = array.length
  const mean = array.reduce((a, b) => a + b) / n
  var result = {mean: Math.floor(mean*10)/10, stddev: Math.floor(100*Math.sqrt(array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n))/100};
  if(result.mean === undefined || result.mean !== result.mean) {
    result.mean = "?";
  }
  if(result.stddev === undefined || result.stddev !== result.stddev) {
    result.stddev = "?";
  }
  return result;
}
// Returns the current averages
function addToSimulation(simulationId, sell, buy, price) {
  var s = simulationAverages[simulationId];
  if(sell !== undefined && sell == sell) s.sell.push(sell);
  if(buy !== undefined && buy == buy) s.buy.push(buy);
  if(price !== undefined && price == price) s.price.push(price);
  return {sampleSize: s.sell.length, sell: meanAndStandardDeviation(s.sell), buy: meanAndStandardDeviation(s.buy), price: meanAndStandardDeviation(s.price)};
}

function simulate(simulationId, times=1) {
  var element = document.getElementById("simulation"+simulationId);
  var fullMarketStatus = typeof document === "undefined" ? true :
    document.getElementById("displaymarketstatus").checked
  for(var t = 1; t <= times; t++) {
    restart(simulationId);
    // Market is sorted from minimum price of Buyer to maximum price of Seller
    
    while(ghostmarket.length > 0) {
      var entrant = ghostmarket.pop();
      let result = addToMarket(market, entrant);
      if(result.traded) {
        tradePrice.push(result.price);
        tradeType.push(entrant.type);
        lastPrice = result.price;
      } else {
        tradePrice.push(lastPrice);
        tradeType.push("");
      }
      sellers.push(market.filter(x => x.type == "Seller").map(x => x.price));
      buyers.push(market.filter(x => x.type == "Buyer").map(x => x.price))
    }
    var result = "";
    if(t == times && simulationId == 1) {
      for(let price = MAX_PRICE; price >= MIN_PRICE; price--) {
        var index = tradePrice.indexOf(price);
        var display = tradePrice.map((k, ik) =>
          k == price ? (tradeType[ik] == "" || !fullMarketStatus ? "-" : tradeType[ik] == "Seller" ? "S" : "B") : 
          sellers[ik].indexOf(price) >= 0 && fullMarketStatus ? "s" : buyers[ik].indexOf(price) >= 0 && fullMarketStatus ? "b" : " ").join("");
        result += (price < 100 ? " " : "")+"$"+price+":"+display + "\n";
      }
      //console.log("Remaining market", market);
      result += "Last exchanged price: $"+ tradePrice[tradePrice.length - 1];
    }
    var sell = sellers[sellers.length - 1][0];
    var buy = buyers[buyers.length - 1][buyers[buyers.length - 1].length - 1];
    var price = (buy + sell) / 2;
    var m = addToSimulation(simulationId, sell, buy, price);
  }
  result += "\nFinal min seller price: $"+ (sell === undefined ? "none" : sell) + " (mean "+m.sell.mean+" stddev="+m.sell.stddev+")";
  result += "\nFinal max buyer price : $"+ (buy === undefined ? "none" : buy) + " (mean "+m.buy.mean+" stddev="+m.buy.stddev+")";
  result += "\nFinal stock 'price'   : $" + (price !== price ? "none" : price) + " (mean "+m.price.mean+" stddev="+m.price.stddev+")";
  result += "\nSample size: " + m.sampleSize;
  element.textContent = result.trim();
}

if(immediatelyRun) {
  runMarket();
} else {
  restart();
}