import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Badges are not a device detail (US-871).
 *
 * `BadgeService` kept earned badge ids in `UserDefaults` under
 * `badges.<kidId>.earned` from US-241 onward. That storage does not survive a
 * reinstall, does not move to a new phone, and is invisible to the second
 * parent -- who opens the grid and sees nothing for a child who has earned
 * eight badges.
 *
 * The Swift suite covers the merge itself. What it cannot cover is the
 * regression where the server write quietly stops happening and everything
 * still passes, because UserDefaults keeps working exactly as it did. So this
 * reads the Swift and the migration together, the way
 * `offlineReplayCoverage.test.ts` reads `OfflineStore.swift`.
 */

const ROOT = path.resolve(__dirname, '..', '..');
const IOS = path.join(ROOT, 'ios', 'EatPal', 'EatPal');

const read = (...parts: string[]) => readFileSync(path.join(...parts), 'utf8');

const SERVICE = read(IOS, 'Services', 'BadgeService.swift');
const SYNC = read(IOS, 'Services', 'BadgeSync.swift');
const STORE = read(IOS, 'Services', 'OfflineStore.swift');
const DATA = read(IOS, 'Services', 'DataService.swift');
const APP_STATE = read(IOS, 'App', 'AppState.swift');
const MIGRATION = read(
  ROOT,
  'supabase',
  'migrations',
  '20260919000001_kid_badges.sql',
);

describe('badge durability (US-871)', () => {
  it('writes an earn to the server, not only to UserDefaults', () => {
    // AC1/AC2. The failure this guards against is silent: drop the upload and
    // every existing test still passes, because the local cache is unchanged.
    const start = SERVICE.indexOf('for badge in newlyEarned {');
    expect(start, 'the persist loop moved').toBeGreaterThan(-1);
    const afterPersist = SERVICE.slice(start, start + 800);

    expect(afterPersist, 'an earn no longer reaches the server').toContain('upload(badgeIds:');
    expect(SERVICE).toContain('DataService.shared.insertKidBadge(row)');
  });

  it('queues a failed write instead of dropping it', () => {
    // AC2: "written through the offline queue like every other iOS write".
    expect(SERVICE).toContain('OfflineStore.shared.enqueueInsert(');
    expect(SERVICE).toContain('table: .kidBadges');
    expect(STORE).toContain('case kidBadges = "kid_badges"');
    expect(STORE, 'the replay has no arm for kid_badges').toContain(
      'case Table.kidBadges.rawValue:',
    );
    // Deduped on the earn, not on the row id: both parents' phones evaluate
    // the same badge from the same logged meal.
    expect(STORE).toContain('onConflict: "kid_id,badge_id"');
    expect(DATA).toContain('onConflict: "kid_id,badge_id"');
  });

  it('seeds from the server on launch', () => {
    // AC2. Without this the new phone is still empty; the upload alone only
    // helps the phone that already had them.
    expect(SERVICE).toContain('func seedFromServer(kidIds: [String]) async');
    expect(APP_STATE, 'nothing calls seedFromServer').toContain(
      'BadgeService.shared.seedFromServer(kidIds:',
    );
  });

  it('merges rather than letting the server replace the cache', () => {
    // The one place badges deviate from the load-precedence contract, and the
    // reason is in BadgeSync's own header: every account that predates the
    // table has its badges only in UserDefaults, so a replace would clear the
    // grid on the first launch of the build that added durability.
    expect(SYNC).toContain('static func plan(local: Set<String>, server: Set<String>)');
    expect(SYNC).toContain('download: server.subtracting(local).sorted()');
    expect(SYNC).toContain('upload: local.subtracting(server).sorted()');
    expect(SERVICE).toContain('BadgeSync.plan(');
  });

  it('keeps UserDefaults as the offline cache rather than deleting it', () => {
    // AC1 says stop using it as the ONLY home, not stop using it. It is what
    // makes the grid render offline and on launch before the fetch returns.
    expect(SERVICE).toContain('UserDefaults.standard.stringArray(forKey: listKey)');
    expect(SERVICE, 'the cache key changed, so existing devices lose their badges').toContain(
      '"badges.\\(kidId).earned"',
    );
  });

  it('adds the table additively with RLS', () => {
    // AC3. Checked here as well as by check-migration-safety.sh, because the
    // thing that matters is which shape it took, not that a gate ran.
    expect(MIGRATION).toContain('CREATE TABLE IF NOT EXISTS public.kid_badges');
    expect(MIGRATION).toContain('ALTER TABLE public.kid_badges ENABLE ROW LEVEL SECURITY');
    expect(MIGRATION).toContain('CREATE UNIQUE INDEX IF NOT EXISTS kid_badges_kid_badge_unique');
    // No ALTER or DROP on anything a shipped build reads.
    expect(MIGRATION).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(MIGRATION).not.toMatch(/ALTER TABLE public\.(kids|foods|plan_entries)\b/i);
  });

  it('leaves an earn append-only', () => {
    // There is nothing about "this child earned this on this day" a later
    // write should revise, and no UPDATE policy means RLS refuses it.
    expect(MIGRATION).not.toMatch(/CREATE POLICY[^;]*kid_badges[^;]*FOR UPDATE/is);
    expect(MIGRATION).toContain('FOR SELECT');
    expect(MIGRATION).toContain('FOR INSERT');
  });

  it('lets the second parent see them', () => {
    // The household_members join is the whole of AC1's "invisible to a second
    // parent". Without it the policy is owner-only and the partner's grid is
    // empty for a child they feed every day.
    const selectPolicy = MIGRATION.slice(
      MIGRATION.indexOf('CREATE POLICY "Members view kid badges"'),
      MIGRATION.indexOf('CREATE POLICY "Members insert kid badges"'),
    );
    expect(selectPolicy).toContain('public.household_members hm');
    expect(selectPolicy).toContain('hm.user_id = auth.uid()');
  });

  it('keeps the badge ids the catalog already ships', () => {
    // AC4: a device that already holds them has to recognise what it reads
    // back, so nothing may rename a case's raw value.
    expect(SERVICE).toContain('enum Badge: String, CaseIterable, Identifiable');
    expect(SERVICE).toContain('var id: String { rawValue }');
  });
});
