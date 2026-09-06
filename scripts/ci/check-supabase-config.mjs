#!/usr/bin/env node
/**
 * US-760: fail fast, and legibly, when supabase/config.toml names a file that
 * is not there.
 *
 * WHY THIS EXISTS. Every Web CI/CD run on main from 2026-08-30 to 2026-09-02
 * (runs 782-800) failed the same way: `supabase start` exited in under two
 * seconds and Apply migrations, Regenerate Supabase types and the edge-function
 * suite all reported as skipped. Migrations went untested for that whole
 * window. The cause was one line:
 *
 *   [auth.email.template.recovery]
 *   content_path = "../public/email-templates/recovery.html"
 *
 * Reproduced by running the CLI against this repo:
 *
 *   Invalid config for auth.email.template.recovery.content_path:
 *   ENOENT: no such file or directory, open
 *   'C:\...\EatPal\public\email-templates\recovery.html'
 *
 * The repo root is EatPal/empty-stage-starter, so the CLI resolved that path
 * from the PROJECT ROOT and the leading `../` climbed out of the repo
 * entirely. `./public/email-templates/recovery.html` is the correct spelling.
 * From the CI run list, an abort here is indistinguishable from Docker failing
 * to start, which is why it survived twenty runs.
 *
 * This gate reads the file paths out of the config and checks each one exists,
 * with no Docker, in milliseconds. It runs as its own named step BEFORE
 * `supabase start`, so this class of failure is reported as itself rather than
 * as a wall of skipped steps (AC 5).
 *
 * ON `entrypoint`, DELIBERATELY LOOSER. content_path resolves from the project
 * root; that is measured above. Whether `entrypoint` does too could not be
 * established from this machine -- `supabase status` validates content_path but
 * walks straight past a nonexistent entrypoint, and the CLI needs Docker to go
 * further. The config comment above [functions.health-check] says these paths
 * were written against a supabase/-relative base. Rather than guess and red the
 * build over thirty-one lines that may be perfectly correct, an entrypoint
 * passes if it resolves under EITHER base. That still catches the case worth
 * catching: a function file that has been moved or deleted and now resolves to
 * nothing at all.
 */
import fs from 'fs';
import path from 'path';

const CONFIG = 'supabase/config.toml';

/** Resolved from the project root. Measured, not assumed. */
const ROOT_RELATIVE_KEYS = new Set(['content_path']);
/** Base is undetermined; accept either. See the note above. */
const EITHER_BASE_KEYS = new Set(['entrypoint', 'import_map']);

function main() {
  if (!fs.existsSync(CONFIG)) {
    console.error(`FAIL  ${CONFIG} is missing`);
    return 1;
  }

  const lines = fs.readFileSync(CONFIG, 'utf8').split(/\r?\n/);
  const root = process.cwd();
  const supabaseDir = path.join(root, 'supabase');
  let failed = 0;
  let checked = 0;

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const match = trimmed.match(/^([a-z_]+)\s*=\s*"([^"]*)"/);
    if (!match) return;
    const [, key, value] = match;

    const fromRoot = path.resolve(root, value);
    let ok;
    let detail;

    if (ROOT_RELATIVE_KEYS.has(key)) {
      ok = fs.existsSync(fromRoot);
      detail = `resolves to ${fromRoot}`;
    } else if (EITHER_BASE_KEYS.has(key)) {
      const fromSupabase = path.resolve(supabaseDir, value);
      ok = fs.existsSync(fromRoot) || fs.existsSync(fromSupabase);
      detail = `resolves to neither ${fromRoot} nor ${fromSupabase}`;
    } else {
      return;
    }

    checked += 1;
    if (ok) {
      console.log(`ok    ${key} -> ${value}`);
      return;
    }

    failed += 1;
    console.error(`FAIL  ${CONFIG}:${i + 1} ${key} = "${value}"`);
    console.error(`      ${detail}.`);
    // The first person to read this is looking at a red CI log, not this file.
    if (ROOT_RELATIVE_KEYS.has(key) && value.startsWith('../')) {
      console.error(
        `      ${key} resolves from the PROJECT ROOT, not from supabase/, so a ` +
          `leading "../" climbs out of the repo. Try "./${value.replace(/^(\.\.\/)+/, '')}".`,
      );
    }
  });

  if (failed > 0) {
    console.error(`\n${failed} unresolvable path(s) in ${CONFIG}. supabase start would abort.`);
    return 1;
  }

  console.log(`\n${checked} config path(s) resolve. supabase start can load ${CONFIG}.`);
  return 0;
}

process.exit(main());
