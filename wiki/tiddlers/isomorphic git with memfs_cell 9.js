const statusRows = await ((fileEvent, commitResult), Promise.all((await git.statusMatrix(repo)).map(
  async ([filepath]) => ({
    filepath,
    status: await git.status({...repo, filepath})
  })
)));

const statusTable = html`<table>
  <thead><tr><th>File</th><th>Git status</th></tr></thead>
  <tbody></tbody>
</table>`;
const tbody = statusTable.querySelector('tbody');

for(const {filepath, status} of statusRows) {
  const row = document.createElement('tr');
  const fileCell = document.createElement('td');
  const statusCell = document.createElement('td');
  fileCell.textContent = filepath;
  statusCell.textContent = status;
  row.append(fileCell, statusCell);
  tbody.append(row);
}

if(!statusRows.length) {
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = 2;
  cell.textContent = 'Working tree is clean.';
  row.append(cell);
  tbody.append(row);
}

display(statusTable);
