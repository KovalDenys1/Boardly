// The text a reader sees in a mail's HTML: tags gone, entities decoded,
// whitespace collapsed. Sentences are asserted on this so an anchor inside one
// does not break the match.
export function visibleText(html: string): string {
  let text = html.replace(/<\/(?:p|h\d|div)>|<br\s*\/?>/gi, ' ')
  let previous: string
  do {
    previous = text
    text = text.replace(/<[^>]*>/g, '')
  } while (text !== previous)
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}
