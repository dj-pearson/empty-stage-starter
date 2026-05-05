import { useEffect, useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { checkFeatureLimit, type FeatureType } from "@/lib/featureLimits";
import { requestUpgradePrompt } from "@/lib/upgradePromptBus";

interface FeatureGateProps {
  feature: FeatureType;
  /** Human-readable feature name shown in the upgrade modal. */
  label: string;
  /** Pass-through children rendered when the user has access. */
  children: React.ReactNode;
}

type GateState = "checking" | "allowed" | "blocked";

/**
 * Gates a feature/route on a server-side plan check. While checking, renders nothing
 * (route already shows a Suspense fallback). When blocked, fires the global upgrade
 * modal once and renders an inline upgrade CTA so the page is never blank.
 */
export function FeatureGate({ feature, label, children }: FeatureGateProps) {
  const [state, setState] = useState<GateState>("checking");
  const [message, setMessage] = useState<string | undefined>();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    checkFeatureLimit(feature).then((result) => {
      if (cancelled) return;
      if (result.allowed) {
        setState("allowed");
      } else {
        setState("blocked");
        setMessage(result.message);
        requestUpgradePrompt({ feature: label, message: result.message });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [feature, label]);

  if (state === "checking") return null;
  if (state === "allowed") return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <div className="p-4 rounded-full bg-primary/10 mb-4">
        <Lock className="w-8 h-8 text-primary" />
      </div>
      <h2 className="text-2xl font-semibold mb-2">{label} is locked</h2>
      <p className="text-muted-foreground max-w-md mb-6">
        {message ?? `${label} is not available on your current plan.`}
      </p>
      <Button onClick={() => navigate("/pricing")}>
        <Sparkles className="w-4 h-4 mr-2" />
        View plans
      </Button>
    </div>
  );
}
