const fileRows = await Promise.all(directoryListing.files.map(async filename => ({
  filename,
  contents: await pfs.readFile(watchDir + '/' + filename, 'utf8')
})));

const fileTable = html`<table>
  <thead>
    <tr><th>Filename</th><th>Contents</th></tr>
  </thead>
  <tbody></tbody></table>`;

const tbody = fileTable.querySelector('tbody');
for(const {filename, contents} of fileRows) {
  const row = document.createElement('tr');
  const filenameCell = document.createElement('td');
  const contentsCell = document.createElement('td');
  const pre = document.createElement('pre');

  filenameCell.textContent = filename;
  pre.textContent = contents;
  contentsCell.append(pre);
  row.append(filenameCell, contentsCell);
  tbody.append(row);
}

display(fileTable);
