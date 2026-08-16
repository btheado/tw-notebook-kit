// Turn Node-style memfs watch events into an Observable value.
const observeMemfs = (fs, path, options = {}) => Generators.observe(change => {
  const watcher = fs.watch(path, options, (eventType, filename) => {
    change({
      eventType,
      filename: filename ? String(filename) : null,
      time: new Date().toISOString()
    });
  });

  change({eventType: 'ready', filename: path, time: new Date().toISOString()});
  return () => watcher.close();
});
