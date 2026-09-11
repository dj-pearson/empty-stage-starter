/**
 * US-838: an icon-only button with no accessible name announces as "button".
 *
 * src/pages/VPAT.tsx declares this open under 4.1.2 Name, Role, Value and
 * 2.5.3 Label in Name: "Some icon-only buttons do not yet expose an accessible
 * name; an accessible-name remediation pass is in progress." It was true --
 * 38 of them, including the control that stops the camera on the food-capture
 * screen and the one that starts a new conversation in the AI coach.
 *
 * THE DETECTOR IS BRACE-AWARE ON PURPOSE. The obvious version,
 * `<Button([^>]*)>`, stops at the first `>` it meets -- and `onClick={() =>
 * ...}` contains one. That version found 8 of the 38 and reported the tree
 * almost clean. Anything that reads JSX attributes here has to skip over
 * braces and quoted strings to find the tag's real end.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { tagEnd } from './jsxTagEnd';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

/**
 * lucide-react icons that carry no text. Not exhaustive by design: this is the
 * set that actually appears as the sole child of a button in this tree, and a
 * new one is added when it does.
 */
const ICONS = [
  'Eye', 'EyeOff', 'X', 'Plus', 'Minus', 'Trash', 'Trash2', 'Edit', 'Edit2', 'Edit3', 'Pencil',
  'Search', 'Settings', 'Settings2', 'ChevronDown', 'ChevronUp', 'ChevronLeft', 'ChevronRight',
  'MoreHorizontal', 'MoreVertical', 'Check', 'CheckCircle', 'Copy', 'Download', 'Upload', 'Share',
  'Share2', 'Bell', 'BellOff', 'User', 'Users', 'Menu', 'ArrowLeft', 'ArrowRight', 'ArrowUp',
  'ArrowDown', 'RefreshCw', 'RotateCcw', 'Filter', 'Calendar', 'Star', 'Heart', 'Info', 'Play',
  'Pause', 'Save', 'Send', 'Mic', 'MicOff', 'Camera', 'Image', 'Link', 'Lock', 'Unlock', 'LogOut',
  'Home', 'ExternalLink', 'Maximize2', 'Minimize2', 'GripVertical', 'Loader2', 'Volume2',
  'VolumeX', 'Sun', 'Moon',
];

const ICON_ONLY_BODY = new RegExp(`^\\s*<(${ICONS.join('|')})\\b[^<]*/>\\s*$`);

function stripComments(source: string): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) ?? []).length));
  return withoutBlocks
    .split('\n')
    .map((line) => (/^\s*(\/\/|\*)/.test(line) ? '' : line))
    .join('\n');
}



export interface IconButton {
  file: string;
  line: number;
}

export function scanSource(file: string, raw: string): IconButton[] {
  const source = stripComments(raw);
  const found: IconButton[] = [];
  for (const m of source.matchAll(/<(Button|button)(?=[\s>])/g)) {
    const tag = m[1];
    const end = tagEnd(source, m.index! + m[0].length);
    if (end === -1 || source[end - 1] === '/') continue;
    const attrs = source.slice(m.index! + m[0].length, end);
    const close = source.indexOf(`</${tag}>`, end);
    if (close === -1) continue;
    if (!ICON_ONLY_BODY.test(source.slice(end + 1, close))) continue;
    if (/\baria-label\b|\baria-labelledby\b|\btitle=/.test(attrs)) continue;
    found.push({ file, line: source.slice(0, m.index!).split('\n').length });
  }
  return found;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // shadcn primitives are vendored and out of bounds per CLAUDE.md; their
      // consumers supply the label.
      if (entry !== 'ui') walk(full, out);
    } else if (entry.endsWith('.tsx') && !entry.includes('.test.')) out.push(full);
  }
  return out;
}

const unnamed = walk(SRC).flatMap((file) =>
  scanSource(file.slice(ROOT.length + 1).split('\\').join('/'), readFileSync(file, 'utf8'))
);

describe('US-838: the detector', () => {
  const BUTTON_WITH_ARROW_HANDLER = `
    <Button variant="ghost" onClick={() => remove(item.id)}>
      <Trash2 className="h-4 w-4" />
    </Button>
  `;

  it('sees past a fat arrow in an inline handler', () => {
    // The naive /<Button([^>]*)>/ stops at the > in `=>` and finds nothing here.
    expect(scanSource('synthetic.tsx', BUTTON_WITH_ARROW_HANDLER)).toHaveLength(1);
  });

  it('accepts a labelled button', () => {
    const labelled = BUTTON_WITH_ARROW_HANDLER.replace(
      '<Button variant="ghost"',
      '<Button aria-label="Delete this item" variant="ghost"'
    );
    expect(scanSource('synthetic.tsx', labelled)).toEqual([]);
  });

  it('ignores a button that has visible text beside the icon', () => {
    const withText = `<Button onClick={() => save()}><Save className="h-4 w-4" />Save</Button>`;
    expect(scanSource('synthetic.tsx', withText)).toEqual([]);
  });

  it('ignores a className containing a > inside a template string', () => {
    const tricky = `
      <Button aria-label="Refresh" onClick={load} className={\`h-4 \${busy ? 'a>b' : ''}\`}>
        <RefreshCw className="h-4 w-4" />
      </Button>
    `;
    expect(scanSource('synthetic.tsx', tricky)).toEqual([]);
  });

  it('reads code, not comments', () => {
    const commented = `// <Button onClick={() => x()}><X className="h-4 w-4" /></Button>`;
    expect(scanSource('synthetic.tsx', commented)).toEqual([]);
  });

  it('scans a realistic number of files', () => {
    expect(walk(SRC).length).toBeGreaterThanOrEqual(200);
  });
});

describe('US-838: every icon-only button has an accessible name', () => {
  it('none are left unnamed', () => {
    const list = unnamed.map((b) => `${b.file}:${b.line}`).join('\n');
    expect(unnamed, `icon-only buttons announcing as just "button":\n${list}`).toEqual([]);
  });
});
