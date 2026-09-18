import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import {
  fetchPromotionCandidates,
  promoteCandidate,
  GENERIC_PROMOTION_MIN_HOUSEHOLDS,
  type PromotionCandidate,
} from "@/lib/genericPromotion";

/**
 * Foods enough separate families have independently typed to be worth adding
 * to the shared catalog (US-798).
 *
 * NOTHING HERE REACHES THE CATALOG WITHOUT A HUMAN. The frequency rule is a
 * filter on what an operator is shown, not an automatic promotion: a household
 * food row is private data, and "Grandma's casserole" or a row carrying a
 * child's name has to be caught by somebody reading it. Several unrelated
 * households typing the same words is a decent first filter; this screen is the
 * backstop.
 *
 * Reject is local and deliberate. There is no reject table: dismissing a
 * candidate hides it for this sitting, and it returns next time the queue is
 * opened. That is the honest behaviour for a list computed live from foods --
 * a persisted rejection would be a second piece of state to drift, which is
 * exactly what US-784 and US-785 are about.
 */
export function PromotionCandidateQueue() {
  const [candidates, setCandidates] = useState<PromotionCandidate[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCandidates(await fetchPromotionCandidates());
    } catch (error) {
      logger.error("Failed to load promotion candidates:", error);
      toast.error("Couldn't load the promotion queue", {
        description: "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAccept = async (candidate: PromotionCandidate) => {
    setPromoting(candidate.nameNormalized);
    try {
      await promoteCandidate(candidate);
      toast.success(`Added "${candidate.sampleName}" to the catalog`);
      setCandidates((prev) =>
        prev.filter((c) => c.nameNormalized !== candidate.nameNormalized)
      );
    } catch (error) {
      logger.error("Failed to promote candidate:", error);
      toast.error("Couldn't add that to the catalog", { description: "Please try again." });
    } finally {
      setPromoting(null);
    }
  };

  const visible = candidates.filter((c) => !dismissed.has(c.nameNormalized));

  if (loading) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">Loading promotion candidates...</p>
      </Card>
    );
  }

  if (visible.length === 0) {
    return (
      <Card className="p-4">
        <h3 className="font-semibold text-sm">Catalog candidates</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Nothing waiting. A food appears here once at least{" "}
          {GENERIC_PROMOTION_MIN_HOUSEHOLDS} separate households have typed it and it
          has no catalog match.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-semibold text-sm">Catalog candidates</h3>
        <p className="text-xs text-muted-foreground">
          Typed by at least {GENERIC_PROMOTION_MIN_HOUSEHOLDS} separate households
        </p>
      </div>

      <ul className="mt-3 divide-y">
        {visible.map((candidate) => (
          <li
            key={candidate.nameNormalized}
            className="flex items-center gap-3 py-2.5"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{candidate.sampleName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {candidate.nameNormalized}
              </p>
            </div>
            <Badge variant="outline" className="shrink-0 text-[11px] font-normal">
              {candidate.householdCount} households
            </Badge>
            <div className="flex gap-1.5 shrink-0">
              <Button
                size="sm"
                onClick={() => handleAccept(candidate)}
                disabled={promoting === candidate.nameNormalized}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setDismissed((prev) => new Set(prev).add(candidate.nameNormalized))
                }
                aria-label={`Reject ${candidate.sampleName}`}
              >
                Reject
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
