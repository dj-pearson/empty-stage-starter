// Deno tests for the recipe-fetch SSRF guards (US-710).
// Run with: deno test supabase/functions/_shared/url-validator.test.ts
//
// Every case injects `fetchImpl`, and every URL uses an IP literal, so nothing
// here touches the network or DNS.
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  fetchGuardedResource,
  fetchRecipePage,
  isPrivateHost,
  readCappedBody,
  validateUrl,
} from './url-validator.ts';

/** A public IP literal, so validateExternalUrl skips DNS. */
const PUBLIC = 'https://93.184.216.34';

function page(body: string, headers: Record<string, string> = {}) {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html', ...headers } });
}

function redirectTo(location: string) {
  return new Response(null, { status: 302, headers: { location } });
}

// ─── private ranges ──────────────────────────────────────────────────────────

Deno.test('isPrivateHost covers the ranges an SSRF actually targets', () => {
  for (const host of [
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    'localhost',
    '::1',
    '[::1]',
    'fd00::1',
    'fe80::1',
    '0x7f000001',
    '2130706433',
    'metadata.google.internal',
  ]) {
    assert(isPrivateHost(host), `${host} should be rejected`);
  }
});

Deno.test('isPrivateHost lets public addresses through', () => {
  for (const host of ['93.184.216.34', '8.8.8.8', '172.15.0.1', '172.32.0.1', 'example.com']) {
    assert(!isPrivateHost(host), `${host} should be allowed`);
  }
});

Deno.test('validateUrl rejects every scheme but https', () => {
  assertEquals(validateUrl('http://93.184.216.34/r').valid, false);
  assertEquals(validateUrl('file:///etc/passwd').valid, false);
  assertEquals(validateUrl('gopher://93.184.216.34/').valid, false);
  assertEquals(validateUrl('https://93.184.216.34/r').valid, true);
});

Deno.test('validateUrl rejects credentials in the URL', () => {
  const check = validateUrl('https://user:pass@93.184.216.34/r');
  assertEquals(check.valid, false);
  assertStringIncludes(check.error!, 'Credentials');
});

Deno.test('fetchRecipePage refuses the metadata service before any fetch', async () => {
  let called = false;
  const result = await fetchRecipePage('https://169.254.169.254/latest/meta-data/', {
    fetchImpl: () => {
      called = true;
      return Promise.resolve(page('secret'));
    },
  });
  assert(!result.ok);
  assertEquals(result.status, 400);
  assert(!called, 'must not fetch a private address');
});

Deno.test('fetchRecipePage refuses a private address reached by redirect', async () => {
  const seen: string[] = [];
  const result = await fetchRecipePage(PUBLIC + '/recipe', {
    fetchImpl: (input) => {
      seen.push(String(input));
      return Promise.resolve(redirectTo('http://169.254.169.254/latest/meta-data/'));
    },
  });
  assert(!result.ok);
  assertEquals(result.status, 400);
  assertEquals(seen.length, 1, 'the redirect target must never be fetched');
});

// ─── redirect cap ────────────────────────────────────────────────────────────

Deno.test('fetchRecipePage follows up to 3 hops and then gives up', async () => {
  let hops = 0;
  const result = await fetchRecipePage(PUBLIC + '/0', {
    fetchImpl: () => {
      hops++;
      return Promise.resolve(redirectTo(`${PUBLIC}/${hops}`));
    },
  });
  assert(!result.ok);
  assertEquals(result.status, 400);
  assertStringIncludes(result.error, 'Too many redirects');
  assertEquals(hops, 4, 'initial request plus 3 followed hops');
});

Deno.test('fetchRecipePage returns the body after a redirect within the cap', async () => {
  let hops = 0;
  const result = await fetchRecipePage(PUBLIC + '/a', {
    fetchImpl: () => {
      hops++;
      return Promise.resolve(hops === 1 ? redirectTo(PUBLIC + '/b') : page('<html>ok</html>'));
    },
  });
  assert(result.ok);
  assertEquals(result.html, '<html>ok</html>');
  assertEquals(result.finalUrl, PUBLIC + '/b');
});

Deno.test('fetchRecipePage sends redirect:manual so nothing is followed unchecked', async () => {
  let mode: RequestRedirect | undefined;
  await fetchRecipePage(PUBLIC + '/r', {
    fetchImpl: (_input, init) => {
      mode = init?.redirect;
      return Promise.resolve(page('<html></html>'));
    },
  });
  assertEquals(mode, 'manual');
});

// ─── size cap ────────────────────────────────────────────────────────────────

Deno.test('readCappedBody rejects a declared Content-Length over the cap', async () => {
  const res = new Response('x', { headers: { 'content-length': '999999' } });
  const out = await readCappedBody(res, 1024);
  assertEquals(out.ok, false);
});

Deno.test('readCappedBody rejects an oversized body that lies about its length', async () => {
  const res = new Response('x'.repeat(5000)); // no content-length we trust
  const out = await readCappedBody(res, 1024);
  assertEquals(out.ok, false);
});

Deno.test('readCappedBody accepts a body under the cap', async () => {
  const out = await readCappedBody(new Response('hello'), 1024);
  assert(out.ok);
  assertEquals(new TextDecoder().decode(out.bytes), 'hello');
});

Deno.test('fetchRecipePage returns 413 above the byte cap', async () => {
  const result = await fetchRecipePage(PUBLIC + '/big', {
    maxBytes: 64,
    fetchImpl: () => Promise.resolve(page('y'.repeat(5000))),
  });
  assert(!result.ok);
  assertEquals(result.status, 413);
});

// ─── timeout and upstream failures ───────────────────────────────────────────

Deno.test('fetchRecipePage passes an AbortSignal to the fetch', async () => {
  let signal: AbortSignal | null | undefined;
  await fetchRecipePage(PUBLIC + '/t', {
    fetchImpl: (_input, init) => {
      signal = init?.signal;
      return Promise.resolve(page('<html></html>'));
    },
  });
  assert(signal instanceof AbortSignal);
});

Deno.test('fetchRecipePage reports a timeout as 504', async () => {
  const result = await fetchRecipePage(PUBLIC + '/slow', {
    fetchImpl: () => Promise.reject(new DOMException('Signal timed out.', 'TimeoutError')),
  });
  assert(!result.ok);
  assertEquals(result.status, 504);
});

Deno.test('fetchRecipePage reports an upstream error as 502', async () => {
  const result = await fetchRecipePage(PUBLIC + '/404', {
    fetchImpl: () => Promise.resolve(new Response('nope', { status: 404 })),
  });
  assert(!result.ok);
  assertEquals(result.status, 502);
});

// ─── the same guards, for a non-HTML resource (US-773) ───────────────────────
//
// update-blog-image downloads an admin-supplied image URL. Until this landed it
// used a bare `fetch(imageUrl)` with no SSRF check and no size cap, while the
// copy of that function in the tree which never deploys had both. These cases
// are the recipe ones re-aimed at the byte-returning entry point, because that
// is the one an image path reaches.

Deno.test('fetchGuardedResource refuses the metadata service before any fetch', async () => {
  let called = false;
  const result = await fetchGuardedResource('http://169.254.169.254/latest/meta-data/', {
    fetchImpl: () => {
      called = true;
      return Promise.resolve(page('never'));
    },
  });
  assert(!result.ok);
  assertEquals(result.ok ? 0 : result.status, 400);
  assertEquals(called, false);
});

Deno.test('fetchGuardedResource refuses a private address reached by redirect', async () => {
  const result = await fetchGuardedResource(PUBLIC, {
    fetchImpl: (input) => {
      const url = String(input);
      if (url === PUBLIC) return Promise.resolve(redirectTo('http://127.0.0.1/admin'));
      return Promise.resolve(page('should never be reached'));
    },
  });
  assert(!result.ok);
  assertEquals(result.ok ? 0 : result.status, 400);
});

Deno.test('fetchGuardedResource caps the body and reports 413', async () => {
  const result = await fetchGuardedResource(PUBLIC, {
    maxBytes: 8,
    fetchImpl: () => Promise.resolve(page('x'.repeat(64))),
  });
  assert(!result.ok);
  assertEquals(result.ok ? 0 : result.status, 413);
});

Deno.test('fetchGuardedResource returns bytes and the content type, not text', async () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic
  const result = await fetchGuardedResource(PUBLIC, {
    headers: { Accept: 'image/*' },
    fetchImpl: () =>
      Promise.resolve(new Response(bytes, { status: 200, headers: { 'content-type': 'image/png' } })),
  });
  assert(result.ok);
  if (!result.ok) return;
  assertEquals(result.contentType, 'image/png');
  assertEquals(Array.from(result.bytes), [0x89, 0x50, 0x4e, 0x47]);
  assertEquals(result.finalUrl, PUBLIC);
});

Deno.test('fetchGuardedResource sends the headers it was given', async () => {
  let seen: Record<string, string> = {};
  await fetchGuardedResource(PUBLIC, {
    headers: { Accept: 'image/*' },
    fetchImpl: (_input, init) => {
      seen = (init?.headers ?? {}) as Record<string, string>;
      return Promise.resolve(page('ok'));
    },
  });
  assertEquals(seen.Accept, 'image/*');
});

Deno.test('fetchGuardedResource gives up after 3 hops, like the recipe path', async () => {
  let hops = 0;
  const result = await fetchGuardedResource(PUBLIC, {
    fetchImpl: () => {
      hops++;
      return Promise.resolve(redirectTo(PUBLIC + '/' + hops));
    },
  });
  assert(!result.ok);
  assertStringIncludes(result.ok ? '' : result.error, 'Too many redirects');
  assertEquals(hops, 4);
});
