// Deno tests for the barcode-to-catalog promotion decision (US-797).
// Run with: deno test supabase/functions/_shared/catalogPromotion.test.ts
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  normalizeProductName,
  toCatalogRow,
  type BarcodeLookupResult,
} from './catalogPromotion.ts';

const BARCODE = '049000028911';

function offResult(overrides: Partial<BarcodeLookupResult> = {}): BarcodeLookupResult {
  return {
    source: 'openfoodfacts',
    name: 'Kraft Mac & Cheese',
    brand: 'Kraft',
    allergens: ['milk', 'wheat'],
    caloriesKcal100: 380,
    proteinG100: 10,
    carbsG100: 60,
    fatG100: 12,
    fiberG100: 2,
    sugarG100: 8,
    sodiumMg100: 500,
    ...overrides,
  };
}

// --- 1. a well-formed Open Food Facts result -------------------------------

Deno.test('a well-formed Open Food Facts result becomes a branded, unverified row', () => {
  const row = toCatalogRow(offResult(), BARCODE);
  assert(row !== null);
  assertEquals(row.kind, 'branded');
  assertEquals(row.verification, 'unverified');
  assertEquals(row.source, 'openfoodfacts');
  assertEquals(row.source_ref, BARCODE);
  assertEquals(row.barcode, BARCODE);
  assertEquals(row.name, 'Kraft Mac & Cheese');
  assertEquals(row.calories_kcal_100, 380);
  assertEquals(row.protein_g_100, 10);
});

// --- 2. normalizeProductName matches the iOS algorithm ----------------------
//
// ios/EatPal/EatPal/Models/SmartProduct.swift:
//   static func normalize(_ raw: String) -> String {
//       let lower = raw.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
//       let parts = lower.split(whereSeparator: { $0.isWhitespace })
//       return parts.joined(separator: " ")
//   }
//
// Transliterated directly here (not imported from the implementation) so
// this test asserts on behaviour, not shared source -- a change to
// normalizeProductName that silently drifts from the Swift algorithm should
// fail this test even though it never touches SmartProduct.swift.
function iosNormalize(raw: string): string {
  const lower = raw.toLowerCase().trim();
  const parts = lower.split(/\s+/).filter((part) => part.length > 0);
  return parts.join(' ');
}

Deno.test('normalizeProductName matches the iOS normalizer, punctuation preserved', () => {
  const input = '  Kraft   Mac & Cheese ';
  assertEquals(normalizeProductName(input), 'kraft mac & cheese');
  assertEquals(normalizeProductName(input), iosNormalize(input));
});

Deno.test('normalizeProductName preserves punctuation the iOS normalizer would not strip', () => {
  // Every instinct says a name normalizer should strip punctuation -- this
  // one must not, because the catalog's UNIQUE index is on name_normalized
  // and the shipped iOS app upserts against it.
  assertEquals(normalizeProductName("Annie's Mac & Cheese, Original"), "annie's mac & cheese, original");
  assertEquals(
    normalizeProductName("Annie's Mac & Cheese, Original"),
    iosNormalize("Annie's Mac & Cheese, Original")
  );
});

// --- 3. per-serving / kilojoule calories are dropped, not stored -----------

Deno.test('calories that are not confirmed kcal/100g never reach the row', () => {
  // This payload models the exact bug at lookup-barcode/index.ts:118:
  // nutriments.energy_value || nutriments['energy-kcal_100g']. A product that
  // declared its energy in kJ (or per-serving) puts a value like 2100 into
  // energy_value; caloriesKcal100 (the confirmed field) is absent. toCatalogRow
  // must never read energyValueUnconfirmedUnit as a calorie fallback.
  const row = toCatalogRow(
    offResult({
      caloriesKcal100: undefined,
      energyValueUnconfirmedUnit: 2100,
    }),
    BARCODE
  );

  assert(row !== null);
  // The value the CHECK constraint (gpc_nutrition_sane) would also reject if
  // it ever reached the database -- but that constraint is the second line
  // of defence, not the first. This function is the first: it must not even
  // attempt to write 2100.
  assertEquals(row.calories_kcal_100, null);
  // The row is still produced with the macros it does have.
  assertEquals(row.protein_g_100, 10);
  assertEquals(row.carbs_g_100, 60);
  assertEquals(row.fat_g_100, 12);
});

Deno.test('an in-range confirmed-kcal value is kept', () => {
  const row = toCatalogRow(offResult({ caloriesKcal100: 500 }), BARCODE);
  assert(row !== null);
  assertEquals(row.calories_kcal_100, 500);
});

// --- 4. a macro above 100g/100g is dropped, not the whole row --------------

Deno.test('a macro above 100 g per 100 g is dropped, row still produced', () => {
  const row = toCatalogRow(offResult({ fatG100: 140 }), BARCODE);
  assert(row !== null);
  assertEquals(row.fat_g_100, null);
  // Everything else survives.
  assertEquals(row.protein_g_100, 10);
  assertEquals(row.carbs_g_100, 60);
  assertEquals(row.calories_kcal_100, 380);
});

Deno.test('sodium above 100000 mg per 100 g is dropped', () => {
  const row = toCatalogRow(offResult({ sodiumMg100: 200000 }), BARCODE);
  assert(row !== null);
  assertEquals(row.sodium_mg_100, null);
});

Deno.test('a negative macro is dropped, not clamped to zero', () => {
  const row = toCatalogRow(offResult({ proteinG100: -5 }), BARCODE);
  assert(row !== null);
  assertEquals(row.protein_g_100, null);
});

// --- 5. no name means no row -------------------------------------------------

Deno.test('a result with no name returns null', () => {
  assertEquals(toCatalogRow(offResult({ name: undefined }), BARCODE), null);
  assertEquals(toCatalogRow(offResult({ name: null }), BARCODE), null);
  assertEquals(toCatalogRow(offResult({ name: '   ' }), BARCODE), null);
});

Deno.test('a result with no usable nutrition returns null even with a name', () => {
  const row = toCatalogRow(
    offResult({
      caloriesKcal100: null,
      proteinG100: null,
      carbsG100: null,
      fatG100: null,
      fiberG100: null,
      sugarG100: null,
      sodiumMg100: null,
    }),
    BARCODE
  );
  assertEquals(row, null);
});

Deno.test('an empty barcode returns null', () => {
  assertEquals(toCatalogRow(offResult(), '   '), null);
});

// --- 6. source_ref / source reflect which provider answered -----------------

Deno.test('a usda result carries source "usda", not "openfoodfacts"', () => {
  const row = toCatalogRow(
    offResult({ source: 'usda', name: 'Generic Cheddar Cheese' }),
    BARCODE
  );
  assert(row !== null);
  assertEquals(row.source, 'usda');
  assertEquals(row.source_ref, BARCODE);
});

Deno.test('a foodrepo result carries source "foodrepo", not "openfoodfacts"', () => {
  const row = toCatalogRow(
    offResult({ source: 'foodrepo', name: 'Emmentaler AOP' }),
    BARCODE
  );
  assert(row !== null);
  assertEquals(row.source, 'foodrepo');
  assertEquals(row.source_ref, BARCODE);
});

// --- 7. verification is always 'unverified' ---------------------------------
//
// This is the assertion that must survive future edits: nothing toCatalogRow
// produces may set verification to anything but 'unverified'. Only an admin
// may promote a row to 'verified' -- enforced for real by the
// gpc_guard_verification trigger -- but this function must never even try,
// regardless of how trustworthy the source looks.

Deno.test('verification is unverified for every provider, never derived from source', () => {
  const sources: Array<BarcodeLookupResult['source']> = ['openfoodfacts', 'usda', 'foodrepo'];
  for (const source of sources) {
    const row = toCatalogRow(offResult({ source }), BARCODE);
    assert(row !== null);
    assertEquals(
      row.verification,
      'unverified',
      `a ${source} result must not set verification to anything but 'unverified'`
    );
  }
});

Deno.test('verification stays unverified even for a fully well-formed, high-confidence payload', () => {
  // If someone later "helpfully" adds a shortcut that promotes a trusted
  // provider straight to verified, this is the test that should catch it.
  const row = toCatalogRow(offResult(), BARCODE);
  assert(row !== null);
  assertEquals(row.verification, 'unverified');
  assert(!('verified_at' in row));
  assert(!('verified_by' in row));
});
