const commitResult = display(await (commitChanges
  ? (async () => {
      const beforeStaging = await git.statusMatrix(repo);

      await Promise.all(beforeStaging.map(([filepath, , workdir]) => (
        workdir === 0
          ? git.remove({...repo, filepath})
          : git.add({...repo, filepath})
      )));

      const staged = await git.statusMatrix(repo);
      const changedFiles = staged
        .filter(([, head, , stage]) => head !== stage)
        .map(([filepath]) => filepath);

      if(!changedFiles.length) {
        return {created: false, message: 'Nothing to commit.'};
      }

      const oid = await git.commit({
        ...repo,
        message: `Save notebook changes (${commitChanges})`,
        author: {
          name: 'Notebook Author',
          email: 'notebook@example.com'
        }
      });
      return {created: true, oid, files: changedFiles};
    })()
  : Promise.resolve({created: false, message: 'Click “Commit changed files” to stage and commit the working tree.'})));
