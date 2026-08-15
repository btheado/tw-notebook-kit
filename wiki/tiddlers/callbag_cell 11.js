pipe(
  concat(
    fromIter([1]), // To give output right away instead of waiting for the first change
    fromWikiEvent("change"),
  ),
  map(() => $tw.wiki.filterTiddlers("[prefix[callbag]]")),
  toAsyncIterable
)