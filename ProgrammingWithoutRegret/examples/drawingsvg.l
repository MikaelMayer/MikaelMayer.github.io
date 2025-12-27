//updatedelay: 1
[{tag="canvas", attributes={id="myCanvas", width="200", height="200",
onmousedown=``
  this.currentPath = "M " + event.offsetX + " " + event.offsetY;
  this.currentX = event.offsetX;
  this.currentY = event.offsetY;``, onmousemove=``if(typeof this.currentPath != "undefined") {
  this.currentPath = this.currentPath + " L " + event.offsetX + " " + event.offsetY;
  var c = document.getElementById("myCanvas");
  var ctx = c.getContext("2d");
  ctx.moveTo(this.currentX,this.currentY);
  ctx.lineTo(event.offsetX,event.offsetY);
  ctx.stroke();
  this.currentX = event.offsetX;
  this.currentY = event.offsetY;
}
``,
onmouseup = ``if(typeof this.currentPath != "undefined") {
  var c = this.currentPath;
  this.currentPath = undefined;
  var svg = document.getElementById("mySVG");
  var xmlns = "http://www.w3.org/2000/svg";
  var path = document.createElementNS(xmlns, "path");
  path.setAttributeNS(null, "d", c);
  path.setAttributeNS(null, "fill", "transparent");
  svg.append(path);
}``
}, styles={position="absolute",cursor="crosshair"}},
{tag="svg", attributes={id="mySVG",width="200",height="200"},
styles={border="1px solid #000000;",cursor="default"}}]