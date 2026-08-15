import create from 'https://cdn.jsdelivr.net/npm/callbag-create/+esm';
function fromWikiEvent(event) {
  return create(sink => {
    const handler = value => {
      sink(1, value)
    }

    $tw.wiki.addEventListener(event, handler)

    return () => {
      $tw.wiki.removeEventListener(event, handler)
    }
  })
}