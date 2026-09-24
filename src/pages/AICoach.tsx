import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { AIMealCoach } from "@/components/AIMealCoach";
import { FeatureGate, type FeatureGateState } from "@/components/FeatureGate";

/** The remaining-uses line: shown when the plan has a numeric daily limit, and always once today's quota is spent. */
function UsageLine({ gate }: { gate: FeatureGateState | null }) {
  const { t } = useTranslation();
  if (!gate) return null;
  // Exhausted always shows the upgrade path, even when the page's own check
  // never learned a numeric limit (it fails open) and the server's 402 was the
  // first word on it.
  if (!gate.exhausted && (gate.limit === null || gate.limit <= 0)) return null;
  const remaining = gate.exhausted || gate.limit === null ? 0 : Math.max(0, gate.limit - (gate.current ?? 0));

  if (remaining === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="ai-coach-usage">
        {t("aiCoach.usage.none", { defaultValue: "No questions left today. Your past answers are still here." })}{" "}
        <Link to="/pricing" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("aiCoach.limit.seePlans", { defaultValue: "See plans" })}
        </Link>
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground" data-testid="ai-coach-usage">
      {t("aiCoach.usage.remaining", {
        count: remaining,
        limit: gate.limit,
        defaultValue: "{{count}} of {{limit}} questions left today",
      })}
    </p>
  );
}

export default function AICoach() {
  const { t } = useTranslation();
  const [gate, setGate] = useState<FeatureGateState | null>(null);
  const title = t("aiCoach.title", { defaultValue: "AI Feeding Coach" });

  return (
    <>
      <Helmet>
        <title>{t("aiCoach.meta.title", { defaultValue: "AI Feeding Coach - EatPal" })}</title>
        <meta
          name="description"
          content={t("aiCoach.meta.description", {
            defaultValue:
              "Practical, judgment-free ideas for picky eating, based on your family's safe foods and allergies. Not medical advice.",
          })}
        />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="flex flex-col h-[calc(100dvh-4rem)] max-w-5xl mx-auto px-4 py-3 md:py-6">
        <header className="flex-none mb-3 space-y-0.5">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {t("aiCoach.subtitle", {
              defaultValue: "Ideas for picky eating, built from your child's safe foods and allergies. Not medical advice.",
            })}
          </p>
          <UsageLine gate={gate} />
        </header>
        <div className="flex-1 min-h-0">
          <FeatureGate
            feature="ai_coach"
            label={title}
            headingLevel={2}
            allowWhenExhausted
            onStateChange={setGate}
          >
            {(g) => <AIMealCoach exhausted={g.exhausted} onLimitReached={g.markExhausted} />}
          </FeatureGate>
        </div>
      </div>
    </>
  );
}
