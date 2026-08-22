import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';

/**
 * US-643: which storage bucket a function writes to only matters if that copy
 * of the function is the one that runs.
 *
 * This repo has two edge-function trees (check-function-trees.sh documents the
 * layout and the US-519 incident it caused). 14 names exist in both. For
 * update-blog-image the two copies write to DIFFERENT BUCKETS -- the legacy one
 * to blog-images, the deployed one to generated-images -- so "who writes to
 * blog-images" cannot be answered by grep alone, and answering it by grep is
 * exactly what put a second, dead writer into 20260822000000's comment.
 *
 * The resolution rule is supabase/config.toml's own, stated at config.toml:16:
 * a bare [functions.NAME] resolves to supabase/functions/NAME/index.ts, and a
 * function that lives only in the legacy tree needs an explicit `entrypoint`.
 *
 * These pin the two conclusions that the bucket work rests on. They are not a
 * substitute for resolving the collision, which is the function-tree gate's
 * tracked work and a product decision about where blog hero images belong.
 */

const root = path.resolve(__dirname, '../..');
const config = readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');

/** The entrypoint config.toml resolves for a function name, per its own rule. */
function resolvedEntrypoint(name: string): string {
  const section = config.slice(config.indexOf(`[functions.${name}]`));
  const body = section.slice(0, section.indexOf('\n[', 1));
  const explicit = body.match(/entrypoint\s*=\s*"([^"]+)"/)?.[1];
  if (explicit) return path.normalize(path.join('supabase', explicit));
  return `supabase/functions/${name}/index.ts`;
}

/** The bucket a function file writes to, resolving a hoisted constant. */
function bucketOf(relPath: string): string | undefined {
  const src = readFileSync(path.join(root, relPath), 'utf8');
  const direct = src.match(/storage\s*\.\s*from\(\s*['"`]([A-Za-z0-9._-]+)['"`]/)?.[1];
  if (direct) return direct;
  const via = src.match(/storage\s*\.\s*from\(\s*([A-Za-z_$][\w$]*)\s*\)/)?.[1];
  return via
    ? src.match(new RegExp(`\\b${via}\\s*=\\s*['"\`]([A-Za-z0-9._-]+)['"\`]`))?.[1]
    : undefined;
}

describe('US-643: which copy of a collided function actually writes', () => {
  it('config.toml is registered for both functions under test', () => {
    expect(config).toContain('[functions.agent-blog-writer]');
    expect(config).toContain('[functions.update-blog-image]');
  });

  it('the live update-blog-image is the deployed-tree copy, writing generated-images', () => {
    const entry = resolvedEntrypoint('update-blog-image');
    expect(entry).toBe('supabase/functions/update-blog-image/index.ts');
    expect(existsSync(path.join(root, entry))).toBe(true);
    expect(bucketOf(entry)).toBe('generated-images');
  });

  it('the legacy update-blog-image writes a different bucket and is not the live one', () => {
    // Not a failure -- it is the tracked collision. Pinned so that a change to
    // either copy has to confront the divergence rather than discover it.
    const dead = 'functions/update-blog-image/index.ts';
    expect(existsSync(path.join(root, dead))).toBe(true);
    expect(bucketOf(dead)).toBe('blog-images');
    expect(resolvedEntrypoint('update-blog-image')).not.toBe(dead);
  });

  it('agent-blog-writer is live from the legacy tree, and is blog-images sole writer', () => {
    const entry = resolvedEntrypoint('agent-blog-writer');
    expect(entry).toBe('functions/agent-blog-writer/index.ts');
    expect(existsSync(path.join(root, entry))).toBe(true);
    expect(bucketOf(entry)).toBe('blog-images');

    // Sole: no other LIVE function writes to blog-images. A second one showing
    // up here means 20260822000000's comment needs updating again.
    const liveWriters: string[] = [];
    for (const m of config.matchAll(/\[functions\.([A-Za-z0-9-]+)\]/g)) {
      const entryPath = resolvedEntrypoint(m[1]);
      if (!existsSync(path.join(root, entryPath))) continue;
      if (bucketOf(entryPath) === 'blog-images') liveWriters.push(m[1]);
    }
    expect(liveWriters).toEqual(['agent-blog-writer']);
  });

  it('every legacy-tree function config.toml registers has an explicit entrypoint', () => {
    // config.toml:16's rule. Without the entrypoint the CLI silently resolves to
    // a deployed-tree path that may not exist, or worse, may be a different
    // implementation -- which is how update-blog-image diverged.
    const legacyOnly = readdirSync(path.join(root, 'functions'), { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
      .map((e) => e.name)
      .filter((n) => !existsSync(path.join(root, 'supabase/functions', n)))
      .filter((n) => config.includes(`[functions.${n}]`));

    expect(legacyOnly.length).toBeGreaterThan(0);
    const missing = legacyOnly.filter((n) => !resolvedEntrypoint(n).startsWith('functions/'));
    expect(missing).toEqual([]);
  });
});
