const createdFile = display(await (createRandomFile
  ? pfs.writeFile(
      `${notebookFilesDir}/random-${createRandomFile}.txt`,
      `Created at ${new Date().toISOString()}\n`,
      'utf8'
    ).then(() => `Created random-${createRandomFile}.txt.`)
  : Promise.resolve('Click “Create a random file” to write an untracked file.')));
