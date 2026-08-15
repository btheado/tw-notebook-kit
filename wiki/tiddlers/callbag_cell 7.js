pipe(
  fromEvent(document, 'click'),
//  filter(ev => ev.target.tagName === 'BUTTON'),
  map(ev => ({x: ev.clientX, y: ev.clientY})),
  toAsyncIterable
)