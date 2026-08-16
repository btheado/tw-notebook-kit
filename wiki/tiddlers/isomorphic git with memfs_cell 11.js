const commits = await (committed, commitResult, git.log({...repo, depth: 10}));

const logTable = html`<table>
  <thead><tr><th>Commit</th><th>Message</th><th>Author</th><th>Date</th></tr></thead>
  <tbody></tbody>
</table>`;
const logBody = logTable.querySelector('tbody');

for(const {oid, commit} of commits) {
  const row = document.createElement('tr');
  const values = [
    oid.slice(0, 7),
    commit.message.trim(),
    commit.author.name,
    new Date(commit.author.timestamp * 1000).toISOString()
  ];
  for(const value of values) {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.append(cell);
  }
  logBody.append(row);
}

display(logTable);
