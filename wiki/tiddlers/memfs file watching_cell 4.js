const createRandomFile = view(Inputs.button("Create a random file", {
  reduce: () => Math.random().toString(36).slice(2)
}));

const appendTimestamp = view(Inputs.button("Append a dated line", {
  reduce: () => new Date().toISOString()
}));
