import { describe, it, expect } from 'vitest';
import {
  normalizeItemText,
  singularize,
  isNumericToken,
  PREP_QUALIFIERS,
  UNIT_NOISE,
} from './itemNormalize';

describe('normalizeItemText', () => {
  it('collapses the three spellings the design names as the core failure', () => {
    // These are the exact strings from the spec: three things to the app,
    // one thing to the parent.
    const a = normalizeItemText('chicken breast');
    const b = normalizeItemText('chicken breasts');
    const c = normalizeItemText('2 lb boneless skinless chicken breasts');
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).toBe('breast chicken');
  });

  it('is case and whitespace insensitive', () => {
    expect(normalizeItemText('  Chicken   BREAST  ')).toBe(normalizeItemText('chicken breast'));
  });

  it('ignores word order, so "beef, ground" and "ground beef" agree', () => {
    expect(normalizeItemText('Beef, Ground')).toBe(normalizeItemText('ground beef'));
  });

  it('strips punctuation and parentheticals', () => {
    expect(normalizeItemText('tomatoes (roma)')).toBe(normalizeItemText('tomato'));
    expect(normalizeItemText('milk, whole.')).toBe(normalizeItemText('whole milk'));
  });

  it('drops leading quantities and units', () => {
    expect(normalizeItemText('3 cloves garlic')).toBe(normalizeItemText('garlic'));
    expect(normalizeItemText('2 cups flour')).toBe(normalizeItemText('flour'));
    expect(normalizeItemText('1/2 tsp salt')).toBe(normalizeItemText('salt'));
    expect(normalizeItemText('½ cup sugar')).toBe(normalizeItemText('sugar'));
  });

  it('drops ratios and percentages', () => {
    expect(normalizeItemText('ground beef 80/20')).toBe(normalizeItemText('ground beef'));
    expect(normalizeItemText('milk 2%')).toBe(normalizeItemText('milk'));
  });

  it('singularises common plurals', () => {
    expect(normalizeItemText('eggs')).toBe(normalizeItemText('egg'));
    expect(normalizeItemText('tomatoes')).toBe(normalizeItemText('tomato'));
    expect(normalizeItemText('berries')).toBe(normalizeItemText('berry'));
  });

  it('strips preparation words', () => {
    expect(normalizeItemText('finely chopped onion')).toBe(normalizeItemText('onion'));
    expect(normalizeItemText('fresh basil')).toBe(normalizeItemText('basil'));
    expect(normalizeItemText('organic carrots')).toBe(normalizeItemText('carrot'));
    expect(normalizeItemText('peeled and diced potatoes')).toBe(
      normalizeItemText('potatoes')
    );
  });

  it('drops connectives that name nothing', () => {
    expect(normalizeItemText('salt and pepper')).toBe(normalizeItemText('pepper salt'));
    expect(normalizeItemText('a pinch of salt')).toBe(normalizeItemText('pinch salt'));
  });

  describe('keeps genuinely different products apart', () => {
    it('variety words are not preparation', () => {
      expect(normalizeItemText('red onion')).not.toBe(normalizeItemText('onion'));
      expect(normalizeItemText('almond milk')).not.toBe(normalizeItemText('milk'));
    });

    it('ground beef is not beef', () => {
      expect(normalizeItemText('ground beef')).not.toBe(normalizeItemText('beef'));
    });

    it('dried herbs are not fresh herbs', () => {
      // 'fresh' is stripped and 'dried' is not, which is what keeps these apart.
      expect(normalizeItemText('dried basil')).not.toBe(normalizeItemText('fresh basil'));
    });

    it('canned and shredded name different products', () => {
      expect(normalizeItemText('canned tomatoes')).not.toBe(normalizeItemText('tomatoes'));
      expect(normalizeItemText('shredded cheese')).not.toBe(normalizeItemText('cheese'));
    });
  });

  describe('never returns empty for non-empty input', () => {
    it('falls back to the cleaned original when every token is noise', () => {
      // "2 cups" is entirely quantity + unit. Collapsing it to "" would make
      // every all-noise row collide on a single alias.
      expect(normalizeItemText('2 cups')).not.toBe('');
      expect(normalizeItemText('chopped')).not.toBe('');
      expect(normalizeItemText('1 lb')).not.toBe('');
    });

    it('distinct all-noise inputs stay distinct', () => {
      expect(normalizeItemText('2 cups')).not.toBe(normalizeItemText('1 lb'));
    });

    it('returns empty only for genuinely empty input', () => {
      expect(normalizeItemText('')).toBe('');
      expect(normalizeItemText('   ')).toBe('');
      expect(normalizeItemText('!!!')).toBe('');
    });
  });

  it('is idempotent — normalizing a normalized value changes nothing', () => {
    for (const s of ['2 lb boneless skinless chicken breasts', 'Beef, Ground', 'eggs', '2 cups']) {
      const once = normalizeItemText(s);
      expect(normalizeItemText(once)).toBe(once);
    }
  });

  it('is pure — same input, same output, no shared state', () => {
    const first = normalizeItemText('Chicken Breasts');
    normalizeItemText('something else entirely');
    expect(normalizeItemText('Chicken Breasts')).toBe(first);
  });

  it('tolerates null and undefined without throwing', () => {
    expect(normalizeItemText(undefined as unknown as string)).toBe('');
    expect(normalizeItemText(null as unknown as string)).toBe('');
  });
});

describe('singularize', () => {
  it('leaves short words and double-s endings alone', () => {
    expect(singularize('is')).toBe('is');
    expect(singularize('oat')).toBe('oat');
    expect(singularize('grass')).toBe('grass');
  });

  it('handles -ies, -oes and plain -s', () => {
    expect(singularize('berries')).toBe('berry');
    expect(singularize('tomatoes')).toBe('tomato');
    expect(singularize('eggs')).toBe('egg');
  });
});

describe('isNumericToken', () => {
  it('matches numbers, fractions, ratios, percentages and vulgar fractions', () => {
    for (const t of ['2', '1/2', '80/20', '2%', '1.5', '½']) {
      expect(isNumericToken(t)).toBe(true);
    }
  });

  it('does not match words', () => {
    for (const t of ['chicken', 'lb', 'a1']) {
      expect(isNumericToken(t)).toBe(false);
    }
  });
});

describe('the qualifier lists', () => {
  it('never treats a variety or product-defining word as preparation', () => {
    // Regression guard: adding any of these to PREP_QUALIFIERS would silently
    // merge two things a parent buys separately.
    for (const word of ['ground', 'shredded', 'grated', 'crushed', 'sliced', 'dried', 'canned', 'raw', 'cooked', 'red', 'almond', 'whole']) {
      expect(PREP_QUALIFIERS.has(word)).toBe(false);
    }
  });

  it('does not double-count a word as both unit noise and preparation', () => {
    const overlap = [...PREP_QUALIFIERS].filter((w) => UNIT_NOISE.has(w));
    expect(overlap).toEqual([]);
  });
});
