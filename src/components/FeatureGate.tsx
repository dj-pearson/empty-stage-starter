import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { checkFeatureLimit, type FeatureLimitResult, type FeatureType } from "@/lib/featureLimits";
import { requestUpgradePrompt } from "@/lib/upgradePromptBus";

/** What a function child receives. */
export interface FeatureGateState {
  /** The plan allows the feature but today's (or this month's) quota is used up. */
  exhausted: boolean;
  limit: number | null;
  current: number | null;
  /** Call when the server refuses a use for quota, so the gate reflects it without a re-check. */
  markExhausted: () => void;
}

interface FeatureGateProps {
  feature: FeatureType;
  /** Human-readable feature name shown in the lock screen and upgrade modal. */
  label: string;
  /** Rendered when the user has access. A function receives the gate state. */
  children: React.ReactNode | ((gate: FeatureGateState) => React.ReactNode);
  /**
   * Render children (with exhausted=true) when the plan includes the feature but
   * the usage quota is spent, instead of the lock screen. Read-only access to
   * past results beats a padlock over them.
   */
  allowWhenExhausted?: boolean;
  /**
   * Heading level of the lock screen title. 1 when the gate is the whole page
   * (FoodChaining); 2 when the page renders its own h1 above it (AICoach,
   * MealBuilder).
   */
  headingLevel?: 1 | 2;
  /** Notified with the latest gate state, e.g. so a page header can show remaining uses. */
  onStateChange?: (gate: FeatureGateState | null) => void;
}

type GateState = "checking" | "allowed" | "exhausted" | "blocked";

/** Minimum gap between focus/visibility re-checks while blocked. */
export const FEATURE_GATE_RECHECK_MS = 30_000;

function classify(result: FeatureLimitResult, allowWhenExhausted: boolean): GateState {
  if (result.allowed) return "allowed";
  // limit > 0 means the plan has the feature and the quota ran out. limit 0 or
  // missing means the plan does not include it at all.
  if (allowWhenExhausted && typeof result.limit === "number" && result.limit > 0) return "exhausted";
  return "blocked";
}

/**
 * Gates a feature/route on a server-side plan check. While checking, renders a
 * skeleton. When blocked, fires the global upgrade modal once and renders an
 * inline upgrade CTA so the page is never blank. While blocked it re-checks on
 * window focus / tab visibility (throttled), so a user who upgrades in another
 * tab gets in without a reload.
 */
export function FeatureGate({
  feature,
  label,
  children,
  allowWhenExhausted = false,
  headingLevel = 1,
  onStateChange,
}: FeatureGateProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<GateState>("checking");
  const [result, setResult] = useState<FeatureLimitResult | null>(null);
  const navigate = useNavigate();
  const lastCheckRef = useRef(0);
  const promptedRef = useRef(false);

  // Initial check.
  useEffect(() => {
    let cancelled = false;
    promptedRef.current = false;
    setState("checking");
    lastCheckRef.current = Date.now();
    checkFeatureLimit(feature).then((next) => {
      if (cancelled) return;
      const nextState = classify(next, allowWhenExhausted);
      setResult(next);
      setState(nextState);
      if (nextState === "blocked" && !promptedRef.current) {
        promptedRef.current = true;
        requestUpgradePrompt({ feature: label, message: next.message });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [feature, label, allowWhenExhausted]);

  // Re-check while blocked, on focus / visibility, throttled.
  useEffect(() => {
    if (state !== "blocked") return;
    let cancelled = false;
    const recheck = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastCheckRef.current < FEATURE_GATE_RECHECK_MS) return;
      lastCheckRef.current = now;
      checkFeatureLimit(feature).then((next) => {
        if (cancelled) return;
        setResult(next);
        setState(classify(next, allowWhenExhausted));
      });
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [state, feature, allowWhenExhausted]);

  const markExhausted = useCallback(() => {
    setResult((prev) => {
      const limit = typeof prev?.limit === "number" ? prev.limit : null;
      return { ...(prev ?? {}), allowed: false, limit, current: limit ?? prev?.current };
    });
    setState((prev) => (prev === "allowed" && allowWhenExhausted ? "exhausted" : prev));
  }, [allowWhenExhausted]);

  const gate: FeatureGateState | null =
    state === "allowed" || state === "exhausted"
      ? {
          exhausted: state === "exhausted",
          limit: typeof result?.limit === "number" ? result.limit : null,
          current: typeof result?.current === "number" ? result.current : null,
          markExhausted,
        }
      : null;

  const gateExhausted = gate?.exhausted;
  const gateLimit = gate?.limit;
  const gateCurrent = gate?.current;
  useEffect(() => {
    if (!onStateChange) return;
    onStateChange(
      gateExhausted === undefined
        ? null
        : { exhausted: gateExhausted, limit: gateLimit ?? null, current: gateCurrent ?? null, markExhausted },
    );
  }, [onStateChange, gateExhausted, gateLimit, gateCurrent, markExhausted]);

  if (state === "checking") {
    return (
      <div aria-busy="true" aria-live="polite" className="flex flex-col gap-3 py-4" data-testid="feature-gate-checking">
        <Skeleton className="h-10 w-full motion-reduce:animate-none" />
        <Skeleton className="h-40 w-full motion-reduce:animate-none" />
        <Skeleton className="h-12 w-full motion-reduce:animate-none" />
      </div>
    );
  }

  if (gate) {
    return <>{typeof children === "function" ? children(gate) : children}</>;
  }

  const Heading = headingLevel === 2 ? "h2" : "h1";

  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <div className="p-4 rounded-full bg-primary/10 mb-4">
        <Lock className="w-8 h-8 text-primary" aria-hidden="true" />
      </div>
      {/*
        US-860: h1 by default, because when this renders it IS the page.
        FoodChaining wraps its entire body in this gate and has no heading of
        its own. AICoach and MealBuilder render their own h1 above the gate, so
        they pass headingLevel={2}.
      */}
      <Heading className="text-2xl font-semibold mb-2">
        {t("featureGate.locked", { label, defaultValue: "{{label}} is locked" })}
      </Heading>
      <p className="text-muted-foreground max-w-md mb-6">
        {result?.message ??
          t("featureGate.notAvailable", {
            label,
            defaultValue: "{{label}} is not available on your current plan.",
          })}
      </p>
      <Button onClick={() => navigate("/pricing")}>
        <Sparkles className="w-4 h-4 mr-2" aria-hidden="true" />
        {t("featureGate.viewPlans", { defaultValue: "View plans" })}
      </Button>
    </div>
  );
}
