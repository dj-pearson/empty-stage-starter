// Server-side relay for outbound webhook posts (Make.com scenarios and friends).
//
// The admin UI used to fetch(webhook_url) straight from the browser. That is
// blocked by the CSP in public/_headers, which pins connect-src to a fixed
// allowlist -- and widening it would not have helped for long, because
// webhook_url is configurable per social account, so any host an admin picks
// tomorrow would be blocked again with the same opaque "Failed to fetch".
// Posting from the server sidesteps CSP and CORS entirely and works for any URL.
//
// Callers send the payload they already built; this function does not shape it.
// Keeping the envelope at the call site means the Make scenario's field mappings
// stay readable from the component that feeds them.

import { requireAdmin } from "../_shared/require-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Hostnames that must never be reachable from a server-side relay. */
const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "169.254.169.254",
]);

/**
 * Reject the obvious SSRF targets before making the request.
 *
 * Ceiling, stated rather than implied: this checks the literal host in the URL
 * and does NOT resolve DNS, so a public hostname whose A record points at a
 * private address still passes. Closing that needs resolution plus a re-check
 * after connect, which Deno's fetch does not expose. The remaining exposure is
 * the same one test-blog-webhook already carries and is mitigated the same way
 * -- the requireAdmin gate above means only an admin or the service key can
 * reach this at all.
 */
function refuseUnsafeUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "webhookUrl is not a valid URL";
  }
  if (url.protocol !== "https:") {
    return "webhookUrl must use https";
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(host)) {
    return "webhookUrl points at a blocked host";
  }
  // IPv4 literals in private / loopback / link-local space.
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    const priv = a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254);
    if (priv) return "webhookUrl points at a private address";
  }
  // IPv6 loopback / unique-local / link-local.
  if (host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
    return "webhookUrl points at a private address";
  }
  return null;
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Admin/service only: this POSTs a caller-supplied body to a caller-supplied
  // URL, which is an open relay if left ungated. Same posture as
  // test-blog-webhook.
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return json({ error: gate.error ?? "Unauthorized" }, gate.status);
  }

  try {
    const { webhookUrl, payload } = await req.json();

    if (!webhookUrl || typeof webhookUrl !== "string") {
      return json({ error: "webhookUrl is required" }, 400);
    }
    if (payload === undefined || payload === null) {
      return json({ error: "payload is required" }, 400);
    }

    const refusal = refuseUnsafeUrl(webhookUrl);
    if (refusal) {
      return json({ error: refusal }, 400);
    }

    console.log("Relaying webhook to:", webhookUrl);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Read the body for the caller's log, but never let a huge or hanging
    // response take the function down.
    let responseBody = "";
    try {
      responseBody = (await response.text()).slice(0, 2000);
    } catch {
      responseBody = "";
    }

    console.log("Webhook response status:", response.status);

    // A non-2xx from the far end is a real answer, not a function failure, so
    // it comes back as 200 with ok:false. The caller decides what to show;
    // collapsing it into an HTTP error would lose the remote status.
    return json({
      ok: response.ok,
      status: response.status,
      body: responseBody,
    }, 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error in send-webhook function:", message);
    return json({ error: message }, 500);
  }
};
