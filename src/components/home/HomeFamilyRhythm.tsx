import { memo, useMemo } from "react";
import { useKids, usePlan } from "@/contexts/AppContext";
import { useKidsProgressSummary } from "@/hooks/useKidsProgressSummary";
import { useTodayKey } from "@/hooks/useTonightPlan";
import { FamilyRhythmCard } from "@/components/family/FamilyRhythmCard";

/**
 * The logging streak and this week's household meter on the home screen.
 * Reads every attempt for every child (the streak and last week's "new foods"
 * both need the whole history) and refetches when a result is logged here.
 */
export const HomeFamilyRhythm = memo(function HomeFamilyRhythm() {
  const { kids } = useKids();
  const { planEntries } = usePlan();
  const todayKey = useTodayKey();

  const kidIds = useMemo(() => kids.map((k) => k.id), [kids]);
  const refreshKey = useMemo(() => planEntries.filter((e) => e.result != null).length, [planEntries]);
  const opts = useMemo(() => ({ since: "all" as const, refreshKey }), [refreshKey]);
  const { attempts, loading } = useKidsProgressSummary(kidIds, opts);

  if (kids.length === 0) return null;
  return (
    <FamilyRhythmCard
      attempts={attempts}
      todayIso={todayKey}
      loading={loading}
      milestonesHref="/dashboard/progress?section=family"
    />
  );
});
