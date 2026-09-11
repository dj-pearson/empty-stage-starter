/**
 * Where a JSX opening tag actually ends.
 *
 * Shared by the accessible-name scanners (icon buttons, progress bars) because
 * the obvious version of each -- `<Button([^>]*)>` -- is wrong in the same way:
 * it stops at the first `>` it meets, and `onClick={() => ...}` contains one.
 * That version found 8 of 38 nameless buttons and reported the tree almost
 * clean (US-838).
 *
 * Skips over braces and quoted strings, so a `>` inside an attribute
 * expression or a template literal does not end the tag.
 */
export function tagEnd(source: string, from: number): number {
  let depth = 0;
  for (let i = from; i < source.length; i += 1) {
    const c = source[i];
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (depth === 0 && (c === '"' || c === "'")) {
      const quote = c;
      i += 1;
      while (i < source.length && source[i] !== quote) i += 1;
    } else if (depth === 0 && c === '>') return i;
  }
  return -1;
}
