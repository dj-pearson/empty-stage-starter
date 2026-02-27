import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, X } from "lucide-react";

/**
 * Shows a re-engagement prompt if the user skipped onboarding more than 3 days ago
 * and hasn't completed it since.
 */
export function OnboardingReengagement() {
  const [show, setShow] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkReengagement();
  }, []);

  const checkReengagement = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed, created_at")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile || profile.onboarding_completed) return;

      // Check if account is older than 3 days
      const createdAt = new Date(profile.created_at);
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      if (createdAt > threeDaysAgo) return;

      // Check if dismissed recently
      const dismissed = localStorage.getItem("eatpal_onboarding_dismissed");
      if (dismissed) {
        const dismissedAt = new Date(dismissed);
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);
        if (dismissedAt > oneDayAgo) return;
      }

      setShow(true);
    } catch { /* silent */ }
  };

  const dismiss = () => {
    localStorage.setItem("eatpal_onboarding_dismissed", new Date().toISOString());
    setShow(false);
  };

  if (!show) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="flex items-center gap-4 p-4">
        <Sparkles className="h-8 w-8 text-primary flex-shrink-0" />
        <div className="flex-1">
          <p className="font-medium">Complete your setup</p>
          <p className="text-sm text-muted-foreground">
            Add your child's profile to get personalized meal plans and nutrition tracking.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => { navigate("/dashboard/kids"); dismiss(); }}>
            Get Started
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
