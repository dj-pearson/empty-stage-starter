import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * US-852 AC4: drive `registerPushToken` and `deactivatePushToken`, rather than
 * reading their source.
 *
 * `pushTokenLifecycle.test.ts` asserts on source text, and says in its own
 * header why: `expo-notifications` is not a declared dependency, so the module
 * "cannot be imported and driven". That header was right, and a module-factory
 * mock does not get around it -- a bundler resolves the import specifier at
 * transform time, before any mock is consulted, so the file fails to load at
 * all. What makes this suite possible is a seam in `notifications.ts` itself:
 * the dynamic import lives behind a swappable loader, which is a better shape
 * anyway, because the module is genuinely optional there.
 *
 * Worth having because string matching cannot tell you that `is_active: true`
 * reaches the upsert, that the conflict target is the token, that a failed
 * write is reported rather than swallowed, or that a missing module now
 * answers differently from a platform that does not do push.
 *
 * The source-contract file stays. It covers the Swift half and the call
 * ORDERING in profile.tsx, neither of which is reachable from here.
 */

const upsert = vi.fn();
const update = vi.fn();
const eq = vi.fn();
const from = vi.fn();
const getUser = vi.fn();
const getExpoPushTokenAsync = vi.fn();
const getPermissionsAsync = vi.fn();
const requestPermissionsAsync = vi.fn();

/** Mutable so a case can run as web, iOS or android. */
const platform = { OS: 'ios' as string };

vi.mock('react-native', () => ({ Platform: platform }));

vi.mock('@/integrations/supabase/client.mobile', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
    auth: { getUser: () => getUser() },
  },
}));

/**
 * The module is not installed, and a module-factory mock is not enough on its
 * own: a bundler resolves the import specifier before any mock is consulted,
 * so the whole file fails to transform. `notifications.ts` therefore exposes a
 * loader seam, which is what this injects.
 */
const fakeNotifications = {
  getExpoPushTokenAsync: () => getExpoPushTokenAsync(),
  getPermissionsAsync: () => getPermissionsAsync(),
  requestPermissionsAsync: () => requestPermissionsAsync(),
};

async function loadModule() {
  return import('../../app/mobile/lib/notifications');
}

describe('push token behaviour (US-852 AC4)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    platform.OS = 'ios';

    upsert.mockResolvedValue({ error: null });
    eq.mockResolvedValue({ error: null });
    update.mockReturnValue({ eq: (...a: unknown[]) => eq(...a) });
    from.mockReturnValue({
      upsert: (...a: unknown[]) => upsert(...a),
      update: (...a: unknown[]) => update(...a),
    });
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' });

    const mod = await loadModule();
    mod.__resetMissingModuleReportForTests();
    mod.__setNotificationsLoaderForTests(async () => fakeNotifications);
  });

  afterEach(async () => {
    const mod = await loadModule();
    mod.__setNotificationsLoaderForTests(null);
    vi.restoreAllMocks();
  });

  // MARK: registerPushToken

  it('writes the row the server actually selects on', async () => {
    const { registerPushToken } = await loadModule();

    const token = await registerPushToken();

    expect(token).toBe('ExponentPushToken[abc]');
    expect(from).toHaveBeenCalledWith('push_tokens');

    const [row, options] = upsert.mock.calls[0];
    expect(row).toMatchObject({
      user_id: 'user-1',
      token: 'ExponentPushToken[abc]',
      platform: 'ios',
      is_active: true,
    });
    expect(typeof row.updated_at).toBe('string');
    // process-notification-queue selects .eq('user_id').eq('is_active', true),
    // so a row written without is_active would never be pushed to.
    expect(options).toEqual({ onConflict: 'token' });
  });

  it('re-registering after a sign-out makes the row active again', async () => {
    // The subtle half: an upsert only writes the columns it names. With
    // is_active absent, deactivating on sign-out would be permanent and push
    // would never resume for that device.
    const { registerPushToken, deactivatePushToken } = await loadModule();

    await deactivatePushToken();
    expect(update.mock.calls[0][0]).toMatchObject({ is_active: false });

    await registerPushToken();
    expect(upsert.mock.calls[0][0]).toMatchObject({ is_active: true });
  });

  it('carries the real platform, not a hardcoded one', async () => {
    platform.OS = 'android';
    const { registerPushToken } = await loadModule();

    await registerPushToken();

    expect(upsert.mock.calls[0][0]).toMatchObject({ platform: 'android' });
  });

  it('returns the token but writes nothing when nobody is signed in', async () => {
    // The token is valid; there is just no user to attribute it to yet.
    getUser.mockResolvedValue({ data: { user: null } });
    const { registerPushToken } = await loadModule();

    await expect(registerPushToken()).resolves.toBe('ExponentPushToken[abc]');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('reports a failed write instead of swallowing it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    upsert.mockResolvedValue({ error: { message: 'duplicate key' } });
    const { registerPushToken } = await loadModule();

    // Still returns the token: the device has one, the row just did not land.
    await expect(registerPushToken()).resolves.toBe('ExponentPushToken[abc]');
    expect(warn).toHaveBeenCalled();
  });

  it('is a no-op on web, which uses the service worker instead', async () => {
    platform.OS = 'web';
    const { registerPushToken } = await loadModule();

    await expect(registerPushToken()).resolves.toBeNull();
    expect(getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  // MARK: deactivatePushToken

  it('deactivates by token so the departing account stops being pushed to', async () => {
    const { deactivatePushToken } = await loadModule();

    await expect(deactivatePushToken()).resolves.toBe(true);

    expect(from).toHaveBeenCalledWith('push_tokens');
    expect(update.mock.calls[0][0]).toMatchObject({ is_active: false });
    // Scoped to this device, not to the user: signing out on one phone must
    // not silence the other one.
    expect(eq).toHaveBeenCalledWith('token', 'ExponentPushToken[abc]');
  });

  it('answers false when the update fails, so a caller can restore', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    eq.mockResolvedValue({ error: { message: 'rls denied' } });
    const { deactivatePushToken } = await loadModule();

    await expect(deactivatePushToken()).resolves.toBe(false);
  });

  it('answers false rather than throwing when there is no token to retire', async () => {
    getExpoPushTokenAsync.mockResolvedValue({ data: null });
    const { deactivatePushToken } = await loadModule();

    await expect(deactivatePushToken()).resolves.toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  // MARK: AC3 -- a missing module is a build problem, not a platform fact

  it('tells a missing module apart from a platform that does not do push', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mod = await loadModule();

    // Web: a platform fact. Push goes through the service worker instead.
    platform.OS = 'web';
    await expect(mod.requestPushPermission()).resolves.toEqual({
      granted: false,
      reason: 'unsupported',
    });
    expect(error).not.toHaveBeenCalled();

    // Native with the module absent: a build problem. This is the real state
    // of every Expo build today, and it used to report the same word as web,
    // which is exactly why nobody noticed push was inert.
    platform.OS = 'ios';
    mod.__setNotificationsLoaderForTests(() => {
      throw new Error("Cannot find module 'expo-notifications'");
    });

    await expect(mod.requestPushPermission()).resolves.toEqual({
      granted: false,
      reason: 'unavailable',
    });
    expect(error, 'a missing module was swallowed again').toHaveBeenCalled();
    expect(String(error.mock.calls[0][0])).toContain('expo-notifications');
  });

  it('reports the missing module once, not on every call', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mod = await loadModule();
    mod.__setNotificationsLoaderForTests(() => {
      throw new Error("Cannot find module 'expo-notifications'");
    });

    await mod.requestPushPermission();
    await mod.registerPushToken();
    await mod.deactivatePushToken();

    // Three call sites share the report. Logging per call would bury it.
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('a missing module still fails closed on the two write paths', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const mod = await loadModule();
    mod.__setNotificationsLoaderForTests(() => {
      throw new Error("Cannot find module 'expo-notifications'");
    });

    await expect(mod.registerPushToken()).resolves.toBeNull();
    await expect(mod.deactivatePushToken()).resolves.toBe(false);
    expect(from, 'a build with no push module still touched push_tokens').not.toHaveBeenCalled();
  });

  it('grants when the OS already said yes, and asks when it has not', async () => {
    const { requestPushPermission } = await loadModule();

    getPermissionsAsync.mockResolvedValue({ granted: true });
    await expect(requestPushPermission()).resolves.toEqual({ granted: true });
    expect(requestPermissionsAsync).not.toHaveBeenCalled();

    getPermissionsAsync.mockResolvedValue({ granted: false });
    requestPermissionsAsync.mockResolvedValue({ granted: false });
    await expect(requestPushPermission()).resolves.toEqual({
      granted: false,
      reason: 'denied',
    });
    expect(requestPermissionsAsync).toHaveBeenCalled();
  });
});
