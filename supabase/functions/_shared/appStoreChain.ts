/**
 * Full verification of an Apple-signed JWS (StoreKit 2 transaction, or an App
 * Store Server Notification V2 payload), with no third-party dependency.
 *
 * WHY THIS EXISTS. app-store-notifications compared the LAST certificate in
 * the x5c header to the pinned Apple Root CA - G3 and verified the JWS against
 * the FIRST. Nothing checked that the first was issued by the second. Apple's
 * root certificate is public, so anyone can build [own leaf, own intermediate,
 * Apple root], sign any payload with their own leaf key, and pass both checks.
 * That was tolerable for a handler that only moves an existing row between
 * statuses. It is not tolerable for an endpoint that grants an entitlement
 * from a client-supplied JWS, so verify-app-store-transaction uses this.
 *
 * What is checked, following Apple's app-store-server-library:
 *   - exactly three certificates: leaf, intermediate, root;
 *   - the root is byte-for-byte the pinned root (base64 DER, whitespace ignored);
 *   - the intermediate is signed by the root and the leaf by the intermediate
 *     (ECDSA, SHA-256 or SHA-384), and each issuer name matches;
 *   - the root and intermediate are CAs (basicConstraints cA=TRUE);
 *   - the intermediate carries Apple's WWDR marker OID 1.2.840.113635.100.6.2.1
 *     and the leaf carries the App Store receipt-signing OID
 *     1.2.840.113635.100.6.11.1;
 *   - every certificate is within its validity window at the payload's
 *     signedDate (Apple's library uses signedDate when it does not do online
 *     revocation checks, so a restore of an old transaction still verifies);
 *   - the JWS header alg is ES256 and the signature verifies under the leaf's
 *     P-256 key.
 *
 * Not checked: OCSP/CRL revocation of the Apple certificates.
 *
 * Pure apart from WebCrypto (globalThis.crypto.subtle), which Deno and Node 20+
 * both provide, so the vitest mirror runs the same code the function does.
 */

export const APPLE_WWDR_INTERMEDIATE_OID = '1.2.840.113635.100.6.2.1';
export const APPLE_RECEIPT_SIGNING_LEAF_OID = '1.2.840.113635.100.6.11.1';

const OID_BASIC_CONSTRAINTS = '2.5.29.19';
const OID_EC_PUBLIC_KEY = '1.2.840.10045.2.1';
const OID_ECDSA_SHA256 = '1.2.840.10045.4.3.2';
const OID_ECDSA_SHA384 = '1.2.840.10045.4.3.3';
const CURVES: Record<string, { name: 'P-256' | 'P-384'; size: number }> = {
  '1.2.840.10045.3.1.7': { name: 'P-256', size: 32 },
  '1.3.132.0.34': { name: 'P-384', size: 48 },
};

export class AppleJwsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppleJwsError';
  }
}

// --- DER ---------------------------------------------------------------------

interface Tlv {
  tag: number;
  /** The whole element, header included. */
  full: Uint8Array;
  /** The value bytes only. */
  value: Uint8Array;
}

function readTlv(buf: Uint8Array, offset: number): { tlv: Tlv; next: number } {
  if (offset + 2 > buf.length) throw new AppleJwsError('DER: truncated header');
  const tag = buf[offset];
  if ((tag & 0x1f) === 0x1f) throw new AppleJwsError('DER: multi-byte tags are not supported');
  let len = buf[offset + 1];
  let pos = offset + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new AppleJwsError('DER: unsupported length');
    if (pos + n > buf.length) throw new AppleJwsError('DER: truncated length');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[pos + i];
    pos += n;
  }
  const end = pos + len;
  if (end > buf.length) throw new AppleJwsError('DER: element overruns its container');
  return { tlv: { tag, full: buf.subarray(offset, end), value: buf.subarray(pos, end) }, next: end };
}

function children(parent: Tlv): Tlv[] {
  const out: Tlv[] = [];
  let pos = 0;
  while (pos < parent.value.length) {
    const { tlv, next } = readTlv(parent.value, pos);
    out.push(tlv);
    pos = next;
  }
  return out;
}

function expectTag(tlv: Tlv | undefined, tag: number, what: string): Tlv {
  if (!tlv || tlv.tag !== tag) throw new AppleJwsError(`DER: expected ${what}`);
  return tlv;
}

function decodeOid(value: Uint8Array): string {
  if (value.length === 0) throw new AppleJwsError('DER: empty OID');
  const parts: number[] = [];
  const first = value[0];
  parts.push(first < 80 ? Math.floor(first / 40) : 2, first < 80 ? first % 40 : first - 80);
  let acc = 0;
  for (let i = 1; i < value.length; i++) {
    acc = acc * 128 + (value[i] & 0x7f);
    if (!(value[i] & 0x80)) {
      parts.push(acc);
      acc = 0;
    }
  }
  return parts.join('.');
}

function decodeTime(tlv: Tlv): number {
  const s = new TextDecoder().decode(tlv.value);
  let m: RegExpMatchArray | null;
  if (tlv.tag === 0x17) {
    m = s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/);
    if (!m) throw new AppleJwsError('DER: bad UTCTime');
    const yy = Number(m[1]);
    return Date.UTC(yy < 50 ? 2000 + yy : 1900 + yy, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  }
  if (tlv.tag === 0x18) {
    m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/);
    if (!m) throw new AppleJwsError('DER: bad GeneralizedTime');
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  }
  throw new AppleJwsError('DER: expected a time');
}

/** The parts of an X.509 certificate this verifier needs. */
export interface ParsedCert {
  der: Uint8Array;
  tbs: Uint8Array;
  signatureAlgorithm: string;
  /** DER-encoded ECDSA signature (SEQUENCE { r, s }). */
  signature: Uint8Array;
  issuer: Uint8Array;
  subject: Uint8Array;
  notBefore: number;
  notAfter: number;
  spki: Uint8Array;
  curve: { name: 'P-256' | 'P-384'; size: number };
  extensionOids: string[];
  isCa: boolean;
}

export function parseCertificate(der: Uint8Array): ParsedCert {
  const { tlv: cert, next } = readTlv(der, 0);
  if (next !== der.length) throw new AppleJwsError('DER: trailing bytes after certificate');
  const [tbsTlv, algTlv, sigTlv] = children(expectTag(cert, 0x30, 'Certificate'));
  expectTag(tbsTlv, 0x30, 'TBSCertificate');
  const signatureAlgorithm = decodeOid(expectTag(children(expectTag(algTlv, 0x30, 'AlgorithmIdentifier'))[0], 0x06, 'OID').value);
  const sigBits = expectTag(sigTlv, 0x03, 'signature BIT STRING').value;
  if (sigBits.length < 2 || sigBits[0] !== 0) throw new AppleJwsError('DER: bad signature BIT STRING');

  const tbs = children(tbsTlv);
  let i = 0;
  if (tbs[i]?.tag === 0xa0) i++; // [0] version
  expectTag(tbs[i++], 0x02, 'serialNumber');
  const innerAlg = decodeOid(expectTag(children(expectTag(tbs[i++], 0x30, 'signature'))[0], 0x06, 'OID').value);
  if (innerAlg !== signatureAlgorithm) throw new AppleJwsError('certificate signature algorithms disagree');
  const issuer = expectTag(tbs[i++], 0x30, 'issuer').full;
  const validity = children(expectTag(tbs[i++], 0x30, 'validity'));
  const subject = expectTag(tbs[i++], 0x30, 'subject').full;
  const spkiTlv = expectTag(tbs[i++], 0x30, 'subjectPublicKeyInfo');

  const spkiAlg = children(expectTag(children(spkiTlv)[0], 0x30, 'SPKI algorithm'));
  if (decodeOid(expectTag(spkiAlg[0], 0x06, 'OID').value) !== OID_EC_PUBLIC_KEY) {
    throw new AppleJwsError('certificate key is not an EC key');
  }
  const curve = CURVES[decodeOid(expectTag(spkiAlg[1], 0x06, 'curve OID').value)];
  if (!curve) throw new AppleJwsError('certificate key uses an unsupported curve');

  const extensionOids: string[] = [];
  let isCa = false;
  for (; i < tbs.length; i++) {
    if (tbs[i].tag !== 0xa3) continue; // [1]/[2] unique ids are skipped
    const exts = children(expectTag(children(tbs[i])[0], 0x30, 'Extensions'));
    for (const ext of exts) {
      const parts = children(expectTag(ext, 0x30, 'Extension'));
      const oid = decodeOid(expectTag(parts[0], 0x06, 'OID').value);
      extensionOids.push(oid);
      if (oid === OID_BASIC_CONSTRAINTS) {
        const octets = expectTag(parts[parts.length - 1], 0x04, 'extnValue');
        const { tlv: bc } = readTlv(octets.value, 0);
        const first = children(expectTag(bc, 0x30, 'BasicConstraints'))[0];
        isCa = !!first && first.tag === 0x01 && first.value[0] !== 0;
      }
    }
  }

  return {
    der,
    tbs: tbsTlv.full,
    signatureAlgorithm,
    signature: sigBits.subarray(1),
    issuer,
    subject,
    notBefore: decodeTime(validity[0]),
    notAfter: decodeTime(validity[1]),
    spki: spkiTlv.full,
    curve,
    extensionOids,
    isCa,
  };
}

// --- encodings -----------------------------------------------------------------

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new AppleJwsError('invalid base64');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function base64UrlToBytes(b64url: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(b64url)) throw new AppleJwsError('invalid base64url');
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  return base64ToBytes(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
}

/** A fresh ArrayBuffer, which every WebCrypto BufferSource signature accepts. */
function ab(u: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(u.length);
  new Uint8Array(out).set(u);
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** DER SEQUENCE { INTEGER r, INTEGER s } -> fixed-width r || s, as WebCrypto wants. */
function derSignatureToRaw(sig: Uint8Array, size: number): Uint8Array {
  const { tlv, next } = readTlv(sig, 0);
  if (next !== sig.length) throw new AppleJwsError('DER: trailing bytes after signature');
  const [r, s] = children(expectTag(tlv, 0x30, 'ECDSA signature'));
  const out = new Uint8Array(size * 2);
  [expectTag(r, 0x02, 'r'), expectTag(s, 0x02, 's')].forEach((int, idx) => {
    let v = int.value;
    while (v.length > 1 && v[0] === 0) v = v.subarray(1);
    if (v.length > size) throw new AppleJwsError('ECDSA integer too large for the curve');
    out.set(v, idx * size + (size - v.length));
  });
  return out;
}

// --- verification -------------------------------------------------------------

async function importEcKey(cert: ParsedCert): Promise<CryptoKey> {
  return await crypto.subtle.importKey('spki', ab(cert.spki), { name: 'ECDSA', namedCurve: cert.curve.name }, false, ['verify']);
}

async function verifyIssuedBy(child: ParsedCert, issuer: ParsedCert, what: string): Promise<void> {
  if (!bytesEqual(child.issuer, issuer.subject)) throw new AppleJwsError(`${what}: issuer name does not match`);
  const hash = child.signatureAlgorithm === OID_ECDSA_SHA256
    ? 'SHA-256'
    : child.signatureAlgorithm === OID_ECDSA_SHA384
      ? 'SHA-384'
      : null;
  if (!hash) throw new AppleJwsError(`${what}: unsupported signature algorithm`);
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash },
    await importEcKey(issuer),
    ab(derSignatureToRaw(child.signature, issuer.curve.size)),
    ab(child.tbs),
  );
  if (!ok) throw new AppleJwsError(`${what}: signature does not verify`);
}

export interface JwsParts {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: Uint8Array;
  signature: Uint8Array;
}

export function splitJws(jws: string): JwsParts {
  if (typeof jws !== 'string') throw new AppleJwsError('JWS must be a string');
  const segs = jws.split('.');
  if (segs.length !== 3 || segs.some((s) => s.length === 0)) throw new AppleJwsError('JWS must have three segments');
  const dec = new TextDecoder();
  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(dec.decode(base64UrlToBytes(segs[0])));
    payload = JSON.parse(dec.decode(base64UrlToBytes(segs[1])));
  } catch {
    throw new AppleJwsError('JWS header or payload is not JSON');
  }
  if (!header || typeof header !== 'object' || Array.isArray(header)) throw new AppleJwsError('JWS header is not an object');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new AppleJwsError('JWS payload is not an object');
  return {
    header: header as Record<string, unknown>,
    payload: payload as Record<string, unknown>,
    signingInput: new TextEncoder().encode(`${segs[0]}.${segs[1]}`),
    signature: base64UrlToBytes(segs[2]),
  };
}

/**
 * Verify an Apple-signed JWS against a pinned root and return its payload.
 * Throws AppleJwsError on any failure; never returns an unverified payload.
 *
 * `rootCaBase64` is the base64 DER of Apple Root CA - G3 (the APPLE_ROOT_CA_G3
 * env var). An empty value is a refusal, not a downgrade.
 */
export async function verifyAppleJwsStrict(jws: string, rootCaBase64: string | undefined | null): Promise<Record<string, unknown>> {
  try {
    return await verifyStrictUnwrapped(jws, rootCaBase64);
  } catch (err) {
    // A malformed certificate can surface as a TypeError from deep in the
    // parser. Callers branch on AppleJwsError, so everything becomes one.
    if (err instanceof AppleJwsError) throw err;
    throw new AppleJwsError(`malformed JWS or certificate: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Check an x5c chain (leaf, intermediate, root) against the pinned root:
 * count, pin, CA flags, Apple marker OIDs and both issuing signatures. Does not
 * judge validity dates; see certsValidAt. Returns the parsed certificates.
 */
export async function verifyAppleCertChain(
  x5c: unknown,
  rootCaBase64: string | undefined | null,
): Promise<{ leaf: ParsedCert; inter: ParsedCert; root: ParsedCert }> {
  if (!rootCaBase64 || !rootCaBase64.trim()) throw new AppleJwsError('no pinned Apple root certificate configured');
  if (!Array.isArray(x5c) || x5c.length !== 3 || !x5c.every((c) => typeof c === 'string')) {
    throw new AppleJwsError('JWS x5c must hold exactly three certificates');
  }

  const pinned = base64ToBytes(rootCaBase64);
  const [leafDer, interDer, rootDer] = (x5c as string[]).map(base64ToBytes);
  if (!bytesEqual(rootDer, pinned)) throw new AppleJwsError('JWS chain root does not match the pinned Apple Root CA');

  const leaf = parseCertificate(leafDer);
  const inter = parseCertificate(interDer);
  const root = parseCertificate(rootDer);

  if (!root.isCa || !inter.isCa) throw new AppleJwsError('root and intermediate must be CA certificates');
  if (!inter.extensionOids.includes(APPLE_WWDR_INTERMEDIATE_OID)) throw new AppleJwsError('intermediate lacks the Apple WWDR marker');
  if (!leaf.extensionOids.includes(APPLE_RECEIPT_SIGNING_LEAF_OID)) throw new AppleJwsError('leaf lacks the App Store signing marker');
  if (leaf.isCa) throw new AppleJwsError('leaf must not be a CA certificate');

  await verifyIssuedBy(inter, root, 'intermediate');
  await verifyIssuedBy(leaf, inter, 'leaf');
  return { leaf, inter, root };
}

/** Throws unless every certificate's validity window contains `atMs`. */
export function certsValidAt(certs: { leaf: ParsedCert; inter: ParsedCert; root: ParsedCert }, atMs: number): void {
  for (const [cert, what] of [[certs.leaf, 'leaf'], [certs.inter, 'intermediate'], [certs.root, 'root']] as const) {
    if (atMs < cert.notBefore || atMs > cert.notAfter) {
      throw new AppleJwsError(`${what} certificate was not valid at signedDate`);
    }
  }
}

async function verifyStrictUnwrapped(jws: string, rootCaBase64: string | undefined | null): Promise<Record<string, unknown>> {
  if (!rootCaBase64 || !rootCaBase64.trim()) throw new AppleJwsError('no pinned Apple root certificate configured');
  const parts = splitJws(jws);
  if (parts.header.alg !== 'ES256') throw new AppleJwsError('JWS alg must be ES256');
  const certs = await verifyAppleCertChain(parts.header.x5c, rootCaBase64);

  if (certs.leaf.curve.name !== 'P-256') throw new AppleJwsError('leaf key must be P-256 for ES256');
  if (parts.signature.length !== 64) throw new AppleJwsError('ES256 signature must be 64 bytes');
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    await importEcKey(certs.leaf),
    ab(parts.signature),
    ab(parts.signingInput),
  );
  if (!ok) throw new AppleJwsError('JWS signature does not verify');

  // Validity is judged at the moment Apple signed the payload. The date comes
  // from the payload, which is only trusted now that its signature checked out.
  const signedDate = Number(parts.payload.signedDate);
  if (!Number.isFinite(signedDate) || signedDate <= 0) throw new AppleJwsError('payload has no signedDate');
  certsValidAt(certs, signedDate);

  return parts.payload;
}
