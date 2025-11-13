/**
 * Color Manipulation Utilities
 *
 * Helper functions for color conversions, manipulations, and theme management.
 */

export interface RGB {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

export interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

export interface RGBA extends RGB {
  a: number; // 0-1
}

/**
 * Convert HEX color to RGB
 *
 * Usage:
 * ```tsx
 * hexToRgb('#ff5733'); // { r: 255, g: 87, b: 51 }
 * hexToRgb('#f00'); // { r: 255, g: 0, b: 0 }
 * ```
 */
export function hexToRgb(hex: string): RGB | null {
  // Remove # if present
  const cleanHex = hex.replace(/^#/, '');

  // Handle shorthand hex (#fff)
  if (cleanHex.length === 3) {
    const [r, g, b] = cleanHex.split('');
    return {
      r: parseInt(r + r, 16),
      g: parseInt(g + g, 16),
      b: parseInt(b + b, 16),
    };
  }

  // Handle full hex (#ffffff)
  if (cleanHex.length === 6) {
    return {
      r: parseInt(cleanHex.substring(0, 2), 16),
      g: parseInt(cleanHex.substring(2, 4), 16),
      b: parseInt(cleanHex.substring(4, 6), 16),
    };
  }

  return null;
}

/**
 * Convert RGB to HEX
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.round(Math.max(0, Math.min(255, n))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (diff !== 0) {
    s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / diff + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / diff + 2) / 6;
        break;
      case b:
        h = ((r - g) / diff + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Convert HSL to RGB
 */
export function hslToRgb(h: number, s: number, l: number): RGB {
  h /= 360;
  s /= 100;
  l /= 100;

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

/**
 * Convert HEX to HSL
 */
export function hexToHsl(hex: string): HSL | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return rgbToHsl(rgb.r, rgb.g, rgb.b);
}

/**
 * Convert HSL to HEX
 */
export function hslToHex(h: number, s: number, l: number): string {
  const rgb = hslToRgb(h, s, l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

/**
 * Calculate relative luminance (WCAG formula)
 */
export function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors (WCAG)
 *
 * Usage:
 * ```tsx
 * getContrastRatio('#000000', '#ffffff'); // 21 (maximum contrast)
 * getContrastRatio('#777777', '#888888'); // 1.15 (low contrast)
 * ```
 */
export function getContrastRatio(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  if (!rgb1 || !rgb2) return 0;

  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);

  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if color meets WCAG contrast requirements
 *
 * Usage:
 * ```tsx
 * meetsContrastRequirement('#000', '#fff', 'AA'); // true
 * meetsContrastRequirement('#777', '#888', 'AAA'); // false
 * ```
 */
export function meetsContrastRequirement(
  foreground: string,
  background: string,
  level: 'AA' | 'AAA' = 'AA',
  size: 'normal' | 'large' = 'normal'
): boolean {
  const ratio = getContrastRatio(foreground, background);

  if (level === 'AAA') {
    return size === 'large' ? ratio >= 4.5 : ratio >= 7;
  }

  // AA level
  return size === 'large' ? ratio >= 3 : ratio >= 4.5;
}

/**
 * Lighten a color by percentage
 *
 * Usage:
 * ```tsx
 * lighten('#ff5733', 20); // Lightens by 20%
 * ```
 */
export function lighten(hex: string, percent: number): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;

  hsl.l = Math.min(100, hsl.l + percent);
  return hslToHex(hsl.h, hsl.s, hsl.l);
}

/**
 * Darken a color by percentage
 */
export function darken(hex: string, percent: number): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;

  hsl.l = Math.max(0, hsl.l - percent);
  return hslToHex(hsl.h, hsl.s, hsl.l);
}

/**
 * Saturate a color by percentage
 */
export function saturate(hex: string, percent: number): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;

  hsl.s = Math.min(100, hsl.s + percent);
  return hslToHex(hsl.h, hsl.s, hsl.l);
}

/**
 * Desaturate a color by percentage
 */
export function desaturate(hex: string, percent: number): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;

  hsl.s = Math.max(0, hsl.s - percent);
  return hslToHex(hsl.h, hsl.s, hsl.l);
}

/**
 * Rotate hue by degrees
 */
export function rotateHue(hex: string, degrees: number): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;

  hsl.h = (hsl.h + degrees) % 360;
  if (hsl.h < 0) hsl.h += 360;

  return hslToHex(hsl.h, hsl.s, hsl.l);
}

/**
 * Get complementary color
 */
export function getComplementary(hex: string): string {
  return rotateHue(hex, 180);
}

/**
 * Generate analogous colors
 */
export function getAnalogous(hex: string, angle: number = 30): [string, string] {
  return [rotateHue(hex, -angle), rotateHue(hex, angle)];
}

/**
 * Generate triadic colors
 */
export function getTriadic(hex: string): [string, string] {
  return [rotateHue(hex, 120), rotateHue(hex, 240)];
}

/**
 * Generate tetradic colors
 */
export function getTetradic(hex: string): [string, string, string] {
  return [rotateHue(hex, 90), rotateHue(hex, 180), rotateHue(hex, 270)];
}

/**
 * Generate split complementary colors
 */
export function getSplitComplementary(hex: string, angle: number = 30): [string, string] {
  const complement = getComplementary(hex);
  return [rotateHue(complement, -angle), rotateHue(complement, angle)];
}

/**
 * Mix two colors
 */
export function mix(color1: string, color2: string, weight: number = 0.5): string {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  if (!rgb1 || !rgb2) return color1;

  const w = Math.max(0, Math.min(1, weight));

  const r = Math.round(rgb1.r * (1 - w) + rgb2.r * w);
  const g = Math.round(rgb1.g * (1 - w) + rgb2.g * w);
  const b = Math.round(rgb1.b * (1 - w) + rgb2.b * w);

  return rgbToHex(r, g, b);
}

/**
 * Generate tints (lighter versions)
 */
export function getTints(hex: string, count: number = 5): string[] {
  const tints: string[] = [];
  const step = 100 / (count + 1);

  for (let i = 1; i <= count; i++) {
    tints.push(mix(hex, '#ffffff', i * step / 100));
  }

  return tints;
}

/**
 * Generate shades (darker versions)
 */
export function getShades(hex: string, count: number = 5): string[] {
  const shades: string[] = [];
  const step = 100 / (count + 1);

  for (let i = 1; i <= count; i++) {
    shades.push(mix(hex, '#000000', i * step / 100));
  }

  return shades;
}

/**
 * Generate tones (grayed versions)
 */
export function getTones(hex: string, count: number = 5): string[] {
  const tones: string[] = [];
  const step = 100 / (count + 1);

  for (let i = 1; i <= count; i++) {
    tones.push(mix(hex, '#808080', i * step / 100));
  }

  return tones;
}

/**
 * Check if color is light or dark
 */
export function isLight(hex: string, threshold: number = 0.5): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return true;

  const luminance = getLuminance(rgb.r, rgb.g, rgb.b);
  return luminance > threshold;
}

/**
 * Get contrasting text color (black or white)
 */
export function getContrastText(backgroundColor: string): string {
  return isLight(backgroundColor) ? '#000000' : '#ffffff';
}

/**
 * Parse CSS color string to RGB
 *
 * Usage:
 * ```tsx
 * parseColor('#ff5733'); // { r: 255, g: 87, b: 51 }
 * parseColor('rgb(255, 87, 51)'); // { r: 255, g: 87, b: 51 }
 * parseColor('rgba(255, 87, 51, 0.5)'); // { r: 255, g: 87, b: 51, a: 0.5 }
 * ```
 */
export function parseColor(color: string): RGB | RGBA | null {
  // HEX
  if (color.startsWith('#')) {
    return hexToRgb(color);
  }

  // RGB/RGBA
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbMatch) {
    const rgb: RGB | RGBA = {
      r: parseInt(rgbMatch[1]),
      g: parseInt(rgbMatch[2]),
      b: parseInt(rgbMatch[3]),
    };

    if (rgbMatch[4]) {
      (rgb as RGBA).a = parseFloat(rgbMatch[4]);
    }

    return rgb;
  }

  // HSL (convert to RGB)
  const hslMatch = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (hslMatch) {
    return hslToRgb(parseInt(hslMatch[1]), parseInt(hslMatch[2]), parseInt(hslMatch[3]));
  }

  return null;
}

/**
 * Format RGB to CSS string
 */
export function formatRgb(r: number, g: number, b: number, a?: number): string {
  if (a !== undefined) {
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Format HSL to CSS string
 */
export function formatHsl(h: number, s: number, l: number, a?: number): string {
  if (a !== undefined) {
    return `hsla(${h}, ${s}%, ${l}%, ${a})`;
  }
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/**
 * Generate color palette from base color
 */
export function generatePalette(baseColor: string): {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
} {
  return {
    50: lighten(baseColor, 45),
    100: lighten(baseColor, 40),
    200: lighten(baseColor, 30),
    300: lighten(baseColor, 20),
    400: lighten(baseColor, 10),
    500: baseColor,
    600: darken(baseColor, 10),
    700: darken(baseColor, 20),
    800: darken(baseColor, 30),
    900: darken(baseColor, 40),
  };
}

/**
 * Check if color is valid CSS color
 */
export function isValidColor(color: string): boolean {
  const s = new Option().style;
  s.color = color;
  return s.color !== '';
}

/**
 * Get random color
 */
export function randomColor(): string {
  return `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
}

/**
 * Get random pastel color
 */
export function randomPastelColor(): string {
  const h = Math.floor(Math.random() * 360);
  const s = Math.floor(Math.random() * 30) + 70; // 70-100%
  const l = Math.floor(Math.random() * 20) + 70; // 70-90%
  return hslToHex(h, s, l);
}

/**
 * Average of multiple colors
 */
export function averageColors(colors: string[]): string {
  const rgbs = colors.map((color) => hexToRgb(color)).filter((rgb): rgb is RGB => rgb !== null);

  if (rgbs.length === 0) return '#000000';

  const avg = rgbs.reduce(
    (acc, rgb) => ({
      r: acc.r + rgb.r,
      g: acc.g + rgb.g,
      b: acc.b + rgb.b,
    }),
    { r: 0, g: 0, b: 0 }
  );

  return rgbToHex(
    Math.round(avg.r / rgbs.length),
    Math.round(avg.g / rgbs.length),
    Math.round(avg.b / rgbs.length)
  );
}

/**
 * Get gradient stops
 */
export function getGradientStops(color1: string, color2: string, stops: number = 5): string[] {
  const colors: string[] = [];

  for (let i = 0; i < stops; i++) {
    const weight = i / (stops - 1);
    colors.push(mix(color1, color2, weight));
  }

  return colors;
}

/**
 * Named colors map (CSS color names)
 */
export const NamedColors: Record<string, string> = {
  aliceblue: '#f0f8ff',
  antiquewhite: '#faebd7',
  aqua: '#00ffff',
  aquamarine: '#7fffd4',
  azure: '#f0ffff',
  beige: '#f5f5dc',
  bisque: '#ffe4c4',
  black: '#000000',
  blanchedalmond: '#ffebcd',
  blue: '#0000ff',
  blueviolet: '#8a2be2',
  brown: '#a52a2a',
  burlywood: '#deb887',
  cadetblue: '#5f9ea0',
  chartreuse: '#7fff00',
  chocolate: '#d2691e',
  coral: '#ff7f50',
  cornflowerblue: '#6495ed',
  cornsilk: '#fff8dc',
  crimson: '#dc143c',
  cyan: '#00ffff',
  darkblue: '#00008b',
  darkcyan: '#008b8b',
  darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9',
  darkgreen: '#006400',
  darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b',
  darkolivegreen: '#556b2f',
  darkorange: '#ff8c00',
  darkorchid: '#9932cc',
  darkred: '#8b0000',
  darksalmon: '#e9967a',
  darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f',
  darkturquoise: '#00ced1',
  darkviolet: '#9400d3',
  deeppink: '#ff1493',
  deepskyblue: '#00bfff',
  dimgray: '#696969',
  dodgerblue: '#1e90ff',
  firebrick: '#b22222',
  floralwhite: '#fffaf0',
  forestgreen: '#228b22',
  fuchsia: '#ff00ff',
  gainsboro: '#dcdcdc',
  ghostwhite: '#f8f8ff',
  gold: '#ffd700',
  goldenrod: '#daa520',
  gray: '#808080',
  green: '#008000',
  greenyellow: '#adff2f',
  honeydew: '#f0fff0',
  hotpink: '#ff69b4',
  indianred: '#cd5c5c',
  indigo: '#4b0082',
  ivory: '#fffff0',
  khaki: '#f0e68c',
  lavender: '#e6e6fa',
  lavenderblush: '#fff0f5',
  lawngreen: '#7cfc00',
  lemonchiffon: '#fffacd',
  lightblue: '#add8e6',
  lightcoral: '#f08080',
  lightcyan: '#e0ffff',
  lightgoldenrodyellow: '#fafad2',
  lightgray: '#d3d3d3',
  lightgreen: '#90ee90',
  lightpink: '#ffb6c1',
  lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa',
  lightskyblue: '#87cefa',
  lightslategray: '#778899',
  lightsteelblue: '#b0c4de',
  lightyellow: '#ffffe0',
  lime: '#00ff00',
  limegreen: '#32cd32',
  linen: '#faf0e6',
  magenta: '#ff00ff',
  maroon: '#800000',
  mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd',
  mediumorchid: '#ba55d3',
  mediumpurple: '#9370db',
  mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585',
  midnightblue: '#191970',
  mintcream: '#f5fffa',
  mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5',
  navajowhite: '#ffdead',
  navy: '#000080',
  oldlace: '#fdf5e6',
  olive: '#808000',
  olivedrab: '#6b8e23',
  orange: '#ffa500',
  orangered: '#ff4500',
  orchid: '#da70d6',
  palegoldenrod: '#eee8aa',
  palegreen: '#98fb98',
  paleturquoise: '#afeeee',
  palevioletred: '#db7093',
  papayawhip: '#ffefd5',
  peachpuff: '#ffdab9',
  peru: '#cd853f',
  pink: '#ffc0cb',
  plum: '#dda0dd',
  powderblue: '#b0e0e6',
  purple: '#800080',
  red: '#ff0000',
  rosybrown: '#bc8f8f',
  royalblue: '#4169e1',
  saddlebrown: '#8b4513',
  salmon: '#fa8072',
  sandybrown: '#f4a460',
  seagreen: '#2e8b57',
  seashell: '#fff5ee',
  sienna: '#a0522d',
  silver: '#c0c0c0',
  skyblue: '#87ceeb',
  slateblue: '#6a5acd',
  slategray: '#708090',
  snow: '#fffafa',
  springgreen: '#00ff7f',
  steelblue: '#4682b4',
  tan: '#d2b48c',
  teal: '#008080',
  thistle: '#d8bfd8',
  tomato: '#ff6347',
  turquoise: '#40e0d0',
  violet: '#ee82ee',
  wheat: '#f5deb3',
  white: '#ffffff',
  whitesmoke: '#f5f5f5',
  yellow: '#ffff00',
  yellowgreen: '#9acd32',
};
