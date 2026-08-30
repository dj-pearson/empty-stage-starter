import { describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { BlogFeedUnavailable, FEED_POST_LIMIT, fetchFeedPosts } from "./blog-feed";
import { RETIRED_BLOG_SLUGS } from "./retired-blog-slugs";
import { generateAtomFeed, generateRSSFeed } from "./rss-generator";
import { onRequest as rssOnRequest } from "../../functions/rss.xml";
import { onRequest as atomOnRequest } from "../../functions/feed.xml";

/**
 * /rss.xml and /feed.xml were two hand-written files listing six posts dated January
 * 2025 while 180 were published, and SEOHead advertises the RSS one from every page. The
 * feeds now come from the database through functions/rss.xml.ts and functions/feed.xml.ts.
 */

const REPO = path.resolve(__dirname, "..", "..");
const ENV = { VITE_SUPABASE_URL: "https://api.example.test", VITE_SUPABASE_ANON_KEY: "anon-key" };

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    title: "A post",
    slug: "a-post",
    excerpt: "An excerpt.",
    meta_description: "A meta description.",
    published_at: "2026-01-02T10:00:00Z",
    updated_at: "2026-01-03T10:00:00Z",
    featured_image_url: null,
    ...over,
  };
}

function fetchReturning(rows: unknown[], init: { ok?: boolean; status?: number } = {}) {
  return vi.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: "",
    json: async () => rows,
  })) as unknown as typeof fetch;
}

describe("fetchFeedPosts", () => {
  it("asks PostgREST only for published posts, newest first", async () => {
    const impl = fetchReturning([row()]);
    await fetchFeedPosts(ENV, impl);

    const [url, options] = (impl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/rest/v1/blog_posts?");
    expect(decodeURIComponent(url as string)).toContain("status=eq.published");
    expect(decodeURIComponent(url as string)).toContain("order=published_at.desc");
    expect((options as RequestInit).headers).toMatchObject({ apikey: "anon-key" });
  });

  it("drops retired duplicates, which still have published rows", async () => {
    // The 29 slugs in retired-blog-slugs.ts are 301'd by public/_redirects but their
    // rows are still status=published, so the query returns them. A feed advertising a
    // URL the site immediately redirects is the duplicate-content problem those
    // redirects exist to solve.
    const retired = Object.keys(RETIRED_BLOG_SLUGS)[0];
    const posts = await fetchFeedPosts(
      ENV,
      fetchReturning([row({ slug: retired }), row({ slug: "a-live-post" })]),
    );

    expect(posts.map((p) => p.url)).toEqual(["https://tryeatpal.com/blog/a-live-post"]);
  });

  it(`caps the feed at ${FEED_POST_LIMIT} posts`, async () => {
    const many = Array.from({ length: 120 }, (_, i) => row({ slug: `post-${i}` }));
    const posts = await fetchFeedPosts(ENV, fetchReturning(many));
    expect(posts).toHaveLength(FEED_POST_LIMIT);
  });

  it("over-fetches so retired posts cannot shrink the feed below the cap", async () => {
    const impl = fetchReturning([row()]);
    await fetchFeedPosts(ENV, impl);
    const url = (impl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const limit = Number(new URL(url).searchParams.get("limit"));
    expect(limit).toBeGreaterThanOrEqual(FEED_POST_LIMIT + Object.keys(RETIRED_BLOG_SLUGS).length);
  });

  it("falls back to meta_description when a post has no excerpt", async () => {
    const posts = await fetchFeedPosts(
      ENV,
      fetchReturning([row({ excerpt: null, meta_description: "From meta." })]),
    );
    expect(posts[0].description).toBe("From meta.");
  });

  it("keeps a published post that has no published_at rather than dropping it", async () => {
    const posts = await fetchFeedPosts(
      ENV,
      fetchReturning([row({ published_at: null, updated_at: "2026-02-01T00:00:00Z" })]),
    );
    expect(posts).toHaveLength(1);
    expect(posts[0].publishedDate).toBe("2026-02-01T00:00:00Z");
  });

  it("throws rather than returning an empty feed when credentials are missing", async () => {
    // An empty feed and a broken feed look identical to a reader. The caller has to be
    // able to tell them apart to choose between a document and a 503.
    await expect(fetchFeedPosts({}, fetchReturning([]))).rejects.toBeInstanceOf(
      BlogFeedUnavailable,
    );
  });

  it("throws when PostgREST rejects the query", async () => {
    // The anon key currently gets a 401 from api.tryeatpal.com, so this is the live path.
    await expect(
      fetchFeedPosts(ENV, fetchReturning([], { ok: false, status: 401 })),
    ).rejects.toBeInstanceOf(BlogFeedUnavailable);
  });
});

describe("feed documents", () => {
  it("produces parseable XML for both formats", async () => {
    const posts = await fetchFeedPosts(ENV, fetchReturning([row(), row({ slug: "second" })]));
    for (const xml of [generateRSSFeed(posts), generateAtomFeed(posts)]) {
      const parsed = new DOMParser().parseFromString(xml, "application/xml");
      expect(parsed.querySelector("parsererror")).toBeNull();
    }
  });

  it("survives a title containing the CDATA terminator", () => {
    // "]]>" ends a CDATA section wherever it appears, so a title carrying one used to
    // produce a document no reader could parse.
    const xml = generateRSSFeed([
      {
        title: "Safe foods ]]> and what to do",
        description: "Also ]]> here.",
        url: "https://tryeatpal.com/blog/x",
        publishedDate: "2026-01-01T00:00:00Z",
      },
    ]);

    const parsed = new DOMParser().parseFromString(xml, "application/xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(parsed.querySelector("item > title")?.textContent).toBe("Safe foods ]]> and what to do");
  });

  it("stays valid with no posts at all", () => {
    const parsed = new DOMParser().parseFromString(generateRSSFeed([]), "application/xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
  });
});

describe("the routes are served by Functions, not static files", () => {
  it.each(["rss.xml", "feed.xml"])("public/%s is gone", (file) => {
    // Cloudflare serves a matching static asset in preference to a Pages Function, so
    // re-adding either file would silently switch the route back to a frozen document
    // and this code would stop running. functions/sitemap.xml.ts has no
    // public/sitemap.xml beside it for the same reason.
    expect(existsSync(path.join(REPO, "public", file))).toBe(false);
  });

  it.each(["rss.xml", "feed.xml"])("functions/%s.ts serves it from the database", (route) => {
    const source = readFileSync(path.join(REPO, "functions", `${route}.ts`), "utf8");
    expect(source).toContain("fetchFeedPosts");
    expect(source).toContain("onRequest");
  });

  it("still advertises the RSS feed from every page", () => {
    const seoHead = readFileSync(path.join(REPO, "src", "components", "SEOHead.tsx"), "utf8");
    expect(seoHead).toContain("https://tryeatpal.com/rss.xml");
  });
});

describe("the Pages Functions", () => {
  /**
   * Importing them statically here does double duty. It exercises onRequest, and it
   * proves the functions/ -> src/ import graph resolves at all, which is the one thing
   * about this layout that could not be checked short of a deploy: sitemap.xml.ts, the
   * only Pages Function that existed before, imports nothing.
   */
  const withFetch = async (impl: typeof fetch, fn: () => Promise<Response>) => {
    const original = globalThis.fetch;
    globalThis.fetch = impl;
    try {
      return await fn();
    } finally {
      globalThis.fetch = original;
    }
  };

  const HANDLERS = [
    ["rss.xml", rssOnRequest, "application/rss+xml", "<rss"],
    ["feed.xml", atomOnRequest, "application/atom+xml", "<feed"],
  ] as const;

  it.each(HANDLERS)("/%s serves the posts it fetched", async (_route, onRequest, contentType, rootTag) => {
    const response = await withFetch(
      fetchReturning([row({ title: "Live post", slug: "live-post" })]),
      () => onRequest({ env: ENV }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain(contentType);

    const body = await response.text();
    expect(body).toContain(rootTag);
    expect(body).toContain("Live post");
    expect(body).toContain("https://tryeatpal.com/blog/live-post");
  });

  it.each(HANDLERS)(
    "/%s returns 503 rather than an empty feed when the database is unreachable",
    async (_route, onRequest) => {
      // Readers keep the items they already hold when a fetch fails. An empty 200 would
      // tell every subscriber the blog has nothing in it.
      const response = await withFetch(
        fetchReturning([], { ok: false, status: 401 }),
        () => onRequest({ env: ENV }),
      );

      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("Retry-After")).toBe("600");
    },
  );

  it.each(HANDLERS)("/%s caches a good response for an hour", async (_route, onRequest) => {
    const response = await withFetch(fetchReturning([row()]), () => onRequest({ env: ENV }));
    expect(response.headers.get("Cache-Control")).toContain("max-age=3600");
  });
});
