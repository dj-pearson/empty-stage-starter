import { describe, it, expect } from 'vitest';
import {
  isHouseholdMember,
  assertHouseholdMember,
  assertKidsAccessible,
} from '../../../functions/_shared/household';

/**
 * US-324: edge functions that accept a client-supplied householdId/kidIds must
 * verify the authenticated user actually belongs to that household (defense in
 * depth against IDOR / broken object-level authorization). These tests cover the
 * shared authorization helpers in functions/_shared/household.ts.
 */

interface MemberRow {
  household_id: string;
  user_id: string;
}

// Minimal supabase-client mock. The real client's query builder is chainable
// and thenable, resolving to `{ data, error }`; this mirrors only what the
// helpers use, resolving against the provided fixtures.
function mockClient(opts: {
  members?: MemberRow[];
  accessibleKidIds?: string[];
  failHouseholdQuery?: boolean;
  failKidsQuery?: boolean;
}) {
  const members = opts.members ?? [];
  const accessibleKids = opts.accessibleKidIds ?? [];

  return {
    from(table: string) {
      const eqs: Record<string, string> = {};
      let ins: string[] = [];

      const builder = {
        select: () => builder,
        eq: (column: string, value: string) => {
          eqs[column] = value;
          return builder;
        },
        in: (_column: string, values: readonly string[]) => {
          ins = [...values];
          return builder;
        },
        limit: () => builder,
        maybeSingle: () => {
          if (table === 'household_members') {
            if (opts.failHouseholdQuery) {
              return Promise.resolve({ data: null, error: { message: 'boom' } });
            }
            const match = members.find(
              (m) => m.household_id === eqs.household_id && m.user_id === eqs.user_id,
            );
            return Promise.resolve({
              data: match ? { user_id: match.user_id } : null,
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        // Thenable: awaiting the builder resolves the list query (kids lookup).
        then: (
          resolve: (value: { data: Array<{ id: string }> | null; error: unknown }) => unknown,
        ) => {
          if (table === 'kids' && opts.failKidsQuery) {
            return Promise.resolve({ data: null, error: { message: 'boom' } }).then(resolve);
          }
          const data = accessibleKids.filter((id) => ins.includes(id)).map((id) => ({ id }));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    },
  } as unknown as Parameters<typeof isHouseholdMember>[0];
}

const user = { id: 'user-1' };

describe('isHouseholdMember', () => {
  it('returns true when the user is a member of the household', async () => {
    const client = mockClient({
      members: [{ household_id: 'hh-1', user_id: 'user-1' }],
    });
    expect(await isHouseholdMember(client, 'user-1', 'hh-1')).toBe(true);
  });

  it('returns false when the user is not a member of the household', async () => {
    const client = mockClient({
      members: [{ household_id: 'hh-1', user_id: 'someone-else' }],
    });
    expect(await isHouseholdMember(client, 'user-1', 'hh-1')).toBe(false);
  });

  it('fails closed (returns false) when the membership query errors', async () => {
    const client = mockClient({ failHouseholdQuery: true });
    expect(await isHouseholdMember(client, 'user-1', 'hh-1')).toBe(false);
  });
});

describe('assertHouseholdMember', () => {
  it('returns null (allows) when no householdId is supplied', async () => {
    const client = mockClient({});
    expect(await assertHouseholdMember(client, user, null)).toBeNull();
    expect(await assertHouseholdMember(client, user, undefined)).toBeNull();
  });

  it('returns null (allows) for a household the user belongs to', async () => {
    const client = mockClient({
      members: [{ household_id: 'hh-1', user_id: 'user-1' }],
    });
    expect(await assertHouseholdMember(client, user, 'hh-1')).toBeNull();
  });

  it('returns a 403 Response when the user is not a member (cross-household IDOR)', async () => {
    const client = mockClient({
      members: [{ household_id: 'hh-2', user_id: 'attacker' }],
    });
    const res = await assertHouseholdMember(client, user, 'hh-2');
    expect(res).toBeInstanceOf(Response);
    expect(res?.status).toBe(403);
    const body = await res?.json();
    expect(body.error).toMatch(/not a member/i);
  });

  it('merges provided CORS headers into the 403 Response', async () => {
    const client = mockClient({ members: [] });
    const res = await assertHouseholdMember(client, user, 'hh-9', {
      'Access-Control-Allow-Origin': 'https://app.example.com',
    });
    expect(res?.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
  });
});

describe('assertKidsAccessible', () => {
  it('returns null (allows) when no kid ids are supplied', async () => {
    const client = mockClient({});
    expect(await assertKidsAccessible(client, [])).toBeNull();
  });

  it('returns null (allows) when every requested kid is accessible', async () => {
    const client = mockClient({ accessibleKidIds: ['kid-1', 'kid-2'] });
    expect(await assertKidsAccessible(client, ['kid-1', 'kid-2'])).toBeNull();
  });

  it('returns a 403 Response when a requested kid belongs to another household', async () => {
    const client = mockClient({ accessibleKidIds: ['kid-1'] });
    const res = await assertKidsAccessible(client, ['kid-1', 'kid-foreign']);
    expect(res).toBeInstanceOf(Response);
    expect(res?.status).toBe(403);
    const body = await res?.json();
    expect(body.error).toMatch(/do not belong to you/i);
  });

  it('returns a 500 Response when the kids query errors', async () => {
    const client = mockClient({ failKidsQuery: true });
    const res = await assertKidsAccessible(client, ['kid-1']);
    expect(res?.status).toBe(500);
  });

  it('deduplicates requested ids before comparing', async () => {
    const client = mockClient({ accessibleKidIds: ['kid-1'] });
    expect(await assertKidsAccessible(client, ['kid-1', 'kid-1'])).toBeNull();
  });
});
