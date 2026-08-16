await (fileEvents.eventType === 'ready'
  ? pfs.writeFile(
      `${watchDir}/watched.txt`,
      'This write is observed by memfs.\\n',
      'utf8'
    ).then(() => 'Wrote watched.txt; wait for the next watcher event.')
  : Promise.resolve('Watcher event received; no further write.'))