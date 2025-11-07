import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Sparkles, Baby, Apple, Bot, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface SubscriptionOnboardingProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onboardingType: "free" | "trial" | "paid" | "complementary" | "upgrade";
  planName: string;
}

export function SubscriptionOnboarding({
  open,
  onOpenChange,
  onboardingType,
  planName,
}: SubscriptionOnboardingProps) {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  const getOnboardingContent = () => {
    switch (onboardingType) {
      case "free":
        return {
          title: "Welcome to EatPal! 🎉",
          description: "Let's get you started with your free account",
          steps: [
            {
              icon: <Baby className="w-8 h-8 text-primary" />,
              title: "Add Your First Child",
              description: "Create a profile for your child with their food preferences and any sensitivities",
              action: "Add Child Profile",
              route: "/dashboard",
            },
            {
              icon: <Apple className="w-8 h-8 text-primary" />,
              title: "Build Your Pantry",
              description: "Add foods your family loves and track what works for your children",
              action: "Explore Foods",
              route: "/pantry",
            },
            {
              icon: <Bot className="w-8 h-8 text-primary" />,
              title: "Meet Your AI Coach",
              description: "Get personalized meal suggestions and feeding strategies",
              action: "Try AI Coach",
              route: "/ai-coach",
            },
          ],
        };

      case "trial":
        return {
          title: `Welcome to Your ${planName} Trial! 🚀`,
          description: "You have full access to all premium features. Let's explore!",
          steps: [
            {
              icon: <Sparkles className="w-8 h-8 text-primary" />,
              title: "Explore Premium Features",
              description: "Unlimited AI requests, advanced meal planning, and more",
              action: "View Features",
              route: "/dashboard",
            },
            {
              icon: <Baby className="w-8 h-8 text-primary" />,
              title: "Add Multiple Children",
              description: "Track meals and preferences for all your kids in one place",
              action: "Add Children",
              route: "/dashboard",
            },
            {
              icon: <Bot className="w-8 h-8 text-primary" />,
              title: "Unlimited AI Coach Access",
              description: "Get personalized strategies without daily limits",
              action: "Start Coaching",
              route: "/ai-coach",
            },
          ],
        };

      case "paid":
        return {
          title: "Welcome to Premium! 🎉",
          description: `You're now on the ${planName} plan with full access to all features`,
          steps: [
            {
              icon: <CheckCircle2 className="w-8 h-8 text-green-600" />,
              title: "Payment Confirmed",
              description: "Your subscription is active and ready to use",
              action: "Get Started",
              route: "/dashboard",
            },
            {
              icon: <Sparkles className="w-8 h-8 text-primary" />,
              title: "Unlock All Features",
              description: "Explore everything your plan offers without limits",
              action: "View Dashboard",
              route: "/dashboard",
            },
            {
              icon: <TrendingUp className="w-8 h-8 text-primary" />,
              title: "Track Your Progress",
              description: "Monitor meals, growth, and feeding milestones",
              action: "View Progress",
              route: "/dashboard",
            },
          ],
        };

      case "complementary":
        return {
          title: "Complementary Access Granted! 🎁",
          description: `You have special access to the ${planName} plan`,
          steps: [
            {
              icon: <CheckCircle2 className="w-8 h-8 text-purple-600" />,
              title: "Access Activated",
              description: "Your complementary subscription is now active",
              action: "Get Started",
              route: "/dashboard",
            },
            {
              icon: <Sparkles className="w-8 h-8 text-primary" />,
              title: "Enjoy All Features",
              description: "Full access to all premium features included",
              action: "Explore Features",
              route: "/dashboard",
            },
          ],
        };

      case "upgrade":
        return {
          title: `Upgraded to ${planName}! 🎉`,
          description: "You now have access to even more features",
          steps: [
            {
              icon: <TrendingUp className="w-8 h-8 text-green-600" />,
              title: "Upgrade Complete",
              description: "Your account has been upgraded successfully",
              action: "See What's New",
              route: "/dashboard",
            },
            {
              icon: <Sparkles className="w-8 h-8 text-primary" />,
              title: "New Features Unlocked",
              description: "Explore the additional features now available to you",
              action: "View Features",
              route: "/dashboard",
            },
          ],
        };

      default:
        return {
          title: "Welcome!",
          description: "Let's get started",
          steps: [],
        };
    }
  };

  const content = getOnboardingContent();
  const currentStep = content.steps[step];

  const handleNext = () => {
    if (step < content.steps.length - 1) {
      setStep(step + 1);
    } else {
      onOpenChange(false);
      if (currentStep?.route) {
        navigate(currentStep.route);
      }
    }
  };

  const handleSkip = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">{content.title}</DialogTitle>
          <DialogDescription>{content.description}</DialogDescription>
        </DialogHeader>

        {currentStep && (
          <Card className="mt-4">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="p-4 rounded-full bg-primary/10">
                  {currentStep.icon}
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2">
                    {currentStep.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {currentStep.description}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between mt-6">
          <Button variant="ghost" onClick={handleSkip}>
            Skip
          </Button>
          <div className="flex items-center gap-2">
            {content.steps.map((_, index) => (
              <div
                key={index}
                className={`h-2 w-2 rounded-full transition-colors ${
                  index === step
                    ? "bg-primary"
                    : index < step
                    ? "bg-primary/50"
                    : "bg-gray-300"
                }`}
              />
            ))}
          </div>
          <Button onClick={handleNext}>
            {step < content.steps.length - 1 ? "Next" : currentStep?.action || "Get Started"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
