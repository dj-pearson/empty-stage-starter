import { describe, it, expect } from 'vitest';
import {
  hexToRgb,
  rgbToHex,
  hexToHsl,
  hslToHex,
  rgbToHsl,
  hslToRgb,
  getContrastRatio,
  meetsContrastRequirement,
  lighten,
  darken,
  saturate,
  desaturate,
  rotateHue,
  getComplementary,
  getAnalogous,
  getTriadic,
  mix,
  getTints,
  getShades,
  isLight,
  getContrastText,
  generatePalette,
  isValidColor,
  randomColor,
} from './color-utils';

describe('Color Utilities', () => {
  describe('hexToRgb', () => {
    it('should convert full hex to RGB', () => {
      expect(hexToRgb('#ff5733')).toEqual({ r: 255, g: 87, b: 51 });
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
      expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    });

    it('should convert shorthand hex to RGB', () => {
      expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0 });
      expect(hexToRgb('#0f0')).toEqual({ r: 0, g: 255, b: 0 });
      expect(hexToRgb('#00f')).toEqual({ r: 0, g: 0, b: 255 });
    });

    it('should handle hex without hash', () => {
      expect(hexToRgb('ff5733')).toEqual({ r: 255, g: 87, b: 51 });
      expect(hexToRgb('f00')).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('should return null for invalid hex', () => {
      expect(hexToRgb('#gg0000')).toBeNull();
      expect(hexToRgb('#ff')).toBeNull();
      expect(hexToRgb('invalid')).toBeNull();
    });
  });

  describe('rgbToHex', () => {
    it('should convert RGB to hex', () => {
      expect(rgbToHex(255, 87, 51)).toBe('#ff5733');
      expect(rgbToHex(0, 0, 0)).toBe('#000000');
      expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
    });

    it('should handle out of range values', () => {
      expect(rgbToHex(300, 0, 0)).toBe('#ff0000');
      expect(rgbToHex(-10, 0, 0)).toBe('#000000');
    });
  });

  describe('Color conversions', () => {
    it('should convert hex to HSL and back', () => {
      const hex = '#ff5733';
      const originalRgb = hexToRgb(hex);
      const hsl = hexToHsl(hex);
      expect(hsl).toBeDefined();
      if (hsl && originalRgb) {
        const backToRgb = hslToRgb(hsl.h, hsl.s, hsl.l);
        expect(backToRgb.r).toBeCloseTo(originalRgb.r, 1);
        expect(backToRgb.g).toBeCloseTo(originalRgb.g, 1);
        expect(backToRgb.b).toBeCloseTo(originalRgb.b, 1);
      }
    });

    it('should convert RGB to HSL and back', () => {
      const rgb = { r: 255, g: 87, b: 51 };
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      const backToRgb = hslToRgb(hsl.h, hsl.s, hsl.l);
      expect(backToRgb.r).toBeCloseTo(rgb.r, 1);
      expect(backToRgb.g).toBeCloseTo(rgb.g, 1);
      expect(backToRgb.b).toBeCloseTo(rgb.b, 1);
    });
  });

  describe('getContrastRatio', () => {
    it('should calculate correct contrast ratios', () => {
      // Black and white have the maximum contrast ratio of 21:1
      expect(getContrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);

      // Same color has a contrast ratio of 1:1
      expect(getContrastRatio('#000000', '#000000')).toBeCloseTo(1, 0);
    });

    it('should handle color order', () => {
      // Contrast ratio should be the same regardless of order
      const ratio1 = getContrastRatio('#ff0000', '#00ff00');
      const ratio2 = getContrastRatio('#00ff00', '#ff0000');
      expect(ratio1).toBeCloseTo(ratio2, 1);
    });
  });

  describe('meetsContrastRequirement', () => {
    it('should check WCAG AA compliance for normal text', () => {
      expect(meetsContrastRequirement('#000000', '#ffffff', 'AA', 'normal')).toBe(true);
      expect(meetsContrastRequirement('#777777', '#888888', 'AA', 'normal')).toBe(false);
    });

    it('should check WCAG AAA compliance', () => {
      expect(meetsContrastRequirement('#000000', '#ffffff', 'AAA', 'normal')).toBe(true);
      expect(meetsContrastRequirement('#000000', '#ffffff', 'AAA', 'large')).toBe(true);
    });

    it('should have different requirements for large text', () => {
      // Some colors pass for large text but not normal
      const fg = '#777777';
      const bg = '#ffffff';
      const normalAA = meetsContrastRequirement(fg, bg, 'AA', 'normal');
      const largeAA = meetsContrastRequirement(fg, bg, 'AA', 'large');
      expect(largeAA).toBe(true);
      expect(normalAA).toBe(false);
    });
  });

  describe('lighten and darken', () => {
    it('should lighten color', () => {
      const original = '#808080';
      const lighter = lighten(original, 20);
      const lightness = hexToHsl(lighter)?.l || 0;
      expect(lightness).toBeGreaterThan(50);
    });

    it('should darken color', () => {
      const original = '#808080';
      const darker = darken(original, 20);
      const lightness = hexToHsl(darker)?.l || 0;
      expect(lightness).toBeLessThan(50);
    });

    it('should not exceed bounds', () => {
      const white = '#ffffff';
      const lighterWhite = lighten(white, 50);
      expect(hexToHsl(lighterWhite)?.l).toBe(100);

      const black = '#000000';
      const darkerBlack = darken(black, 50);
      expect(hexToHsl(darkerBlack)?.l).toBe(0);
    });
  });

  describe('saturate and desaturate', () => {
    it('should increase saturation', () => {
      const gray = '#808080';
      const saturated = saturate(gray, 50);
      const saturation = hexToHsl(saturated)?.s || 0;
      expect(saturation).toBeGreaterThan(0);
    });

    it('should decrease saturation', () => {
      const red = '#ff0000';
      const desaturated = desaturate(red, 50);
      const saturation = hexToHsl(desaturated)?.s || 0;
      expect(saturation).toBeLessThan(100);
    });
  });

  describe('rotateHue', () => {
    it('should rotate hue by degrees', () => {
      const color = '#ff0000'; // Red
      const rotated = rotateHue(color, 120); // Should be close to green
      const hue = hexToHsl(rotated)?.h || 0;
      expect(hue).toBeCloseTo(120, 0);
    });

    it('should wrap around at 360 degrees', () => {
      const color = '#ff0000'; // Red (0 degrees)
      const rotated = rotateHue(color, 720); // Full circle twice
      const hue = hexToHsl(rotated)?.h || 0;
      expect(hue).toBeCloseTo(0, 0);
    });

    it('should handle negative rotation', () => {
      const color = '#ff0000'; // Red (0 degrees)
      const rotated = rotateHue(color, -120); // Should be close to cyan
      const hue = hexToHsl(rotated)?.h || 0;
      expect(hue).toBeCloseTo(240, 0);
    });
  });

  describe('getComplementary', () => {
    it('should return complementary color', () => {
      const color = '#ff0000'; // Red
      const complementary = getComplementary(color);
      const hue = hexToHsl(complementary)?.h || 0;
      expect(hue).toBeCloseTo(180, 0); // Cyan
    });
  });

  describe('getAnalogous', () => {
    it('should return two analogous colors', () => {
      const color = '#ff0000'; // Red
      const [left, right] = getAnalogous(color, 30);

      const originalHue = hexToHsl(color)?.h || 0;
      const leftHue = hexToHsl(left)?.h || 0;
      const rightHue = hexToHsl(right)?.h || 0;

      expect(leftHue).toBeCloseTo((originalHue - 30 + 360) % 360, 0);
      expect(rightHue).toBeCloseTo((originalHue + 30) % 360, 0);
    });
  });

  describe('getTriadic', () => {
    it('should return two triadic colors', () => {
      const color = '#ff0000'; // Red
      const [second, third] = getTriadic(color);

      const hue2 = hexToHsl(second)?.h || 0;
      const hue3 = hexToHsl(third)?.h || 0;

      expect(hue2).toBeCloseTo(120, 0); // Green
      expect(hue3).toBeCloseTo(240, 0); // Blue
    });
  });

  describe('mix', () => {
    it('should mix two colors equally by default', () => {
      const color1 = '#000000'; // Black
      const color2 = '#ffffff'; // White
      const mixed = mix(color1, color2);

      // Should be gray
      const rgb = hexToRgb(mixed);
      expect(rgb?.r).toBeCloseTo(128, 10);
      expect(rgb?.g).toBeCloseTo(128, 10);
      expect(rgb?.b).toBeCloseTo(128, 10);
    });

    it('should respect weight parameter', () => {
      const color1 = '#000000'; // Black
      const color2 = '#ffffff'; // White

      const mostly1 = mix(color1, color2, 0.1);
      const mostly2 = mix(color1, color2, 0.9);

      const rgb1 = hexToRgb(mostly1);
      const rgb2 = hexToRgb(mostly2);

      expect(rgb1?.r).toBeLessThan(50); // Closer to black
      expect(rgb2?.r).toBeGreaterThan(200); // Closer to white
    });
  });

  describe('getTints and getShades', () => {
    it('should generate tints (lighter variations)', () => {
      const color = '#ff0000';
      const tints = getTints(color, 5);

      expect(tints).toHaveLength(5);

      // Each tint should be lighter than the previous
      for (let i = 1; i < tints.length; i++) {
        const prevL = hexToHsl(tints[i - 1])?.l || 0;
        const currentL = hexToHsl(tints[i])?.l || 0;
        expect(currentL).toBeGreaterThan(prevL);
      }
    });

    it('should generate shades (darker variations)', () => {
      const color = '#ff0000';
      const shades = getShades(color, 5);

      expect(shades).toHaveLength(5);

      // Each shade should be darker than the previous
      for (let i = 1; i < shades.length; i++) {
        const prevL = hexToHsl(shades[i - 1])?.l || 0;
        const currentL = hexToHsl(shades[i])?.l || 0;
        expect(currentL).toBeLessThan(prevL);
      }
    });
  });

  describe('isLight', () => {
    it('should identify light colors', () => {
      expect(isLight('#ffffff')).toBe(true);
      expect(isLight('#ffff00')).toBe(true);
    });

    it('should identify dark colors', () => {
      expect(isLight('#000000')).toBe(false);
      expect(isLight('#0000ff')).toBe(false);
    });
  });

  describe('getContrastText', () => {
    it('should return black for light backgrounds', () => {
      expect(getContrastText('#ffffff')).toBe('#000000');
      expect(getContrastText('#ffff00')).toBe('#000000');
    });

    it('should return white for dark backgrounds', () => {
      expect(getContrastText('#000000')).toBe('#ffffff');
      expect(getContrastText('#0000ff')).toBe('#ffffff');
    });
  });

  describe('generatePalette', () => {
    it('should generate a complete palette', () => {
      const palette = generatePalette('#ff5733');

      expect(palette).toHaveProperty('50');
      expect(palette).toHaveProperty('100');
      expect(palette).toHaveProperty('200');
      expect(palette).toHaveProperty('300');
      expect(palette).toHaveProperty('400');
      expect(palette).toHaveProperty('500');
      expect(palette).toHaveProperty('600');
      expect(palette).toHaveProperty('700');
      expect(palette).toHaveProperty('800');
      expect(palette).toHaveProperty('900');

      // Base color should be 500
      expect(palette['500'].toLowerCase()).toBe('#ff5733');
    });

    it('should have lighter shades at lower numbers', () => {
      const palette = generatePalette('#ff5733');

      const l50 = hexToHsl(palette['50'])?.l || 0;
      const l500 = hexToHsl(palette['500'])?.l || 0;
      const l900 = hexToHsl(palette['900'])?.l || 0;

      expect(l50).toBeGreaterThan(l500);
      expect(l500).toBeGreaterThan(l900);
    });
  });

  describe('isValidColor', () => {
    it('should validate hex colors', () => {
      expect(isValidColor('#ff0000')).toBe(true);
      expect(isValidColor('#f00')).toBe(true);
    });

    it('should validate rgb colors', () => {
      expect(isValidColor('rgb(255, 0, 0)')).toBe(true);
      expect(isValidColor('rgba(255, 0, 0, 0.5)')).toBe(true);
    });

    it('should validate named colors', () => {
      expect(isValidColor('red')).toBe(true);
      expect(isValidColor('blue')).toBe(true);
      expect(isValidColor('transparent')).toBe(true);
    });

    it('should reject invalid colors', () => {
      expect(isValidColor('notacolor')).toBe(false);
      expect(isValidColor('#gg0000')).toBe(false);
    });
  });

  describe('randomColor', () => {
    it('should generate valid hex color', () => {
      const color = randomColor();
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('should generate different colors', () => {
      const colors = new Set();
      for (let i = 0; i < 10; i++) {
        colors.add(randomColor());
      }
      // Should have generated at least some different colors
      expect(colors.size).toBeGreaterThan(1);
    });
  });
});
