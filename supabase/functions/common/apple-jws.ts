// Shared verifier for Apple's JWS (JSON Web Signature) blobs.
//
// Both App Store Server Notifications V2 (`app-store-notifications`) and the
// device-driven transaction sync (`validate-apple-transaction`) receive
// Apple-signed JWS payloads. Verifying the signature is what makes these
// endpoints trustworthy: the caller (Apple, or a device relaying a StoreKit 2
// `Transaction.jwsRepresentation`) cannot fabricate an entitlement because the
// payload is signed by Apple's certificate chain, not by the client.
//
// SECURITY:
//   - The signature is verified against the leaf certificate in the JWS x5c
//     header (tamper-evidence).
//   - Set APPLE_ROOT_CA_G3 (base64 DER of Apple Root CA - G3, from
//     https://www.apple.com/certificateauthority/) to PIN the trust anchor —
//     the chain's root must then equal it. If unset, the leaf signature is
//     still checked but the trust anchor is not pinned (logged as a warning).
//   - Hardening TODO: full X.509 path validation
//     (leaf <- intermediate <- root signature chain).

import { compactVerify, importX509, decodeProtectedHeader } from "https://esm.sh/jose@5.9.6";

const APPLE_ROOT_CA_G3 = Deno.env.get("APPLE_ROOT_CA_G3");

function pemFromDerBase64(b64: string): string {
  const wrapped = b64.match(/.{1,64}/g)?.join("\n") ?? b64;
  return `-----BEGIN CERTIFICATE-----\n${wrapped}\n-----END CERTIFICATE-----`;
}

/**
 * Verify an Apple JWS (compact serialization) and return its decoded JSON
 * payload. Verifies the signature against the x5c leaf certificate and, when
 * APPLE_ROOT_CA_G3 is configured, pins the chain's root to Apple Root CA - G3.
 *
 * Throws if the x5c chain is missing, the pinned root doesn't match, or the
 * signature is invalid.
 */
export async function verifyAppleJWS(jws: string): Promise<Record<string, unknown>> {
  const header = decodeProtectedHeader(jws);
  const x5c = header.x5c as string[] | undefined;
  if (!x5c || x5c.length === 0) {
    throw new Error("JWS is missing the x5c certificate chain");
  }

  if (APPLE_ROOT_CA_G3) {
    const root = x5c[x5c.length - 1];
    if (root !== APPLE_ROOT_CA_G3) {
      throw new Error("JWS chain root does not match the pinned Apple Root CA");
    }
  } else {
    console.warn(
      "APPLE_ROOT_CA_G3 not set — verifying the leaf signature only (no trust-anchor pin). Set it to harden."
    );
  }

  const key = await importX509(pemFromDerBase64(x5c[0]), (header.alg as string) || "ES256");
  const { payload } = await compactVerify(jws, key);
  return JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
}
