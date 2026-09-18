import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
  foodRepoProduct,
  isJsonObject,
  openFoodFactsProduct,
  readJsonBody,
  usableName,
  usdaFirstFood,
} from './barcodeProviderShape.ts';

/**
 * US-805: a provider answering 200 with something we do not understand has not
 * found the product.
 *
 * All three providers answer 200 for things that are not a product, and all
 * three used to fall back to a food named "Unknown Product". A parent scanning
 * a jar mid-shop got that: a nameless row with no nutrition, which reads as a
 * successful scan, instead of the add-it-yourself path they needed.
 *
 * Run with:
 *   deno test supabase/functions/_shared/barcodeProviderShape.test.ts
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.test('isJsonObject accepts an object and nothing else', () => {
  assert(isJsonObject({}));
  assert(isJsonObject({ a: 1 }));
  assertEquals(isJsonObject(null), false);
  assertEquals(isJsonObject([]), false);
  assertEquals(isJsonObject('a string'), false);
  assertEquals(isJsonObject(42), false);
  assertEquals(isJsonObject(undefined), false);
});

Deno.test('usableName rejects whitespace, which the old fallback did not', () => {
  assertEquals(usableName('Marmite'), 'Marmite');
  assertEquals(usableName('  Marmite  '), 'Marmite');
  assertEquals(usableName(''), null);
  // `" " || "Unknown Product"` keeps the space, so a padded field used to
  // become a food whose name was a blank.
  assertEquals(usableName('   '), null);
  assertEquals(usableName(null), null);
  assertEquals(usableName(undefined), null);
  assertEquals(usableName(42), null);
  assertEquals(usableName({ name: 'x' }), null);
});

Deno.test('Open Food Facts: status 0 is a miss', () => {
  assertEquals(openFoodFactsProduct({ status: 0, status_verbose: 'product not found' }), null);
});

Deno.test('Open Food Facts: a hit returns the product', () => {
  const product = openFoodFactsProduct({ status: 1, product: { product_name: 'Marmite' } });
  assertEquals(product?.product_name, 'Marmite');
});

Deno.test('Open Food Facts: status 1 with no product object is a miss', () => {
  assertEquals(openFoodFactsProduct({ status: 1 }), null);
  assertEquals(openFoodFactsProduct({ status: 1, product: null }), null);
  assertEquals(openFoodFactsProduct({ status: 1, product: 'Marmite' }), null);
});

Deno.test('Open Food Facts: a string status still counts as a hit', () => {
  // OFF has shipped status as a string; failing a real hit on a type would be
  // the wrong kind of strictness.
  assertEquals(openFoodFactsProduct({ status: '1', product: { product_name: 'x' } })?.product_name, 'x');
});

Deno.test('Open Food Facts: a body that is not an object is a miss', () => {
  assertEquals(openFoodFactsProduct(null), null);
  assertEquals(openFoodFactsProduct([]), null);
  assertEquals(openFoodFactsProduct('<html>502</html>'), null);
});

Deno.test('USDA: an error body carried by a 200 is a miss', () => {
  assertEquals(usdaFirstFood({ error: { code: 'API_KEY_INVALID', message: 'bad key' } }), null);
});

Deno.test('USDA: an empty or non-array foods field is a miss', () => {
  assertEquals(usdaFirstFood({ foods: [] }), null);
  assertEquals(usdaFirstFood({ foods: null }), null);
  assertEquals(usdaFirstFood({ foods: { description: 'Marmite' } }), null);
  assertEquals(usdaFirstFood({}), null);
});

Deno.test('USDA: the first food is returned when there is one', () => {
  assertEquals(usdaFirstFood({ foods: [{ description: 'Marmite' }] })?.description, 'Marmite');
});

Deno.test('USDA: a non-object inside foods is a miss', () => {
  assertEquals(usdaFirstFood({ foods: ['Marmite'] }), null);
  assertEquals(usdaFirstFood({ foods: [null] }), null);
});

Deno.test('FoodRepo: a 200 carrying an error body is a miss', () => {
  // This is the case that produced "Unknown Product": response.ok was true and
  // the body was read straight through.
  assertEquals(foodRepoProduct({ error: 'not found' }), null);
  assertEquals(foodRepoProduct({ errors: [{ detail: 'not found' }] }), null);
});

Deno.test('FoodRepo: an empty object has no name, so the caller drops it', () => {
  // The shape guard passes an empty object -- it IS the product envelope --
  // and the name check is what refuses it. Both halves are needed.
  assert(foodRepoProduct({}) !== null);
  assertEquals(usableName((foodRepoProduct({}) ?? {}).display_name), null);
});

Deno.test('FoodRepo: a product with a name survives', () => {
  const product = foodRepoProduct({ display_name: 'Marmite', nutrients: { proteins: 39 } });
  assertEquals(usableName(product?.display_name), 'Marmite');
});

Deno.test('readJsonBody: a non-200 is a miss without parsing', async () => {
  assertEquals(await readJsonBody(json({ product: {} }, 500)), null);
  assertEquals(await readJsonBody(json({ product: {} }, 404)), null);
});

Deno.test('readJsonBody: a 200 that is not JSON is a miss, not a throw', async () => {
  // A provider answering an HTML error page with a 200 used to throw out of
  // the try block. It is a miss; the chain should move on either way, but a
  // miss is what it actually is.
  const html = new Response('<html><body>502 Bad Gateway</body></html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
  assertEquals(await readJsonBody(html), null);
});

Deno.test('readJsonBody: a 200 with JSON returns it', async () => {
  assertEquals(await readJsonBody(json({ status: 1 })), { status: 1 });
});

Deno.test('the three 200-shaped failures the story names all degrade to null', async () => {
  // AC4, end to end through the guards: an error body, an empty object, and a
  // product missing its name.
  const errorBody = await readJsonBody(json({ error: 'nope' }));
  assertEquals(foodRepoProduct(errorBody), null);
  assertEquals(usdaFirstFood(errorBody), null);
  assertEquals(openFoodFactsProduct(errorBody), null);

  const empty = await readJsonBody(json({}));
  assertEquals(openFoodFactsProduct(empty), null);
  assertEquals(usdaFirstFood(empty), null);
  assertEquals(usableName((foodRepoProduct(empty) ?? {}).display_name), null);

  const nameless = await readJsonBody(json({ status: 1, product: { brands: 'Acme' } }));
  const product = openFoodFactsProduct(nameless);
  assert(product !== null, 'the envelope is valid; the name is what is missing');
  assertEquals(usableName(product?.product_name), null);
});
