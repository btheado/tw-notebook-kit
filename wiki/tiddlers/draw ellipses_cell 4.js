// This is a hack to avoid:
// "ResizeObserver loop completed with undelivered notifications."
// with the notebook-kit built-in width variable
const mywidth = await Promises.delay(1, width)