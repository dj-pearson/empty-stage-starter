import { useEffect, useState } from "react";
import { UpgradeDialog } from "./UpgradeDialog";
import { subscribeUpgradePrompt } from "@/lib/upgradePromptBus";

export function UpgradePromptHost() {
  const [open, setOpen] = useState(false);
  const [feature, setFeature] = useState("");
  const [message, setMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    return subscribeUpgradePrompt((request) => {
      setFeature(request.feature);
      setMessage(request.message);
      setOpen(true);
    });
  }, []);

  return (
    <UpgradeDialog
      open={open}
      onOpenChange={setOpen}
      feature={feature}
      message={message}
    />
  );
}
