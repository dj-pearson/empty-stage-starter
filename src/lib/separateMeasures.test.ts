import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { conflictingUnitFamilies, separateMeasureNotes } from './groceryMerge';

/**
 * US-820: the list says when two rows are two measures, not one mistake.
 *
 * planGroceryMerge keeps "2 lb flour" and "3 cups flour" apart on purpose --
 * adding a mass to a volume needs the ingredient's density, and the old code
 * guessed, turning 2 lb + 3 cups into 5 lb. But nothing said so on screen, and
 * two rows reading Flour invite exactly one reaction: delete one. That drops a
 * requirement a recipe actually has.
 */

const row = (id: string, name: string, quantity: number, unit?: string) => ({
  id,
  name,
  quantity,
  unit,
});

describe('two measures of the same ingredient', () => {
  it('tells each row about the other', () => {
    const notes = separateMeasureNotes([
      row('a', 'Flour', 2, 'lb'),
      row('b', 'Flour', 3, 'cups'),
    ]);

    expect(notes.get('a')).toEqual(['3 cups']);
    expect(notes.get('b')).toEqual(['2 lb']);
  });

  it('matches the ingredient the way the merge does, not by exact name', () => {
    // ingredientMatchKey strips quantities, units and punctuation and sorts the
    // rest, which is what decided these were worth keeping apart at all.
    const notes = separateMeasureNotes([
      row('a', 'Plain Flour', 500, 'g'),
      row('b', 'flour, plain', 2, 'cups'),
    ]);

    expect(notes.get('a')).toEqual(['2 cups']);
    expect(notes.get('b')).toEqual(['500 g']);
  });

  it('handles three families at once', () => {
    const notes = separateMeasureNotes([
      row('a', 'Milk', 1, 'l'),
      row('b', 'Milk', 2, 'lb'),
      row('c', 'Milk', 3, 'cups'),
    ]);

    // c is a volume like a, so a hears only about b and c hears only about b.
    expect(notes.get('a')).toEqual(['2 lb']);
    expect(notes.get('c')).toEqual(['2 lb']);
    expect(notes.get('b')?.sort()).toEqual(['1 l', '3 cups'].sort());
  });
});

describe('what is NOT a second measure', () => {
  it('says nothing about a lone row', () => {
    expect(separateMeasureNotes([row('a', 'Flour', 2, 'lb')]).size).toBe(0);
  });

  it('says nothing about two rows in the same family', () => {
    // These are a real duplicate: the merge would have combined them, so two of
    // them existing means a person made them that way. Calling that deliberate
    // would be a lie, and the shopper SHOULD tidy it.
    const notes = separateMeasureNotes([
      row('a', 'Flour', 500, 'g'),
      row('b', 'Flour', 2, 'kg'),
    ]);

    expect(notes.size).toBe(0);
  });

  it('says nothing about different ingredients', () => {
    const notes = separateMeasureNotes([
      row('a', 'Flour', 2, 'lb'),
      row('b', 'Sugar', 3, 'cups'),
    ]);

    expect(notes.size).toBe(0);
  });

  it('leaves an unrecognised unit out of it, in both directions', () => {
    // A bare "2" beside "1 lb" is sloppy entry, not a second measurement:
    // splitByUnitFamily folds it into the first real bucket rather than giving
    // it a row, so there is nothing to explain.
    const notes = separateMeasureNotes([row('a', 'Eggs', 12), row('b', 'Eggs', 1, 'kg')]);

    expect(notes.size).toBe(0);
  });

  it('does report a package beside a weight, because those ARE two rows', () => {
    // "bag" is recognised, as family `package`, so conflictingUnitFamilies is
    // true and the merge keeps them apart. The story's own note filed bag with
    // the bare counts; the code disagrees, and the code is what the shopper
    // sees.
    const notes = separateMeasureNotes([
      row('a', 'Flour', 2, 'lb'),
      row('b', 'Flour', 1, 'bag'),
    ]);

    expect(notes.get('a')).toEqual(['1 bag']);
    expect(notes.get('b')).toEqual(['2 lb']);
  });

  it('ignores a row whose name reduces to nothing', () => {
    const notes = separateMeasureNotes([row('a', '  ', 2, 'lb'), row('b', '', 3, 'cups')]);

    expect(notes.size).toBe(0);
  });
});

describe('how a measure reads', () => {
  it('drops trailing zeros', () => {
    const notes = separateMeasureNotes([
      row('a', 'Flour', 1.5, 'lb'),
      row('b', 'Flour', 2.0, 'cups'),
    ]);

    expect(notes.get('a')).toEqual(['2 cups']);
    expect(notes.get('b')).toEqual(['1.5 lb']);
  });

  it('survives a row with no quantity', () => {
    const notes = separateMeasureNotes([
      { id: 'a', name: 'Flour', unit: 'lb' },
      row('b', 'Flour', 3, 'cups'),
    ]);

    expect(notes.get('b')).toEqual(['0 lb']);
  });

  it('agrees with the merge about which pairs had to stay apart', () => {
    // The guarantee worth stating: a row gets a note exactly when
    // conflictingUnitFamilies says those two could not be summed. If these ever
    // drift, the list starts explaining rows that are really duplicates, or
    // stays silent on the ones it has to explain.
    const pairs: Array<[string | undefined, string | undefined]> = [
      ['lb', 'cups'],
      ['g', 'l'],
      ['lb', 'bag'],
      ['lb', 'g'],
      ['cups', 'l'],
      [undefined, 'kg'],
      ['each', 'kg'],
    ];

    for (const [unitA, unitB] of pairs) {
      const notes = separateMeasureNotes([
        { id: 'a', name: 'Flour', quantity: 1, unit: unitA },
        { id: 'b', name: 'Flour', quantity: 1, unit: unitB },
      ]);
      const conflicts = conflictingUnitFamilies([
        { quantity: 1, unit: unitA },
        { quantity: 1, unit: unitB },
      ]);
      expect(notes.has('a'), `${unitA} vs ${unitB}`).toBe(conflicts);
    }
  });
});

describe('both grocery row renderers show it', () => {
  // Grocery.tsx renders rows two ways and switches on list size. A note added
  // to only one of them is invisible to whichever shopper is on the other side
  // of that threshold, which is not something they can tell from looking.
  const page = readFileSync(
    path.join(process.cwd(), 'src', 'pages', 'Grocery.tsx'),
    'utf8'
  );

  it('computes the notes once, over the active rows', () => {
    // Active only: a purchased row is not one the shopper is about to delete by
    // mistake.
    expect(page).toContain('separateMeasureNotes(activeItems)');
  });

  it('renders the note in both row renderers', () => {
    // Both paths now go through one renderRow, which passes the note to
    // GroceryRow; the note is computed per row id in rowMeta.
    expect(page).toContain('measureNotes.get(item.id)');
    expect(page).toContain('measureNote={meta?.measureNote}');
    expect(page, 'the virtualised rows').toContain('renderRow(row.item)');
    expect(page, 'the plain rows').toContain('renderRow(item)');
  });
});
