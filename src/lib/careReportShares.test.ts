import { describe, it, expect, vi, beforeEach } from 'vitest';

const insert = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      insert: (row: unknown) => {
        insert(row);
        return {
          select: () => ({
            single: async () => ({
              data: {
                id: 'share-1',
                token: 't'.repeat(64),
                label: 'Therapist',
                created_at: '2026-09-26T10:00:00Z',
                expires_at: '2026-10-26T09:59:00Z',
                revoked_at: null,
                view_count: 0,
                last_viewed_at: null,
              },
              error: null,
            }),
          }),
        };
      },
    }),
  },
}));

import { buildCareReport } from './careReport';
import {
  CARE_SHARE_CONSENT_VERSION,
  buildCareShareUrl,
  careShareState,
  createCareShare,
} from './careReportShares';

const report = buildCareReport({
  kidFirstName: 'Sam',
  from: '2026-09-01',
  to: '2026-09-30',
  attempts: [],
  ladderRows: [],
  foodNames: {},
  safeFoodNames: ['Pasta'],
  includeNotes: false,
});

beforeEach(() => insert.mockReset());

describe('careShareState', () => {
  const now = new Date('2026-09-26T12:00:00Z');
  it('is revoked, expired or live, in that order', () => {
    expect(careShareState({ revokedAt: '2026-09-20T00:00:00Z', expiresAt: '2026-12-01T00:00:00Z' }, now)).toBe('revoked');
    expect(careShareState({ revokedAt: null, expiresAt: '2026-09-26T11:59:59Z' }, now)).toBe('expired');
    expect(careShareState({ revokedAt: null, expiresAt: '2026-09-27T00:00:00Z' }, now)).toBe('live');
  });
});

describe('buildCareShareUrl', () => {
  it('points at /care/<token>', () => {
    expect(buildCareShareUrl('abc', 'https://tryeatpal.com')).toBe('https://tryeatpal.com/care/abc');
  });
});

describe('createCareShare', () => {
  it('sends only the member-writable columns, with the consent version and an expiry inside the cap', async () => {
    const now = new Date('2026-09-26T10:00:00Z');
    const share = await createCareShare({
      householdId: 'hh-1',
      kidId: 'kid-1',
      report,
      label: '  Therapist  ',
      expiresInDays: 90,
      now,
    });
    expect(share.token).toHaveLength(64);
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual(
      ['consent_version', 'expires_at', 'household_id', 'kid_id', 'label', 'report'].sort(),
    );
    expect(row.consent_version).toBe(CARE_SHARE_CONSENT_VERSION);
    expect(row.label).toBe('Therapist');
    const expires = Date.parse(row.expires_at as string);
    expect(expires).toBeLessThan(now.getTime() + 90 * 86_400_000);
    expect(expires).toBeGreaterThan(now.getTime() + 89 * 86_400_000);
  });

  it('stores an empty label as null', async () => {
    await createCareShare({ householdId: 'hh-1', kidId: 'kid-1', report, label: '   ', expiresInDays: 7 });
    expect((insert.mock.calls[0][0] as Record<string, unknown>).label).toBeNull();
  });
});
