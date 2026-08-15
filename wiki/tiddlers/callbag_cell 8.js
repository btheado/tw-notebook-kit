pipe(
  interval(1000),
  map(x => x + 1),
  filter(x => x % 2),
  take(5),
  forEach(x => display(x))
)