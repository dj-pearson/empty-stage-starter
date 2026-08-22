import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * US-570: the prerender's discovery filters and the RLS policies that decide
 * what the anon key can actually read are two halves of one contract, written
 * in two files that know nothing about each other.
 *
 * scripts/prerender-routes.json says which rows to ask for. The policies in the
 * migrations decide which rows come back. Today discovery asks for
 * status=eq.published while the policy ALSO requires published_at <= now(), so
 * the policy is the stricter of the two and a scheduled post is simply never
 * discovered. That is the safe direction, and it is safe by accident rather
 * than by agreement -- nothing stops someone loosening the policy or tightening
 * the filter and finding out at deploy time.
 *
 * These pin the pairing. They are deliberately literal: any edit to either side
 * fails here, and a human re-checks that discovery still asks for a SUBSET of
 * what the policy permits. Proved end to end against PostgreSQL 16.13 in
 * supabase/diagnostics/us-570-content-read-check.sql, which seeds the awkward
 * rows and counts what anon sees.
 */

const root = path.resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const routes = JSON.parse(read('scripts/prerender-routes.json'));
const sources: Array<Record<string, unknown>> = routes.dynamic.sources;
const sourceFor = (table: string) => sources.find((s) => s.table === table);

/** Collapses whitespace so a reformatted migration does not fail the match. */
const squish = (s: string) => s.replace(/\s+/g, ' ');

describe('US-570: prerender discovery matches the anon read policy', () => {
  it('discovers blog posts by status, and the policy is the stricter side', () => {
    const source = sourceFor('blog_posts');
    expect(source?.filter).toBe('status=eq.published');

    const migration = squish(read('supabase/migrations/20251008144000_create_blog_tables.sql'));
    // The policy adds published_at <= NOW() on top of the discovery filter.
    // If this predicate ever loses that clause, discovery starts prerendering
    // scheduled posts and this test is the warning.
    expect(migration).toContain(
      squish(`CREATE POLICY "Anyone can view published posts"
  ON blog_posts FOR SELECT
  USING (status = 'published' AND published_at <= NOW());`)
    );
  });

  it('reads the embedded category through a policy open to anon', () => {
    // BlogPost.tsx selects category:blog_categories(name, slug). A post the
    // policy allows but whose category it hides would render with a missing
    // category rather than an error, which is the kind of thing a prerendered
    // page bakes in permanently.
    expect(read('src/pages/BlogPost.tsx')).toContain('category:blog_categories(name, slug)');
    expect(squish(read('supabase/migrations/20251008144000_create_blog_tables.sql'))).toContain(
      squish(`CREATE POLICY "Anyone can view categories"
  ON blog_categories FOR SELECT
  USING (true);`)
    );
  });

  it('discovers guides by status and tier, and the policy gates status only', () => {
    const source = sourceFor('pseo_pages');
    expect(source?.filters).toEqual(['generation_status=eq.published', 'tier=lte.1']);

    const migration = squish(read('supabase/migrations/20260313000000_pseo_pages.sql'));
    expect(migration).toContain(
      squish(`CREATE POLICY "Public can read published pseo pages"
  ON public.pseo_pages FOR SELECT
  USING (generation_status = 'published');`)
    );
    // tier is the prerender's own budget decision (MAX_INDEXABLE_TIER), not a
    // security boundary: the POLICY gates on status alone, so a tier-2 guide is
    // readable by anon and simply not prerendered. Scope this to the policy
    // statement -- the migration mentions tier plenty elsewhere (a column, an
    // index, a CHECK).
    const selectPolicy = migration.slice(
      migration.indexOf('CREATE POLICY "Public can read published pseo pages"')
    );
    expect(selectPolicy.slice(0, selectPolicy.indexOf(';') + 1)).not.toContain('tier');
  });

  it('selects only columns that exist on blog_posts', () => {
    // A selected column that no migration creates makes PostgREST 400 and the
    // page render as its error state, which prerender then bakes into static
    // HTML with the homepage canonical. Cheap to check, expensive to miss.
    const page = read('src/pages/BlogPost.tsx');
    const selected = page
      .slice(page.indexOf('.from("blog_posts")'))
      .match(/\.select\(`([\s\S]*?)`\)/)?.[1];
    expect(selected).toBeDefined();

    const columns = (selected as string)
      // Drop embedded relations first -- category:blog_categories(name, slug)
      // contains a comma, so splitting before removing it yields a bare
      // "slug)" that is neither a column nor a valid regex.
      .replace(/\w+:\w+\([^)]*\)/g, '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    expect(columns.length).toBeGreaterThan(5);

    const schema = read('supabase/migrations/20251008144000_create_blog_tables.sql');
    const createTable = schema.slice(
      schema.indexOf('CREATE TABLE IF NOT EXISTS blog_posts'),
      schema.indexOf(');', schema.indexOf('CREATE TABLE IF NOT EXISTS blog_posts'))
    );
    for (const column of columns) {
      expect(createTable, `blog_posts.${column} is selected but not created`).toMatch(
        new RegExp(`^\\s*${column}\\s`, 'm')
      );
    }
  });
});
