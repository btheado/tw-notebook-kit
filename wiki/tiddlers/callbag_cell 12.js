pipe(
  fromTwFilter("[has[modified]!sort[modified]limit[10]]"),
  toAsyncIterable
)