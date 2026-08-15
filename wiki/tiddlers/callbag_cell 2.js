pipe(
  interval(1000),
  dropUntil(timer(6000)),
  toAsyncIterable
)