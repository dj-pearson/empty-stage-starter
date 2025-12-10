import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: string;
  message?: string;
}

export function UpgradeDialog({ open, onOpenChange, feature, message }: UpgradeDialogProps) {
  const navigate = useNavigate();

  const handleUpgrade = () => {
    onOpenChange(false);
    navigate("/pricing");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-full bg-primary/10">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <DialogTitle className="text-xl">Upgrade Required</DialogTitle>
          </div>
          <DialogDescription className="text-base">
            {message || `${feature} is not available on your current plan.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg bg-gradient-to-r from-primary/10 to-accent/10 p-4 border border-primary/20">
            <p className="text-sm font-medium mb-2">Unlock this feature by upgrading to:</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-primary" />
                Pro Plan - Starting at $14.99/month
              </li>
              <li className="flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-primary" />
                Family Plus - Starting at $24.99/month
              </li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Maybe Later
            </Button>
            <Button onClick={handleUpgrade} className="flex-1">
              <Sparkles className="w-4 h-4 mr-2" />
              View Plans
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
