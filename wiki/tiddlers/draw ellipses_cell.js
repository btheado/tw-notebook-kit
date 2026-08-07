const ctx = DOM.context2d(mywidth, 400);

ctx.fillStyle = "white";
ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

display(ctx.canvas);