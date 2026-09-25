// Deno tests for verifyAppleJwsLegacy: app-store-notifications' verification,
// moved to _shared without changing what it accepts, plus the chainVerified
// flag that now decides whether a notification may create a row.
// Run with: deno test --allow-env --allow-net supabase/functions/_shared/appStoreJws.test.ts
// (--allow-net resolves the jose import; the tests reach no service.)
//
// No vitest mirror: this module imports jose from esm.sh. The pure parts it
// relies on are mirrored in src/lib/appStoreChainShared.test.ts.
import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { verifyAppleJwsLegacy } from './appStoreJws.ts';
import { APPLE_RECEIPT_SIGNING_LEAF_OID, APPLE_WWDR_INTERMEDIATE_OID } from './appStoreChain.ts';
import { appleShapedChain, issue, newIdentity, signJws, transactionPayload } from './appStoreChain.testkit.ts';

const chain = await appleShapedChain();
const x5c = [chain.leafB64, chain.interB64, chain.rootB64];

Deno.test('a genuine JWS passes, and with the root pinned the chain is reported verified', async () => {
  const jws = await signJws({ alg: 'ES256', x5c }, transactionPayload(), chain.leaf.keys.privateKey);
  const pinned = await verifyAppleJwsLegacy(jws, chain.rootB64);
  assertEquals([pinned.payload.productId, pinned.chainVerified], ['com.eatpal.app.pro.monthly', true]);
});

Deno.test('with no pin the legacy check still passes (as before) but never reports the chain verified', async () => {
  const jws = await signJws({ alg: 'ES256', x5c }, transactionPayload(), chain.leaf.keys.privateKey);
  const unpinned = await verifyAppleJwsLegacy(jws, undefined);
  assertEquals(unpinned.chainVerified, false);
});

Deno.test('the forged chain still passes the legacy check (unchanged behaviour) but is not chain-verified', async () => {
  const evilRoot = await newIdentity('Test Root CA - G3', 'P-384');
  const evilInter = await newIdentity('Test WWDR - G6', 'P-384');
  const evilLeaf = await newIdentity('Test StoreKit Signing', 'P-256');
  const jws = await signJws(
    {
      alg: 'ES256',
      x5c: [
        await issue(evilLeaf, evilInter, { ca: false, markerOid: APPLE_RECEIPT_SIGNING_LEAF_OID }),
        await issue(evilInter, evilRoot, { ca: true, markerOid: APPLE_WWDR_INTERMEDIATE_OID }),
        chain.rootB64,
      ],
    },
    transactionPayload(),
    evilLeaf.keys.privateKey,
  );
  const out = await verifyAppleJwsLegacy(jws, chain.rootB64);
  assertEquals(out.chainVerified, false);
});

Deno.test('a root that does not equal the pin is rejected, as before', async () => {
  const other = await appleShapedChain();
  const jws = await signJws({ alg: 'ES256', x5c: [other.leafB64, other.interB64, other.rootB64] }, transactionPayload(), other.leaf.keys.privateKey);
  await assertRejects(() => verifyAppleJwsLegacy(jws, chain.rootB64), Error, 'pinned Apple Root CA');
});

Deno.test('a missing x5c and a bad leaf signature are rejected, as before', async () => {
  const noX5c = await signJws({ alg: 'ES256' }, transactionPayload(), chain.leaf.keys.privateKey);
  await assertRejects(() => verifyAppleJwsLegacy(noX5c, chain.rootB64), Error, 'x5c');
  const stranger = await newIdentity('x', 'P-256');
  const badSig = await signJws({ alg: 'ES256', x5c }, transactionPayload(), stranger.keys.privateKey);
  await assertRejects(() => verifyAppleJwsLegacy(badSig, chain.rootB64));
});
