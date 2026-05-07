import { Platform } from 'react-native';
import { supabase } from '@/integrations/supabase/client.mobile';

/**
 * US-126: push notification setup for mobile.
 *
 * The expo-notifications plugin is wired in `app.config.js`. This file is
 * the runtime side: request permission on first launch, fetch the Expo
 * push token, and register it with Supabase (`push_tokens` table) so the
 * server can target the device. Foreground notifications get a default
 * banner; background/killed notifications are handled by Expo's native
 * runtime — we add a tap-handler that routes via expo-router deep links.
 *
 * **Web is a no-op** — push delivery on web uses the existing service-worker
 * path, not expo-notifications.
 *
 * Categories the server is expected to set (in `data.category`):
 *   - meal_reminder  → eatpal://meals/<date>
 *   - list_update    → eatpal://lists/<id>
 *   - plan_ready     → eatpal://meals/<date>
 *
 * The mapping is enforced here so the server / function side just sends
 * `data: { category, ... }` plus the route-specific id.
 */

export interface PushPermissionResult {
  granted: boolean;
  reason?: 'denied' | 'unsupported' | 'error';
}

export async function requestPushPermission(): Promise<PushPermissionResult> {
  if (Platform.OS === 'web') return { granted: false, reason: 'unsupported' };
  try {
    const Notifications = await import('expo-notifications').catch(() => null);
    if (!Notifications) return { granted: false, reason: 'unsupported' };

    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted) return { granted: true };
    const ask = await Notifications.requestPermissionsAsync();
    return ask.granted ? { granted: true } : { granted: false, reason: 'denied' };
  } catch (err) {
    console.warn('[push] permission request failed:', err);
    return { granted: false, reason: 'error' };
  }
}

export async function registerPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const Notifications = await import('expo-notifications').catch(() => null);
    if (!Notifications) return null;

    const tokenResult = await Notifications.getExpoPushTokenAsync();
    const token = tokenResult?.data ?? null;
    if (!token) return null;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return token; // Token is valid; just no signed-in user yet.

    // Upsert (user_id, token) so the same device on multiple sign-ins
    // doesn't pile up duplicate rows. The `push_tokens` schema is expected
    // to include columns: user_id, token, platform, updated_at.
    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: user.id,
        token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    );
    if (error) {
      console.warn('[push] token registration failed:', error.message);
    }
    return token;
  } catch (err) {
    console.warn('[push] token fetch failed:', err);
    return null;
  }
}

/**
 * Map the `data.category` field on an incoming notification to a deep link.
 * Returns `null` for unknown categories — caller should ignore.
 */
export function deepLinkForNotification(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const category = typeof d.category === 'string' ? d.category : null;
  if (!category) return null;

  switch (category) {
    case 'meal_reminder':
    case 'plan_ready': {
      const date = typeof d.date === 'string' ? d.date : '';
      return date ? `eatpal://meals/${date}` : 'eatpal://meals';
    }
    case 'list_update': {
      const id = typeof d.list_id === 'string' ? d.list_id : '';
      return id ? `eatpal://lists/${id}` : 'eatpal://lists';
    }
    default:
      return null;
  }
}
