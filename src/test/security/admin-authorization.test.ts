import { describe, it, expect } from 'vitest';
import { isAdmin, assertAdmin } from '../../../functions/_shared/admin';

/**
 * US-327: content-generation edge functions (generate-social-content,
 * generate-blog-content) must be restricted to admins. The shared
 * functions/_shared/admin.ts helpers verify the `admin` role server-side against
 * the user_roles table and FAIL CLOSED (deny on any query error). These tests
 * cover that helper. The "expired/forged token" half of US-327 is enforced by
 * authenticateRequest -> auth.getUser() (functions/_shared/auth.ts), already
 * covered by the existing auth path; here we focus on the role gate.
 */

type RoleRow = { user_id: string; role: string };

// Minimal supabase-client mock. The real client's query builder is chainable and
// thenable; this mirrors only the `.from().select().eq().eq().maybeSingle()`
// chain that isAdmin uses, resolving against the provided fixtures.
function mockClient(opts: {
  roles?: RoleRow[];
  failQuery?: boolean;
  throwQuery?: boolean;
}) {
  const roles = opts.roles ?? [];

  return {
    from(table: string) {
      const eqs: Record<string, string> = {};
      const builder = {
        select: () => builder,
        eq: (column: string, value: string) => {
          eqs[column] = value;
          return builder;
        },
        maybeSingle: () => {
          if (opts.throwQuery) {
            throw new Error('connection reset');
          }
          if (table === 'user_roles') {
            if (opts.failQuery) {
              return Promise.resolve({ data: null, error: { message: 'boom' } });
            }
            const match = roles.find(
              (r) => r.user_id === eqs.user_id && r.role === eqs.role,
            );
            return Promise.resolve({
              data: match ? { role: match.role } : null,
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  } as unknown as Parameters<typeof isAdmin>[0];
}

const adminUser = { id: 'admin-1' };
const normalUser = { id: 'user-2' };

describe('isAdmin', () => {
  it('returns true when the user has an admin role row', async () => {
    const client = mockClient({ roles: [{ user_id: 'admin-1', role: 'admin' }] });
    expect(await isAdmin(client, 'admin-1')).toBe(true);
  });

  it('returns false when the user has no admin role row', async () => {
    const client = mockClient({ roles: [{ user_id: 'user-2', role: 'user' }] });
    expect(await isAdmin(client, 'user-2')).toBe(false);
  });

  it('fails closed (false) on a query error', async () => {
    const client = mockClient({ failQuery: true });
    expect(await isAdmin(client, 'admin-1')).toBe(false);
  });

  it('fails closed (false) when the query throws', async () => {
    const client = mockClient({ throwQuery: true });
    expect(await isAdmin(client, 'admin-1')).toBe(false);
  });
});

describe('assertAdmin', () => {
  it('returns null (allows) when the user is an admin', async () => {
    const client = mockClient({ roles: [{ user_id: 'admin-1', role: 'admin' }] });
    expect(await assertAdmin(client, adminUser)).toBeNull();
  });

  it('returns a 403 Response when the user is not an admin', async () => {
    const client = mockClient({ roles: [] });
    const res = await assertAdmin(client, normalUser);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.error).toMatch(/admin role required/i);
  });

  it('returns a 403 Response (fail closed) when the role lookup errors', async () => {
    const client = mockClient({ failQuery: true });
    const res = await assertAdmin(client, adminUser);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it('propagates CORS headers onto the 403 Response', async () => {
    const client = mockClient({ roles: [] });
    const res = await assertAdmin(client, normalUser, {
      'Access-Control-Allow-Origin': 'https://app.example.com',
    });
    expect(res!.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://app.example.com',
    );
    expect(res!.headers.get('Content-Type')).toBe('application/json');
  });
});
