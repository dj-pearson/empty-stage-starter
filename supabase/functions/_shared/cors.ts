// Origin-restricted CORS headers for privileged, WEB-ONLY edge functions.
//
// Use this ONLY for endpoints whose sole caller is the web app / admin
// dashboard (e.g. list-users, update-user). Do NOT use it for functions the
// native (Capacitor) app calls — the production WebView origin is not settled
// (capacitor.config points at a dev URL), and locking those would break the
// Apple-required account-deletion flow. Native fetches are also not subject to
// browser CORS in the same way, so those functions keep a permissive policy.
//
// Behavior: reflect the request Origin when it is in the allowlist; otherwise
// fall back to the primary domain so an unlisted browser origin is blocked
// from reading the response.

const ALLOWED_ORIGINS = new Set<string>([
  "https://tryeatpal.com",
  "https://www.tryeatpal.com",
  "https://app.tryeatpal.com",
  // Local dev (Vite dev server runs on 8080; common alternates included).
  "http://localhost:8080",
  "http://localhost:5173",
  "http://localhost:3000",
]);

const PRIMARY_ORIGIN = "https://tryeatpal.com";

export function corsHeadersFor(
  req: Request,
  allowMethods = "POST, OPTIONS",
): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : PRIMARY_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": allowMethods,
    "Vary": "Origin",
  };
}
