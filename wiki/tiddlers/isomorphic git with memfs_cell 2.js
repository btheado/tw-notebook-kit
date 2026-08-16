initialized;
  await pfs.writeFile(
    `${repo.dir}/README.md`,
    '# Hello, Git!\n\nThis repository was created in memfs.\n',
    'utf8'
  );
  await pfs.mkdir(`${repo.dir}/src`, {recursive: true});
  await pfs.writeFile(
    `${repo.dir}/src/greeting.js`,
    'export const greeting = "Hello from an in-memory Git repository";\n',
    'utf8'
  );
  await pfs.mkdir(notebookFilesDir, {recursive: true});
  await pfs.writeFile(
    `${notebookFilesDir}/notes.txt`,
    'This tracked file can be changed with the button below.\n',
    'utf8'
  );

  await Promise.all([
    git.add({...repo, filepath: 'README.md'}),
    git.add({...repo, filepath: 'src/greeting.js'}),
    git.add({...repo, filepath: 'notebook-files/notes.txt'})
  ]);

const committed = await git.commit({
        ...repo,
        message: 'Create the first files',
        author: {
          name: 'Notebook Author',
          email: 'notebook@example.com'
        }
      });

display(await git.statusMatrix(repo));