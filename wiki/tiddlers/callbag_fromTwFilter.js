function fromTwFilter(filter) {
  return pipe(
    concat(
      fromIter([1]),
      fromWikiEvent("change"),
    ),
    map(() => $tw.wiki.filterTiddlers(filter))
  );
}