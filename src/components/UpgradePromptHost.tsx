import { lazy, Suspense, useEffect, useState } from "react";
import { subscribeUpgradePrompt } from "@/lib/upgradePromptBus";

// Lazy: this host sits in the app shell, and UpgradeDialog pulls in the
// page-scoped copy (appLocale) and the billing-source lookup. Loaded on the
// first prompt, then kept mounted so closing still animates.
const UpgradeDialog = lazy(() => import("./UpgradeDialog").then((m) => ({ default: m.UpgradeDialog })));

export function UpgradePromptHost() {
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  const [feature, setFeature] = useState("");
  const [message, setMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    return subscribeUpgradePrompt((request) => {
      setFeature(request.feature);
      setMessage(request.message);
      setRequested(true);
      setOpen(true);
    });
  }, []);

  if (!requested) return null;

  return (
    <Suspense fallback={null}>
      <UpgradeDialog
        open={open}
        onOpenChange={setOpen}
        feature={feature}
        message={message}
      />
    </Suspense>
  );
}
