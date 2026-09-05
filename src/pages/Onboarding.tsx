import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { User, Users, Heart, ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { analytics } from "@/lib/analytics";
import { markOnboardingCompleted, type PlanningFor } from "@/lib/onboardingStatus";

/**
 * Onboarding, as a route (US-770).
 *
 * It used to be a dialog fired from Auth.tsx and nowhere else, which meant it
 * happened exactly once, on one screen, and could not be returned to, linked
 * to, or resumed. It also required a child's name at step one -- so a couple
 * planning for themselves could not finish setup without inventing a child.
 *
 * The first question is now who you are planning for, and only the family
 * branch asks about a child. That question has to match the one iOS asks or the
 * eater model in household-planner US-740 diverges by platform before it is
 * built: two funnels that ask different first questions produce two different
 * shapes of household.
 *
 * US-740 owns storing the answer as eater rows. This route asks it, branches on
 * it, and reports it as an activation property; it does not invent a column for
 * something another story owns.
 */

interface Choice {
  id: PlanningFor;
  title: string;
  description: string;
  icon: typeof User;
}

const CHOICES: Choice[] = [
  {
    id: "just_me",
    title: "Just me",
    description: "Planning my own meals.",
    icon: User,
  },
  {
    id: "me_and_partner",
    title: "Me and a partner",
    description: "Two adults sharing the cooking and the shopping.",
    icon: Heart,
  },
  {
    id: "my_family",
    title: "My family",
    description: "One or more children, with their own likes and safe foods.",
    icon: Users,
  },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { addKid } = useApp();

  const [planningFor, setPlanningFor] = useState<PlanningFor | null>(null);
  const [childName, setChildName] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);

  const needsChild = planningFor === "my_family";
  const totalSteps = needsChild ? 2 : 1;

  const finish = async (skipped: boolean) => {
    setSaving(true);
    try {
      if (needsChild && !skipped && childName.trim()) {
        await addKid({ name: childName.trim(), allergens: [], favorite_foods: [] });
      }

      // US-707's activation events, fired from the route that owns the funnel
      // rather than from a dialog that only ever opened on one page.
      analytics.trackEvent(skipped ? "onboarding_skipped" : "onboarding_completed", {
        planning_for: planningFor ?? "unanswered",
        added_child: Boolean(needsChild && !skipped && childName.trim()),
      });

      // Completing AND skipping both finish onboarding. A user who skipped has
      // answered the question -- "not now" -- and asking again on every visit
      // is how a setup flow becomes something people learn to dismiss.
      const saved = await markOnboardingCompleted();
      if (!saved) {
        toast.error("Couldn't save your setup. You can carry on; we'll ask again later.");
      }

      navigate("/dashboard", { replace: true });
    } finally {
      setSaving(false);
    }
  };

  const choose = (id: PlanningFor) => {
    setPlanningFor(id);
    analytics.trackEvent("onboarding_planning_for_selected", { planning_for: id });
    if (id === "my_family") {
      setStep(2);
    } else {
      void finish(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Set up EatPal</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <main className="container mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-4 sm:p-6">
        <div className="space-y-2">
          <Progress value={(step / totalSteps) * 100} className="h-2" />
          <p className="text-sm text-muted-foreground">
            Step {step} of {totalSteps}
          </p>
        </div>

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Who are you planning for?</CardTitle>
              <CardDescription>
                This decides what we set up. You can change it later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {CHOICES.map((choice) => {
                const Icon = choice.icon;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    onClick={() => choose(choice.id)}
                    disabled={saving}
                    className="flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  >
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block font-medium">{choice.title}</span>
                      <span className="block text-sm text-muted-foreground">
                        {choice.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Who are you cooking for?</CardTitle>
              <CardDescription>
                A first name is enough. You can add more children later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="child-name">Child's first name</Label>
                <Input
                  id="child-name"
                  value={childName}
                  onChange={(event) => setChildName(event.target.value)}
                  placeholder="e.g. Sam"
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={() => finish(false)}
                  disabled={saving || !childName.trim()}
                  className="flex-1"
                >
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setStep(1);
                    setPlanningFor(null);
                  }}
                  disabled={saving}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                  Back
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="text-center">
          <Button variant="link" onClick={() => finish(true)} disabled={saving}>
            Skip for now
          </Button>
        </div>
      </main>
    </>
  );
}
