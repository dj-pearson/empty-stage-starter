/**
 * Test-only: builds throwaway certificate chains shaped like Apple's
 * (P-384 root -> P-384 intermediate with the WWDR marker OID -> P-256 leaf
 * with the App Store signing OID) and signs JWS with them, all at run time
 * with WebCrypto. Nothing is committed: no certificate, no key, no token.
 *
 * Used by appStoreChain.test.ts (Deno) and src/lib/appStoreChainShared.test.ts
 * (vitest). Never imported by a function.
 */

import { APPLE_RECEIPT_SIGNING_LEAF_OID, APPLE_WWDR_INTERMEDIATE_OID } from './appStoreChain.ts';

// --- DER encoder (the subset a certificate needs) ------------------------------

function len(n: number): number[] {
  if (n < 0x80) return [n];
  const out: number[] = [];
  while (n > 0) {
    out.unshift(n & 0xff);
    n = Math.floor(n / 256);
  }
  return [0x80 | out.length, ...out];
}

function tlv(tag: number, ...parts: Uint8Array[]): Uint8Array {
  const body = concat(...parts);
  return concat(new Uint8Array([tag, ...len(body.length)]), body);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const seq = (...p: Uint8Array[]) => tlv(0x30, ...p);
const set = (...p: Uint8Array[]) => tlv(0x31, ...p);
const octets = (b: Uint8Array) => tlv(0x04, b);
const bool = (v: boolean) => tlv(0x01, new Uint8Array([v ? 0xff : 0]));
const utf8 = (s: string) => tlv(0x0c, new TextEncoder().encode(s));
const explicit = (n: number, inner: Uint8Array) => tlv(0xa0 + n, inner);

function int(bytes: Uint8Array): Uint8Array {
  let b = bytes;
  while (b.length > 1 && b[0] === 0 && !(b[1] & 0x80)) b = b.subarray(1);
  if (b[0] & 0x80) b = concat(new Uint8Array([0]), b);
  return tlv(0x02, b);
}

function oid(dotted: string): Uint8Array {
  const [a, b, ...rest] = dotted.split('.').map(Number);
  const out = [a * 40 + b];
  for (const n of rest) {
    const groups: number[] = [];
    let v = n;
    do {
      groups.unshift(v & 0x7f);
      v = Math.floor(v / 128);
    } while (v > 0);
    for (let i = 0; i < groups.length - 1; i++) groups[i] |= 0x80;
    out.push(...groups);
  }
  return tlv(0x06, new Uint8Array(out));
}

function utcTime(ms: number): Uint8Array {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  const s = `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  return tlv(0x17, new TextEncoder().encode(s));
}

const name = (cn: string) => seq(set(seq(oid('2.5.4.3'), utf8(cn))));

function ab(u: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(u.length);
  new Uint8Array(out).set(u);
  return out;
}

/** WebCrypto's raw r || s -> DER SEQUENCE { r, s }. */
function rawToDer(raw: Uint8Array): Uint8Array {
  const half = raw.length / 2;
  return seq(int(raw.subarray(0, half)), int(raw.subarray(half)));
}

export function bytesToBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

export function bytesToBase64Url(b: Uint8Array): string {
  return bytesToBase64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// --- certificates --------------------------------------------------------------

export interface TestIdentity {
  cn: string;
  keys: CryptoKeyPair;
  curve: 'P-256' | 'P-384';
}

export async function newIdentity(cn: string, curve: 'P-256' | 'P-384'): Promise<TestIdentity> {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: curve }, true, ['sign', 'verify']) as CryptoKeyPair;
  return { cn, keys, curve };
}

export const NOT_BEFORE = Date.UTC(2026, 0, 1);
export const NOT_AFTER = Date.UTC(2040, 0, 1);

let serial = 1;

/** Issue a certificate for `subject`, signed by `issuer` with ecdsa-with-SHA384. */
export async function issue(
  subject: TestIdentity,
  issuer: TestIdentity,
  opts: { ca: boolean; markerOid?: string | null; notBefore?: number; notAfter?: number },
): Promise<string> {
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', subject.keys.publicKey));
  const alg = seq(oid('1.2.840.10045.4.3.3'));
  const exts: Uint8Array[] = [
    seq(oid('2.5.29.19'), bool(true), octets(opts.ca ? seq(bool(true)) : seq())),
  ];
  if (opts.markerOid) exts.push(seq(oid(opts.markerOid), octets(new Uint8Array([0x05, 0x00]))));
  const tbs = seq(
    explicit(0, int(new Uint8Array([2]))),
    int(new Uint8Array([0x10, serial++])),
    alg,
    name(issuer.cn),
    seq(utcTime(opts.notBefore ?? NOT_BEFORE), utcTime(opts.notAfter ?? NOT_AFTER)),
    name(subject.cn),
    spki,
    explicit(3, seq(...exts)),
  );
  const raw = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-384' }, issuer.keys.privateKey, ab(tbs)),
  );
  const bitString = tlv(0x03, new Uint8Array([0]), rawToDer(raw));
  return bytesToBase64(seq(tbs, alg, bitString));
}

export interface TestChain {
  root: TestIdentity;
  inter: TestIdentity;
  leaf: TestIdentity;
  rootB64: string;
  interB64: string;
  leafB64: string;
}

/** A chain with Apple's shape. The CNs deliberately match between chains. */
export async function appleShapedChain(): Promise<TestChain> {
  const root = await newIdentity('Test Root CA - G3', 'P-384');
  const inter = await newIdentity('Test WWDR - G6', 'P-384');
  const leaf = await newIdentity('Test StoreKit Signing', 'P-256');
  return {
    root,
    inter,
    leaf,
    rootB64: await issue(root, root, { ca: true }),
    interB64: await issue(inter, root, { ca: true, markerOid: APPLE_WWDR_INTERMEDIATE_OID }),
    leafB64: await issue(leaf, inter, { ca: false, markerOid: APPLE_RECEIPT_SIGNING_LEAF_OID }),
  };
}

/** Compact JWS, ES256 unless the header says otherwise; signed with `key` (P-256). */
export async function signJws(header: Record<string, unknown>, payload: Record<string, unknown>, key: CryptoKey): Promise<string> {
  const enc = new TextEncoder();
  const h = bytesToBase64Url(enc.encode(JSON.stringify(header)));
  const p = bytesToBase64Url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, ab(enc.encode(`${h}.${p}`))),
  );
  return `${h}.${p}.${bytesToBase64Url(sig)}`;
}

export const SIGNED_DATE = Date.UTC(2026, 9, 1);

/** A StoreKit 2 JWSTransactionDecodedPayload for a monthly Pro renewal. */
export function transactionPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    transactionId: '2000000900000002',
    originalTransactionId: '2000000900000001',
    bundleId: 'com.eatpal.app',
    productId: 'com.eatpal.app.pro.monthly',
    purchaseDate: SIGNED_DATE,
    originalPurchaseDate: SIGNED_DATE - 30 * 86_400_000,
    expiresDate: SIGNED_DATE + 30 * 86_400_000,
    type: 'Auto-Renewable Subscription',
    inAppOwnershipType: 'PURCHASED',
    environment: 'Sandbox',
    appAccountToken: '11111111-2222-4333-8444-555555555555',
    signedDate: SIGNED_DATE,
    ...overrides,
  };
}

// --- Apple's real, public production chain ---------------------------------------
//
// Public certificates, not secrets: Apple Root CA - G3 and the WWDR G6
// intermediate are published at https://www.apple.com/certificateauthority/,
// and this leaf ("Prod ECC Mac App Store and iTunes Store Receipt Signing",
// valid 2025-09-19 to 2027-10-13) is the one Apple's own
// app-store-server-library tests with. They prove the parser reads the chain
// Apple actually ships, not only the chains the testkit builds.

export const APPLE_ROOT_CA_G3_PUBLIC =
  'MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==';
export const APPLE_WWDR_G6_PUBLIC =
  'MIIDFjCCApygAwIBAgIUIsGhRwp0c2nvU4YSycafPTjzbNcwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMjEwMzE3MjAzNzEwWhcNMzYwMzE5MDAwMDAwWjB1MUQwQgYDVQQDDDtBcHBsZSBXb3JsZHdpZGUgRGV2ZWxvcGVyIFJlbGF0aW9ucyBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTELMAkGA1UECwwCRzYxEzARBgNVBAoMCkFwcGxlIEluYy4xCzAJBgNVBAYTAlVTMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAEbsQKC94PrlWmZXnXgtxzdVJL8T0SGYngDRGpngn3N6PT8JMEb7FDi4bBmPhCnZ3/sq6PF/cGcKXWsL5vOteRhyJ45x3ASP7cOB+aao90fcpxSv/EZFbniAbNgZGhIhpIo4H6MIH3MBIGA1UdEwEB/wQIMAYBAf8CAQAwHwYDVR0jBBgwFoAUu7DeoVgziJqkipnevr3rr9rLJKswRgYIKwYBBQUHAQEEOjA4MDYGCCsGAQUFBzABhipodHRwOi8vb2NzcC5hcHBsZS5jb20vb2NzcDAzLWFwcGxlcm9vdGNhZzMwNwYDVR0fBDAwLjAsoCqgKIYmaHR0cDovL2NybC5hcHBsZS5jb20vYXBwbGVyb290Y2FnMy5jcmwwHQYDVR0OBBYEFD8vlCNR01DJmig97bB85c+lkGKZMA4GA1UdDwEB/wQEAwIBBjAQBgoqhkiG92NkBgIBBAIFADAKBggqhkjOPQQDAwNoADBlAjBAXhSq5IyKogMCPtw490BaB677CaEGJXufQB/EqZGd6CSjiCtOnuMTbXVXmxxcxfkCMQDTSPxarZXvNrkxU3TkUMI33yzvFVVRT4wxWJC994OsdcZ4+RGNsYDyR5gmdr0nDGg=';
export const APPLE_PROD_SIGNING_LEAF_PUBLIC =
  'MIIEMTCCA7agAwIBAgIQR8KHzdn554Z/UoradNx9tzAKBggqhkjOPQQDAzB1MUQwQgYDVQQDDDtBcHBsZSBXb3JsZHdpZGUgRGV2ZWxvcGVyIFJlbGF0aW9ucyBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTELMAkGA1UECwwCRzYxEzARBgNVBAoMCkFwcGxlIEluYy4xCzAJBgNVBAYTAlVTMB4XDTI1MDkxOTE5NDQ1MVoXDTI3MTAxMzE3NDcyM1owgZIxQDA+BgNVBAMMN1Byb2QgRUNDIE1hYyBBcHAgU3RvcmUgYW5kIGlUdW5lcyBTdG9yZSBSZWNlaXB0IFNpZ25pbmcxLDAqBgNVBAsMI0FwcGxlIFdvcmxkd2lkZSBEZXZlbG9wZXIgUmVsYXRpb25zMRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABNnVvhcv7iT+7Ex5tBMBgrQspHzIsXRi0Yxfek7lv8wEmj/bHiWtNwJqc2BoHzsQiEjP7KFIIKg4Y8y0/nynuAmjggIIMIICBDAMBgNVHRMBAf8EAjAAMB8GA1UdIwQYMBaAFD8vlCNR01DJmig97bB85c+lkGKZMHAGCCsGAQUFBwEBBGQwYjAtBggrBgEFBQcwAoYhaHR0cDovL2NlcnRzLmFwcGxlLmNvbS93d2RyZzYuZGVyMDEGCCsGAQUFBzABhiVodHRwOi8vb2NzcC5hcHBsZS5jb20vb2NzcDAzLXd3ZHJnNjAyMIIBHgYDVR0gBIIBFTCCAREwggENBgoqhkiG92NkBQYBMIH+MIHDBggrBgEFBQcCAjCBtgyBs1JlbGlhbmNlIG9uIHRoaXMgY2VydGlmaWNhdGUgYnkgYW55IHBhcnR5IGFzc3VtZXMgYWNjZXB0YW5jZSBvZiB0aGUgdGhlbiBhcHBsaWNhYmxlIHN0YW5kYXJkIHRlcm1zIGFuZCBjb25kaXRpb25zIG9mIHVzZSwgY2VydGlmaWNhdGUgcG9saWN5IGFuZCBjZXJ0aWZpY2F0aW9uIHByYWN0aWNlIHN0YXRlbWVudHMuMDYGCCsGAQUFBwIBFipodHRwOi8vd3d3LmFwcGxlLmNvbS9jZXJ0aWZpY2F0ZWF1dGhvcml0eS8wHQYDVR0OBBYEFIFioG4wMMVA1ku9zJmGNPAVn3eqMA4GA1UdDwEB/wQEAwIHgDAQBgoqhkiG92NkBgsBBAIFADAKBggqhkjOPQQDAwNpADBmAjEA+qXnREC7hXIWVLsLxznjRpIzPf7VHz9V/CTm8+LJlrQepnmcPvGLNcX6XPnlcgLAAjEA5IjNZKgg5pQ79knF4IbTXdKv8vutIDMXDmjPVT3dGvFtsGRwXOywR2kZCdSrfeot';
