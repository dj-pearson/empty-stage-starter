/**
 * The readable text of a fetched page, for the admin SEO tools' prompts
 * (analyze-semantic-keywords, optimize-page-content).
 *
 * Both functions carried a copy that stripped <script> and <style> with
 * one-pass regexes and then decoded entities one replace at a time. The regex
 * missed `</script >` (a space before the '>'), so a script body could survive
 * into the text, and decoding &amp; before &lt; turned `&amp;lt;` into '<'.
 * This scans for the blocks instead, and decodes every entity in one pass, so
 * nothing is decoded twice.
 *
 * The output is plain text for a model prompt. It is never HTML and must not
 * be rendered as HTML.
 */

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
};

/** Case-insensitive index of `needle` (already lower case) in `lower`, from `from`. */
function find(lower: string, needle: string, from: number): number {
  return lower.indexOf(needle, from);
}

/**
 * Drop every <script> and <style> element, contents included. An unclosed one
 * runs to the end of the document, which is how a browser reads it too.
 */
export function dropRawTextElements(html: string): string {
  const lower = html.toLowerCase();
  let out = '';
  let i = 0;
  while (i < html.length) {
    const s = find(lower, '<script', i);
    const t = find(lower, '<style', i);
    const start = s === -1 ? t : t === -1 ? s : Math.min(s, t);
    if (start === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, start);
    const closeTag = start === s ? '</script' : '</style';
    const close = find(lower, closeTag, start);
    if (close === -1) break;
    const end = html.indexOf('>', close);
    if (end === -1) break;
    i = end + 1;
    out += ' ';
  }
  return out;
}

/** Replace every "<...>" run with a space and drop any bracket left over. */
export function stripTagsToSpaces(html: string): string {
  let out = '';
  let i = 0;
  while (i < html.length) {
    const ch = html[i];
    if (ch === '<') {
      const close = html.indexOf('>', i + 1);
      i = close === -1 ? i + 1 : close + 1;
      out += ' ';
    } else {
      if (ch !== '>') out += ch;
      i += 1;
    }
  }
  return out;
}

/** Decode the six entities these pages use, each exactly once. */
export function decodeBasicEntities(text: string): string {
  return text.replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (_m, name: string) => ENTITIES[name]);
}

export function extractTextContent(html: string): string {
  let text = dropRawTextElements(html);

  const mainMatch = text.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const articleMatch = text.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (mainMatch) {
    text = mainMatch[1];
  } else if (articleMatch) {
    text = articleMatch[1];
  }

  return decodeBasicEntities(stripTagsToSpaces(text)).replace(/\s+/g, ' ').trim();
}
