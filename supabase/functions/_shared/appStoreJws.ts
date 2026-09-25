/**
 * Apple JWS verification for the App Store edge functions.
 *
 * Two levels, on purpose:
 *
 * verifyAppleJwsLegacy -- moved verbatim from app-store-notifications, which
 *   keeps using it so its accept/reject behaviour is unchanged: the signature
 *   is checked against the x5c LEAF and, when APPLE_ROOT_CA_G3 is set, the LAST
 *   x5c entry must equal it as a string. It does not check that the leaf chains
 *   to that root, so it proves nothing about who signed the payload (Apple's
 *   root certificate is public; anyone can append it). It additionally reports
 *   `chainVerified`, which is true only when the full check below also passes.
 *
 * verifyAppleJwsStrict (appStoreChain.ts) -- the full chain: pinned root,
 *   issuing signatures, Apple marker OIDs, validity at signedDate, ES256. It
 *   refuses outright when APPLE_ROOT_CA_G3 is unset. Anything that creates an
 *   entitlement uses this.
 *
 * ENV: APPLE_ROOT_CA_G3 -- base64 DER of Apple Root CA - G3, from
 * https://www.apple.com/certificateauthority/ (AppleRootCA-G3.cer, base64
 * encoded, no PEM armour). A public certificate, but configured rather than
 * committed so the pin can be rotated without a deploy.
 */

import { compactVerify, decodeProtectedHeader, importX509 } from "https://esm.sh/jose@5.9.6";
import { verifyAppleJwsStrict } from "./appStoreChain.ts";

export { AppleJwsError, verifyAppleJwsStrict } from "./appStoreChain.ts";

export function appleRootCaFromEnv(): string | undefined {
  return Deno.env.get("APPLE_ROOT_CA_G3") || undefined;
}

function pemFromDerBase64(b64: string): string {
  const wrapped = b64.match(/.{1,64}/g)?.join("\n") ?? b64;
  return `-----BEGIN CERTIFICATE-----\n${wrapped}\n-----END CERTIFICATE-----`;
}

export interface LegacyVerifyResult {
  payload: Record<string, unknown>;
  /** True only when the full chain check (verifyAppleJwsStrict) also passed. */
  chainVerified: boolean;
}

/**
 * Verify an Apple JWS (compact) and return its decoded JSON payload. Verifies
 * the signature against the x5c leaf certificate and, when configured, pins
 * the chain's root to Apple Root CA - G3.
 *
 * Throws exactly where app-store-notifications' own copy threw.
 */
export async function verifyAppleJwsLegacy(
  jws: string,
  rootCa: string | undefined = appleRootCaFromEnv(),
): Promise<LegacyVerifyResult> {
  const header = decodeProtectedHeader(jws);
  const x5c = header.x5c as string[] | undefined;
  if (!x5c || x5c.length === 0) {
    throw new Error("JWS is missing the x5c certificate chain");
  }

  if (rootCa) {
    const root = x5c[x5c.length - 1];
    if (root !== rootCa) {
      throw new Error("JWS chain root does not match the pinned Apple Root CA");
    }
  } else {
    console.warn(
      "APPLE_ROOT_CA_G3 not set -- verifying the leaf signature only (no trust-anchor pin). Set it to harden."
    );
  }

  const key = await importX509(pemFromDerBase64(x5c[0]), (header.alg as string) || "ES256");
  const { payload } = await compactVerify(jws, key);
  const decoded = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;

  let chainVerified = false;
  if (rootCa) {
    try {
      await verifyAppleJwsStrict(jws, rootCa);
      chainVerified = true;
    } catch (err) {
      console.warn(`Apple JWS passed the legacy check but not the full chain check: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { payload: decoded, chainVerified };
}
