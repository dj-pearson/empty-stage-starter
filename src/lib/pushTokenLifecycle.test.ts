import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Signing out has to stop push to the device.
 *
 * `push_tokens` rows were only ever written, never retired. A sign-out left
 * the row `is_active = true` against the departing account, and
 * `supabase/functions/process-notification-queue` selects exactly
 * `.eq('user_id', ...).eq('is_active', true)` -- so it kept pushing that
 * account's meal plan, grocery list and children's names to a device somebody
 * had signed out of. The only thing that ever corrected the row was a
 * different account signing in on the same device, which is the one case that
 * was already fine. Local reminders were the same story: daily topics are
 * `UNCalendarNotificationTrigger(repeats: true)` and nothing cancelled them.
 *
 * The second half is subtler. `registerPushToken` upserts, and an upsert only
 * writes the columns it names. With `is_active` absent from that payload,
 * deactivating on sign-out would have been permanent: signing back in would
 * leave the row inactive and push would never resume.
 *
 * These are source-contract assertions rather than behavioural ones. The
 * Swift side has no runtime here, and `expo-notifications` is not a declared
 * dependency of this repo, so neither module can be imported and driven. What
 * they do catch is the ordering and the columns going quietly wrong again.
 */

const ROOT = path.resolve(__dirname, '../..');
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');

const AUTH_VIEW_MODEL = read('ios/EatPal/EatPal/ViewModels/AuthViewModel.swift');
const NOTIFICATION_SERVICE = read('ios/EatPal/EatPal/Services/NotificationService.swift');
const MOBILE_NOTIFICATIONS = read('app/mobile/lib/notifications.ts');
const MOBILE_PROFILE = read('app/(tabs)/profile.tsx');
const QUEUE_SENDER = read('supabase/functions/process-notification-queue/index.ts');

describe('push token lifecycle', () => {
  it('is worth checking: the sender still gates on is_active', () => {
    // If this ever stops being true, flipping the flag stops helping and
    // every assertion below is theatre.
    expect(QUEUE_SENDER).toContain("from('push_tokens')");
    expect(QUEUE_SENDER).toContain("eq('is_active', true)");
  });

  describe('iOS (Swift)', () => {
    it('tears down notifications before the session goes away', () => {
      const signOut = AUTH_VIEW_MODEL.slice(
        AUTH_VIEW_MODEL.indexOf('func signOut() async throws'),
      ).slice(0, 800);
      const teardown = signOut.indexOf('NotificationService.shared.handleSignOut()');
      const session = signOut.indexOf('authService.signOut()');
      expect(teardown).toBeGreaterThan(-1);
      expect(session).toBeGreaterThan(-1);
      // Deactivating the row is an authenticated write; RLS scopes
      // push_tokens to auth.uid(). After signOut() there is no auth.uid().
      expect(teardown).toBeLessThan(session);
    });

    it('puts the notification state back when the sign-out itself fails', () => {
      // US-432's rule: a failed sign-out must not leave a half-torn-down
      // account. A still-signed-in user with silenced reminders is exactly
      // that.
      expect(AUTH_VIEW_MODEL).toContain('restoreAfterFailedSignOut()');
      expect(NOTIFICATION_SERVICE).toContain('func restoreAfterFailedSignOut() async');
    });

    it('deactivates only this device row, and clears local reminders', () => {
      expect(NOTIFICATION_SERVICE).toContain('is_active');
      // Scoped by token: signing out on the iPad must not silence the phone.
      expect(NOTIFICATION_SERVICE).toContain('.eq("token", value: token)');
      expect(NOTIFICATION_SERVICE).toContain('removeAllPendingNotificationRequests()');
      // Anything already delivered still shows the previous account's data.
      expect(NOTIFICATION_SERVICE).toContain('removeAllDeliveredNotifications()');
    });

    it('clears reminders after account deletion too', () => {
      expect(AUTH_VIEW_MODEL).toContain('clearLocalNotificationsAfterAccountDeletion()');
    });
  });

  describe('Expo', () => {
    it('deactivates before the session goes away', () => {
      const deactivate = MOBILE_PROFILE.indexOf('deactivatePushToken()');
      const session = MOBILE_PROFILE.indexOf('supabase.auth.signOut()');
      expect(deactivate).toBeGreaterThan(-1);
      expect(session).toBeGreaterThan(-1);
      expect(deactivate).toBeLessThan(session);
    });

    it('scopes the deactivation to this device token', () => {
      expect(MOBILE_NOTIFICATIONS).toContain('is_active: false');
      expect(MOBILE_NOTIFICATIONS).toContain(".eq('token', token)");
    });

    it('writes is_active on register so signing back in resumes push', () => {
      const upsert = MOBILE_NOTIFICATIONS.slice(
        MOBILE_NOTIFICATIONS.indexOf("from('push_tokens').upsert("),
      ).slice(0, 400);
      expect(upsert).toContain('is_active: true');
      expect(upsert).toContain("onConflict: 'token'");
    });
  });
});
