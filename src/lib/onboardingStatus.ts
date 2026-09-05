import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

/**
 * Whether this user has finished onboarding (US-770).
 *
 * profiles.onboarding_completed is the SAME column iOS US-708 writes, which is
 * the whole point: web and iOS have to mean the same thing by "finished", or a
 * parent who set up on the phone gets asked to set up again on the laptop.
 *
 * The local key is a CACHE of that column, seeded from it, never the authority.
 * It exists so the redirect guard does not have to await a round trip before
 * deciding whether to render the dashboard -- a full-page flash on every load
 * is worse than being briefly wrong about a first-run user.
 */
export const ONBOARDING_LOCAL_KEY = "eatpal_onboarding_completed";

/** Who the parent said they are planning for. US-740 owns persisting this. */
export type PlanningFor = "just_me" | "me_and_partner" | "my_family";

export function readLocalOnboardingFlag(): boolean | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_LOCAL_KEY);
    return raw === null ? null : raw === "true";
  } catch {
    // Private mode, blocked storage. Not knowing is a valid answer here; the
    // caller falls back to asking the server.
    return null;
  }
}

export function writeLocalOnboardingFlag(done: boolean): void {
  try {
    localStorage.setItem(ONBOARDING_LOCAL_KEY, String(done));
  } catch {
    // A cache that cannot be written is just a cache miss next time.
  }
}

/** The server's answer, and it seeds the local cache. Null = unknown. */
export async function fetchOnboardingCompleted(): Promise<boolean | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", user.id)
      .maybeSingle();

    if (error || !data) return null;

    const done = data.onboarding_completed === true;
    writeLocalOnboardingFlag(done);
    return done;
  } catch (error) {
    logger.error("Could not read onboarding status:", error);
    return null;
  }
}

/**
 * Record that onboarding is over, on the server first.
 *
 * Returns false when the write failed, so a caller can decline to cache a
 * success that did not happen -- the alternative is a user this device thinks
 * is set up and every other device asks again.
 */
export async function markOnboardingCompleted(): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", user.id);

    if (error) {
      logger.error("Could not save onboarding status:", error);
      return false;
    }

    writeLocalOnboardingFlag(true);
    return true;
  } catch (error) {
    logger.error("Could not save onboarding status:", error);
    return false;
  }
}
