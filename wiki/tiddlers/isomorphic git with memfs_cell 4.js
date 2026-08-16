display(html`<h2>Buttons to create/modify files/commits</h2>`);

const createRandomFile = view(Inputs.button('Create a random file', {
  reduce: () => Math.random().toString(36).slice(2)
}));

const appendTimestamp = view(Inputs.button('Append a dated line', {
  reduce: () => new Date().toISOString()
}));

const commitChanges = view(Inputs.button('Commit changed files', {
  reduce: () => new Date().toISOString()
}));