import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Timer,
} from "lucide-react";

interface CookModeProps {
  recipeName: string;
  instructions: string;
  onClose: () => void;
}

function parseSteps(instructions: string): string[] {
  // Try to parse as JSON array first (from enhanced builder)
  try {
    const parsed = JSON.parse(instructions);
    if (Array.isArray(parsed)) return parsed.filter((s) => s.trim());
  } catch {
    // Not JSON, parse as text
  }

  // Split on numbered patterns like "1." or "1)" or newlines
  const lines = instructions
    .split(/(?:\r?\n)+|(?:(?<=\.)\s*(?=\d+[.)]))/)
    .map((line) => line.replace(/^\d+[.)]\s*/, "").trim())
    .filter((line) => line.length > 0);

  return lines.length > 0 ? lines : [instructions];
}

function detectTimer(step: string): number | null {
  // Match patterns like "20 minutes", "5 mins", "1 hour", "30 seconds"
  const match = step.match(
    /(\d+)\s*(?:minute|min|minutes|mins)/i
  );
  if (match) return parseInt(match[1], 10) * 60;

  const hourMatch = step.match(/(\d+)\s*(?:hour|hours|hrs?)/i);
  if (hourMatch) return parseInt(hourMatch[1], 10) * 3600;

  const secMatch = step.match(/(\d+)\s*(?:second|seconds|secs?)/i);
  if (secMatch) return parseInt(secMatch[1], 10);

  return null;
}

export function CookMode({ recipeName, instructions, onClose }: CookModeProps) {
  const steps = parseSteps(instructions);
  const [currentStep, setCurrentStep] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);

  const detectedTimer = detectTimer(steps[currentStep] || "");

  // Screen wake lock
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await navigator.wakeLock.request("screen");
        }
      } catch {
        // Wake lock not available or denied
      }
    };
    requestWakeLock();
    return () => {
      wakeLock?.release();
    };
  }, []);

  // Timer countdown
  useEffect(() => {
    if (!timerRunning || timerSeconds === null || timerSeconds <= 0) return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev === null || prev <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning, timerSeconds]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const startTimer = (seconds: number) => {
    setTimerSeconds(seconds);
    setTimerRunning(true);
  };

  const goToStep = (step: number) => {
    setCurrentStep(step);
    setTimerSeconds(null);
    setTimerRunning(false);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="font-semibold truncate">{recipeName}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Exit cook mode">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Step content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center">
        <div className="text-sm text-muted-foreground mb-4">
          Step {currentStep + 1} of {steps.length}
        </div>
        <p className="text-xl md:text-2xl leading-relaxed max-w-2xl">
          {steps[currentStep]}
        </p>

        {/* Timer */}
        {detectedTimer && (
          <div className="mt-8">
            {timerSeconds !== null && timerSeconds >= 0 ? (
              <div className="flex flex-col items-center gap-2">
                <div className="text-4xl font-mono font-bold tabular-nums">
                  {formatTime(timerSeconds)}
                </div>
                {timerSeconds === 0 ? (
                  <p className="text-sm text-green-600 font-medium">
                    Timer complete!
                  </p>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTimerRunning(!timerRunning)}
                  >
                    {timerRunning ? "Pause" : "Resume"}
                  </Button>
                )}
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => startTimer(detectedTimer)}
                className="gap-2"
              >
                <Timer className="h-4 w-4" />
                Start {Math.floor(detectedTimer / 60)}min timer
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between px-4 py-4 border-t">
        <Button
          variant="outline"
          onClick={() => goToStep(currentStep - 1)}
          disabled={currentStep === 0}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>

        {/* Step dots */}
        <div className="flex gap-1.5 max-w-[50%] overflow-x-auto">
          {steps.map((_, i) => (
            <button
              key={i}
              className={`w-2.5 h-2.5 rounded-full shrink-0 transition-colors ${
                i === currentStep
                  ? "bg-primary"
                  : i < currentStep
                  ? "bg-primary/40"
                  : "bg-muted-foreground/20"
              }`}
              onClick={() => goToStep(i)}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        <Button
          variant={currentStep === steps.length - 1 ? "default" : "outline"}
          onClick={() => {
            if (currentStep === steps.length - 1) {
              onClose();
            } else {
              goToStep(currentStep + 1);
            }
          }}
          className="gap-1"
        >
          {currentStep === steps.length - 1 ? "Done" : "Next"}
          {currentStep < steps.length - 1 && <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
