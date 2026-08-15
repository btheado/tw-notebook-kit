pipe(
  interval(1000),
  take(50),
  map(String),
  forEach(i => $tw.wiki.setText("$:/temp/t1","text",null,i))
)