import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface TutorialStep {
  title: string;
  description: string;
  gesture: "swipe-left" | "swipe-right" | "swipe-up" | "swipe-down" | "pull-down";
  animation: React.ReactNode;
}

const tutorialSteps: TutorialStep[] = [
  {
    title: "Swipe to Navigate Back",
    description: "Swipe right from the left edge to go back to the previous page.",
    gesture: "swipe-right",
    animation: (
      <div className="relative w-full h-32 bg-muted rounded-lg overflow-hidden">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-16 bg-primary animate-pulse" />
        <div className="absolute left-4 top-1/2 -translate-y-1/2">
          <ChevronRight className="h-12 w-12 text-primary animate-[slide-right_2s_ease-in-out_infinite]" />
        </div>
      </div>
    ),
  },
  {
    title: "Pull to Refresh",
    description: "Pull down on any list or page to refresh the content.",
    gesture: "pull-down",
    animation: (
      <div className="relative w-full h-32 bg-muted rounded-lg overflow-hidden flex items-start justify-center pt-2">
        <div className="animate-[bounce_2s_ease-in-out_infinite]">
          <svg
            className="h-8 w-8 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </div>
      </div>
    ),
  },
  {
    title: "Swipe Between Tabs",
    description: "Swipe left or right to quickly switch between tabs and sections.",
    gesture: "swipe-left",
    animation: (
      <div className="relative w-full h-32 bg-muted rounded-lg overflow-hidden flex items-center justify-center">
        <div className="flex gap-2">
          <ChevronLeft className="h-12 w-12 text-primary/50 animate-[slide-left_2s_ease-in-out_infinite]" />
          <div className="w-24 h-16 bg-primary/20 rounded-lg flex items-center justify-center">
            <span className="text-sm font-medium">Content</span>
          </div>
          <ChevronRight className="h-12 w-12 text-primary animate-[slide-right_2s_ease-in-out_infinite]" />
        </div>
      </div>
    ),
  },
];

export function GestureTutorial() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasSeenTutorial, setHasSeenTutorial] = useState(() => {
    return localStorage.getItem("gesture-tutorial-seen") === "true";
  });

  // Show tutorial on first mobile visit
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (isMobile && !hasSeenTutorial) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 2000); // Show after 2 seconds

      return () => clearTimeout(timer);
    }
  }, [hasSeenTutorial]);

  const handleClose = () => {
    setIsOpen(false);
    setHasSeenTutorial(true);
    localStorage.setItem("gesture-tutorial-seen", "true");
  };

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleClose();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    handleClose();
  };

  if (!isOpen) {
    // Show a small hint button to reopen tutorial
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-50 p-3 bg-primary text-primary-foreground rounded-full shadow-lg hover:shadow-xl transition-all md:hidden"
        aria-label="Show gesture tutorial"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11"
          />
        </svg>
      </button>
    );
  }

  const step = tutorialSteps[currentStep];

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-50 md:hidden" onClick={handleSkip} />

      {/* Tutorial Card */}
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-card rounded-lg shadow-2xl p-6 max-w-md mx-auto md:hidden">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">{step.title}</h3>
            <span className="text-sm text-muted-foreground">
              {currentStep + 1} / {tutorialSteps.length}
            </span>
          </div>

          {/* Animation */}
          <div className="mb-4">{step.animation}</div>

          <p className="text-muted-foreground">{step.description}</p>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {tutorialSteps.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStep(index)}
              className={cn(
                "h-2 rounded-full transition-all",
                index === currentStep
                  ? "w-8 bg-primary"
                  : "w-2 bg-muted-foreground/30"
              )}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex justify-between gap-2">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="flex-1"
          >
            Previous
          </Button>
          <Button
            variant="outline"
            onClick={handleSkip}
            className="flex-1"
          >
            Skip
          </Button>
          <Button onClick={handleNext} className="flex-1">
            {currentStep === tutorialSteps.length - 1 ? "Got it!" : "Next"}
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes slide-right {
          0%, 100% { transform: translateX(0); opacity: 0.5; }
          50% { transform: translateX(20px); opacity: 1; }
        }
        @keyframes slide-left {
          0%, 100% { transform: translateX(0); opacity: 0.5; }
          50% { transform: translateX(-20px); opacity: 1; }
        }
      `}</style>
    </>
  );
}
