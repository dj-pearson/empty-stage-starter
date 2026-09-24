import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import "@/i18n/appLocale";

type DayPart = "morning" | "afternoon" | "evening";

function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

/** First word of a display name, or null when there is nothing usable. */
function firstNameFrom(metadata: Record<string, unknown> | undefined | null): string | null {
  const raw = metadata?.full_name ?? metadata?.name;
  if (typeof raw !== "string") return null;
  const first = raw.trim().split(/\s+/)[0];
  return first ? first : null;
}

/**
 * The top row of /dashboard: "Good evening, Dana" and today's date.
 *
 * useAuth() carries only ids, so the name comes from the cached session
 * (getSession reads storage and resolves without a network trip). Until it
 * settles the row keeps its height with no heading, so the greeting never flips
 * from the nameless variant to the named one. There is no "Parent" fallback:
 * no name means the nameless greeting.
 */
export function HomeGreeting() {
  const { t, i18n } = useTranslation();
  const { userId } = useAuth();
  const [name, setName] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setName(firstNameFrom(data.session?.user?.user_metadata));
      })
      .catch(() => {
        if (active) setName(null);
      })
      .finally(() => {
        if (active) setSettled(true);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const now = new Date();
  const part = dayPart(now.getHours());
  const dateLine = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(now);
    } catch {
      return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(now);
    }
    // Re-format when the day or the language changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language, now.toDateString()]);

  const greeting = name
    ? t(`home.greeting.${part}`, { name, defaultValue: `Good ${part}, {{name}}` })
    : t(`home.greeting.${part}Nameless`, { defaultValue: `Good ${part}` });

  return (
    <div className="flex min-h-14 flex-col justify-center text-left">
      {settled ? (
        <h1 className="text-xl font-semibold leading-tight text-foreground">{greeting}</h1>
      ) : (
        <div className="h-7" aria-hidden="true" />
      )}
      <p className="text-sm text-muted-foreground">{dateLine}</p>
    </div>
  );
}
