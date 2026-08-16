const directoryListing = display(await (fileEvents, pfs.readdir(watchDir)
  .then(files => ({
    lastEvent: fileEvents,
    files: files.sort()
  }))));
