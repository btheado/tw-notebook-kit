const mouse = Generators.observe(notify => {
	function moved(event) {
		const rect = ctx.canvas.getBoundingClientRect();
		notify({
			x: (event.clientX - rect.left) * ctx.canvas.width / rect.width,
			y: (event.clientY - rect.top) * ctx.canvas.height / rect.height
		});
	}

	ctx.canvas.addEventListener("pointermove", moved);

	return () => ctx.canvas.removeEventListener("pointermove", moved);
});