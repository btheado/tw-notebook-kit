const appendedLine = display(await (appendTimestamp
  ? pfs.appendFile(
      `${notebookFilesDir}/notes.txt`,
      `${appendTimestamp}\n`,
      'utf8'
    ).then(() => `Appended ${appendTimestamp} to notes.txt.`)
  : Promise.resolve('Click “Append a dated line” to modify notes.txt.')));
