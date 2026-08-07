// Generator function which reruns the given filter after every tiddlywiki change event
const observeTwFilter = filter => {
  return Generators.observe(change => {
    const publish = () => change($tw.wiki.filterTiddlers(filter));
    $tw.wiki.addEventListener("change",publish);
    publish();
    return () => $tw.wiki.removeEventListener("change", publish);
  });
}