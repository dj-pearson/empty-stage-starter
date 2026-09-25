// Deno tests for the full Apple JWS chain verification used by
// verify-app-store-transaction (and by app-store-notifications to decide
// whether a notification may create a row).
// Run with: deno test supabase/functions/_shared/appStoreChain.test.ts
// Vitest mirror: src/lib/appStoreChainShared.test.ts
//
// Every chain is generated at run time by appStoreChain.testkit.ts; nothing
// signed is committed.
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { AppleJwsError, certsValidAt, verifyAppleCertChain, verifyAppleJwsStrict } from './appStoreChain.ts';
import {
  APPLE_RECEIPT_SIGNING_LEAF_OID,
  APPLE_WWDR_INTERMEDIATE_OID,
} from './appStoreChain.ts';
import {
  APPLE_PROD_SIGNING_LEAF_PUBLIC,
  APPLE_ROOT_CA_G3_PUBLIC,
  APPLE_WWDR_G6_PUBLIC,
  appleShapedChain,
  issue,
  newIdentity,
  signJws,
  transactionPayload,
} from './appStoreChain.testkit.ts';

const chain = await appleShapedChain();
const x5c = [chain.leafB64, chain.interB64, chain.rootB64];

Deno.test('a genuine chain and signature verify and return the payload', async () => {
  const jws = await signJws({ alg: 'ES256', x5c }, transactionPayload(), chain.leaf.keys.privateKey);
  const payload = await verifyAppleJwsStrict(jws, chain.rootB64);
  assertEquals(payload.productId, 'com.eatpal.app.pro.monthly');
  assertEquals(payload.originalTransactionId, '2000000900000001');
});

Deno.test('the pinned root may carry line breaks and still match', async () => {
  const jws = await signJws({ alg: 'ES256', x5c }, transactionPayload(), chain.leaf.keys.privateKey);
  const wrapped = chain.rootB64.match(/.{1,64}/g)!.join('\n');
  assertEquals((await verifyAppleJwsStrict(jws, wrapped)).bundleId, 'com.eatpal.app');
});

Deno.test('the forgery the old check accepted is refused: own leaf and intermediate, real root appended', async () => {
  const evilRoot = await newIdentity('Test Root CA - G3', 'P-384');
  const evilInter = await newIdentity('Test WWDR - G6', 'P-384');
  const evilLeaf = await newIdentity('Test StoreKit Signing', 'P-256');
  const evilInterB64 = await issue(evilInter, evilRoot, { ca: true, markerOid: APPLE_WWDR_INTERMEDIATE_OID });
  const evilLeafB64 = await issue(evilLeaf, evilInter, { ca: false, markerOid: APPLE_RECEIPT_SIGNING_LEAF_OID });
  const jws = await signJws(
    { alg: 'ES256', x5c: [evilLeafB64, evilInterB64, chain.rootB64] },
    transactionPayload({ productId: 'com.eatpal.app.professional.yearly', expiresDate: Date.UTC(2036, 0, 1) }),
    evilLeaf.keys.privateKey,
  );
  await assertRejects(() => verifyAppleJwsStrict(jws, chain.rootB64), AppleJwsError, 'intermediate');
});

Deno.test('a leaf the presented intermediate did not issue is refused, even with matching names', async () => {
  const evilInter = await newIdentity('Test WWDR - G6', 'P-384');
  const evilLeaf = await newIdentity('Test StoreKit Signing', 'P-256');
  const evilLeafB64 = await issue(evilLeaf, evilInter, { ca: false, markerOid: APPLE_RECEIPT_SIGNING_LEAF_OID });
  const jws = await signJws({ alg: 'ES256', x5c: [evilLeafB64, chain.interB64, chain.rootB64] }, transactionPayload(), evilLeaf.keys.privateKey);
  await assertRejects(() => verifyAppleJwsStrict(jws, chain.rootB64), AppleJwsError, 'leaf: signature');
});

Deno.test('a chain rooted somewhere other than the pin is refused', async () => {
  const other = await appleShapedChain();
  const jws = await signJws({ alg: 'ES256', x5c: [other.leafB64, other.interB64, other.rootB64] }, transactionPayload(), other.leaf.keys.privateKey);
  await assertRejects(() => verifyAppleJwsStrict(jws, chain.rootB64), AppleJwsError, 'pinned');
});

Deno.test('no pinned root configured is a refusal, not a downgrade', async () => {
  const jws = await signJws({ alg: 'ES256', x5c }, transactionPayload(), chain.leaf.keys.privateKey);
  for (const pin of [undefined, null, '', '   ']) {
    await assertRejects(() => verifyAppleJwsStrict(jws, pin), AppleJwsError, 'pinned');
  }
});

Deno.test('a tampered payload fails the signature', async () => {
  const jws = await signJws({ alg: 'ES256', x5c }, transactionPayload(), chain.leaf.keys.privateKey);
  const [h, , s] = jws.split('.');
  const forged = btoa(JSON.stringify(transactionPayload({ productId: 'com.eatpal.app.professional.yearly' })))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await assertRejects(() => verifyAppleJwsStrict(`${h}.${forged}.${s}`, chain.rootB64), AppleJwsError, 'signature');
});

Deno.test('a JWS signed by a key other than the leaf is refused', async () => {
  const stranger = await newIdentity('x', 'P-256');
  const jws = await signJws({ alg: 'ES256', x5c }, transactionPayload(), stranger.keys.privateKey);
  await assertRejects(() => verifyAppleJwsStrict(jws, chain.rootB64), AppleJwsError, 'signature');
});

Deno.test('a leaf without the App Store signing OID is refused', async () => {
  const bare = await issue(chain.leaf, chain.inter, { ca: false, markerOid: null });
  const jws = await signJws({ alg: 'ES256', x5c: [bare, chain.interB64, chain.rootB64] }, transactionPayload(), chain.leaf.keys.privateKey);
  await assertRejects(() => verifyAppleJwsStrict(jws, chain.rootB64), AppleJwsError, 'leaf lacks');
});

Deno.test('an intermediate without the WWDR OID is refused', async () => {
  const bareInter = await issue(chain.inter, chain.root, { ca: true, markerOid: null });
  const jws = await signJws({ alg: 'ES256', x5c: [chain.leafB64, bareInter, chain.rootB64] }, transactionPayload(), chain.leaf.keys.privateKey);
  await assertRejects(() => verifyAppleJwsStrict(jws, chain.rootB64), AppleJwsError, 'intermediate lacks');
});

Deno.test('an intermediate that is not a CA is refused', async () => {
  const notCa = await issue(chain.inter, chain.root, { ca: false, markerOid: APPLE_WWDR_INTERMEDIATE_OID });
  const jws = await signJws({ alg: 'ES256', x5c: [chain.leafB64, notCa, chain.rootB64] }, transactionPayload(), chain.leaf.keys.privateKey);
  await assertRejects(() => verifyAppleJwsStrict(jws, chain.rootB64), AppleJwsError, 'CA');
});

Deno.test('two certificates, or four, are refused', async () => {
  for (const certs of [[chain.leafB64, chain.rootB64], [chain.leafB64, chain.interB64, chain.interB64, chain.rootB64]]) {
    const jws = await signJws({ alg: 'ES256', x5c: certs }, transactionPayload(), chain.leaf.keys.privateKey);
    await assertRejects(() => verifyAppleJwsStrict(jws, chain.rootB64), AppleJwsError, 'three');
  }
});

Deno.test('alg other than ES256 is refused before anything else', async () => {
  const jws = await signJws({ alg: 'none', x5c }, transactionPayload(), chain.leaf.keys.privateKey);
  await assertRejects(() => verifyAppleJwsStrict(jws, chain.rootB64), AppleJwsError, 'ES256');
});

Deno.test('certificates are judged at signedDate, and a missing signedDate is refused', async () => {
  const early = await signJws({ alg: 'ES256', x5c }, transactionPayload({ signedDate: Date.UTC(2020, 0, 1) }), chain.leaf.keys.privateKey);
  await assertRejects(() => verifyAppleJwsStrict(early, chain.rootB64), AppleJwsError, 'not valid at signedDate');
  const none = await signJws({ alg: 'ES256', x5c }, transactionPayload({ signedDate: undefined }), chain.leaf.keys.privateKey);
  await assertRejects(() => verifyAppleJwsStrict(none, chain.rootB64), AppleJwsError, 'signedDate');
});

Deno.test('garbage is an AppleJwsError, never a crash of another kind', async () => {
  for (const bad of ['', 'a.b', 'a.b.c', '...', 'x'.repeat(40)]) {
    const err = await verifyAppleJwsStrict(bad, chain.rootB64).then(() => null, (e: unknown) => e);
    assert(err instanceof AppleJwsError, `${bad}: ${err}`);
  }
});

Deno.test("Apple's real production chain verifies under the real root pin", async () => {
  const certs = await verifyAppleCertChain(
    [APPLE_PROD_SIGNING_LEAF_PUBLIC, APPLE_WWDR_G6_PUBLIC, APPLE_ROOT_CA_G3_PUBLIC],
    APPLE_ROOT_CA_G3_PUBLIC,
  );
  assertEquals(certs.leaf.curve.name, 'P-256');
  certsValidAt(certs, Date.UTC(2026, 8, 25));
  let threw = false;
  try {
    certsValidAt(certs, Date.UTC(2028, 0, 1));
  } catch (e) {
    threw = e instanceof AppleJwsError;
  }
  assert(threw, 'the 2025 leaf is not valid in 2028');
});

Deno.test("Apple's real intermediate and leaf do not verify under a different pin", async () => {
  await assertRejects(
    () => verifyAppleCertChain([APPLE_PROD_SIGNING_LEAF_PUBLIC, APPLE_WWDR_G6_PUBLIC, chain.rootB64], chain.rootB64),
    AppleJwsError,
    'intermediate',
  );
});
