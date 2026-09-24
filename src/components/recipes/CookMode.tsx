import { useState, useEffect, useCallback } from "react";
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
  /**
   * The last step's Done: the meal is cooked. Defaults to onClose. The detail
   * sheet uses it to log the cook and ask how each kid did (item 9).
   */
  onDone?: () => void;
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

/** "30 sec", "5 min", "1 hr 30 min" for the start button. */
function timerLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

export function CookMode({ recipeName, instructions, onClose, onDone }: CookModeProps) {
  const steps = parseSteps(instructions);
  const [currentStep, setCurrentStep] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);

  const detectedTimer = detectTimer(steps[currentStep] || "");

  // Screen wake lock. The browser drops it whenever the tab is hidden (a
  // glance at a text, the lock screen), so it is asked for again on return.
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    let cancelled = false;
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") {
          const lock = await navigator.wakeLock.request("screen");
          if (cancelled) {
            void lock.release();
            return;
          }
          wakeLock = lock;
        }
      } catch {
        // Wake lock not available or denied
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && (wakeLock === null || wakeLock.released)) {
        void requestWakeLock();
      }
    };
    void requestWakeLock();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void wakeLock?.release();
    };
  }, []);

  // Timer countdown. US-543: depend ONLY on the running flag so the interval is
  // created once when the timer starts (not torn down + recreated every tick,
  // which is what including timerSeconds in the deps caused). The functional
  // updater reads the latest value and stops itself at 0.
  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev === null || prev <= 1) {
          setTimerRunning(false);
          return prev === null ? null : 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const ss = s.toString().padStart(2, "0");
    return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  };

  const startTimer = (seconds: number) => {
    setTimerSeconds(seconds);
    setTimerRunning(true);
  };

  const goToStep = useCallback(
    (step: number) => {
      if (step < 0 || step >= steps.length) return;
      setCurrentStep(step);
      setTimerSeconds(null);
      setTimerRunning(false);
    },
    [steps.length],
  );

  // Escape leaves, arrows step, for a cook with one clean knuckle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToStep(currentStep + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToStep(currentStep - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentStep, goToStep, onClose]);

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
        <p className="text-xl md:text-2xl leading-relaxed max-w-2xl" aria-live="polite" aria-atomic="true">
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
                  <p className="text-sm text-safe-food font-medium" role="status">
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
                Start {timerLabel(detectedTimer)} timer
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
              (onDone ?? onClose)();
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
