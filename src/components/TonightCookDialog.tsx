import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Pause,
  Play,
  ChevronLeft,
  ChevronRight,
  Timer,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { PerKidPlateBreakdown } from "@/components/PerKidPlateBreakdown";
import { analytics } from "@/lib/analytics";
import type { KidPlate } from "@/lib/platePlanner";
import { recipeStepsFromInstructions } from "@/lib/tonightMode";
import type { Recipe } from "@/types";
import "@/i18n/appLocale";

interface Props {
  recipe: Recipe | null;
  open: boolean;
  onClose: () => void;
  /**
   * One plate per child from the plate planner. When given, the last step
   * shows what goes on each plate, what is held back or served apart, and
   * which children must not eat this dish at all.
   */
  plates?: KidPlate[];
}

/**
 * What to do at the counter, per child. Blocked children are named first and
 * apart from the breakdown, because "serve them something else" is the one
 * line on this screen a parent cannot skip.
 */
function ServingPanel({ plates }: { plates: KidPlate[] }) {
  const { t } = useTranslation();
  if (plates.length === 0) return null;
  const blocked = plates.filter((plate) => plate.blocked);
  const names = blocked.map((plate) => plate.kidName).join(", ");

  return (
    <section
      className="mt-8 space-y-3"
      aria-labelledby="tonight-cook-serving-heading"
      data-testid="tonight-cook-serving"
    >
      <h3 id="tonight-cook-serving-heading" className="text-base font-semibold">
        {t("siblingMealFinder.cook.serving.title", { defaultValue: "Serving" })}
      </h3>
      {blocked.length > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="max-w-[70ch] font-medium">
            {t("siblingMealFinder.cook.serving.blocked", {
              count: blocked.length,
              names,
              defaultValue: "Not for {{names}} tonight. Serve something else.",
            })}
          </p>
        </div>
      )}
      <PerKidPlateBreakdown plates={plates} />
    </section>
  );
}

const STEP_TIMER_DEFAULT_SECONDS = 0;
const VOICE_PREF_KEY = "tonightMode.voiceEnabled";

export function TonightCookDialog({ recipe, open, onClose, plates }: Props) {
  const { t } = useTranslation();
  const steps = useMemo(
    () => (recipe ? recipeStepsFromInstructions(recipe.instructions) : []),
    [recipe],
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState(STEP_TIMER_DEFAULT_SECONDS);
  const [timerRunning, setTimerRunning] = useState(false);
  // What screen readers hear about the timer: start, pause and done only.
  // The ticking mm:ss is deliberately not live, or it would announce every second.
  const [timerAnnouncement, setTimerAnnouncement] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    try {
      return localStorage.getItem(VOICE_PREF_KEY) === "1";
    } catch {
      return false;
    }
  });
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  // Acquire screen wake lock so the screen doesn't sleep while cooking.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function acquire() {
      try {
        const lock = await (
          navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> } }
        ).wakeLock?.request("screen");
        if (cancelled) {
          await lock?.release().catch(() => undefined);
          return;
        }
        if (lock) wakeLockRef.current = lock;
      } catch {
        // ignore — wake lock is best-effort
      }
    }
    void acquire();
    return () => {
      cancelled = true;
      void wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
    };
  }, [open]);

  // Reset state when opened with a new recipe.
  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setTimerSeconds(0);
    setTimerRunning(false);
    setTimerAnnouncement("");
    startedAtRef.current = performance.now();
    completedRef.current = false;
    if (recipe) {
      analytics.trackEvent("tonight_cook_started", {
        recipe_id: recipe.id,
        step_count: steps.length,
      });
    }
  }, [open, recipe, steps.length]);

  // Step timer.
  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setTimerSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  useEffect(() => {
    if (timerRunning && timerSeconds === 0) {
      setTimerRunning(false);
      setTimerAnnouncement(t("siblingMealFinder.cook.timer.done", { defaultValue: "Timer done" }));
    }
  }, [timerRunning, timerSeconds, t]);

  const startTimer = useCallback(
    (seconds: number) => {
      setTimerSeconds(seconds);
      setTimerRunning(true);
      setTimerAnnouncement(
        t("siblingMealFinder.cook.timer.started", {
          count: seconds / 60,
          defaultValue: "{{count}} minute timer started",
        }),
      );
    },
    [t],
  );

  const toggleTimer = useCallback(() => {
    setTimerAnnouncement(
      timerRunning
        ? t("siblingMealFinder.cook.timer.paused", { defaultValue: "Timer paused" })
        : t("siblingMealFinder.cook.timer.resumed", { defaultValue: "Timer resumed" }),
    );
    setTimerRunning(!timerRunning);
  }, [timerRunning, t]);

  const speakStep = useCallback(
    (text: string) => {
      if (!voiceEnabled) return;
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 0.95;
        utter.lang = "en-US";
        window.speechSynthesis.speak(utter);
      } catch {
        // ignore
      }
    },
    [voiceEnabled],
  );

  useEffect(() => {
    if (!open || steps.length === 0) return;
    speakStep(steps[stepIndex]);
  }, [open, stepIndex, steps, speakStep]);

  const setVoice = useCallback((enabled: boolean) => {
    setVoiceEnabled(enabled);
    try {
      localStorage.setItem(VOICE_PREF_KEY, enabled ? "1" : "0");
    } catch {
      // ignore
    }
    if (!enabled && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const goNext = useCallback(() => {
    setStepIndex((i) => Math.min(steps.length - 1, i + 1));
    setTimerSeconds(0);
    setTimerRunning(false);
  }, [steps.length]);

  const goPrev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
    setTimerSeconds(0);
    setTimerRunning(false);
  }, []);

  const onComplete = useCallback(() => {
    if (!recipe || completedRef.current) {
      onClose();
      return;
    }
    completedRef.current = true;
    const durationSeconds = startedAtRef.current
      ? Math.round((performance.now() - startedAtRef.current) / 1000)
      : 0;
    analytics.trackEvent("tonight_cook_completed", {
      recipe_id: recipe.id,
      step_count: steps.length,
      duration_seconds: durationSeconds,
      voice_enabled: voiceEnabled,
    });
    onClose();
  }, [onClose, recipe, steps.length, voiceEnabled]);

  // Keyboard shortcuts: arrows to navigate, space to toggle timer.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === " ") {
        e.preventDefault();
        if (timerSeconds > 0) toggleTimer();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, goNext, goPrev, timerSeconds, toggleTimer, onClose]);

  if (!recipe) return null;

  const progress = steps.length > 0 ? ((stepIndex + 1) / steps.length) * 100 : 0;
  const onLastStep = stepIndex >= steps.length - 1;
  const minutes = Math.floor(timerSeconds / 60).toString().padStart(2, "0");
  const seconds = (timerSeconds % 60).toString().padStart(2, "0");

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto p-0">
        <div className="bg-orange-500 text-white px-6 py-4">
          <DialogHeader>
            <DialogTitle className="text-xl text-white">{recipe.name}</DialogTitle>
            <DialogDescription className="text-orange-50/90">
              Step {stepIndex + 1} of {Math.max(1, steps.length)}
            </DialogDescription>
          </DialogHeader>
          <Progress value={progress} className="mt-3 h-1 bg-orange-400/40" />
        </div>

        <div className="px-6 py-8">
          {steps.length === 0 ? (
            <div className="text-center text-muted-foreground">
              <p className="text-base mb-4">
                This recipe doesn't have step-by-step instructions yet.
              </p>
              {recipe.instructions && (
                <p className="text-left whitespace-pre-wrap text-sm bg-muted rounded-md p-3">
                  {recipe.instructions}
                </p>
              )}
            </div>
          ) : (
            <p className="text-2xl md:text-3xl leading-relaxed font-medium tracking-tight">
              {steps[stepIndex]}
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
              <Timer className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="font-mono text-lg" data-testid="tonight-cook-timer">
                {minutes}:{seconds}
              </span>
              <div className="flex gap-1">
                {[60, 300, 600].map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant="ghost"
                    onClick={() => startTimer(s)}
                    aria-label={`Start ${s / 60} minute timer`}
                  >
                    +{s / 60}m
                  </Button>
                ))}
              </div>
              {timerSeconds > 0 && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={toggleTimer}
                  aria-label={timerRunning ? "Pause timer" : "Resume timer"}
                >
                  {timerRunning ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setVoice(!voiceEnabled)}
              aria-label={voiceEnabled ? "Disable voice" : "Enable voice"}
              className="gap-2"
            >
              {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {voiceEnabled ? "Voice on" : "Voice off"}
            </Button>
          </div>
          <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {timerAnnouncement}
          </div>

          {onLastStep && plates && <ServingPanel plates={plates} />}
        </div>

        <div className="flex items-center justify-between border-t px-6 py-4">
          <Button
            variant="ghost"
            onClick={goPrev}
            disabled={stepIndex === 0}
            aria-label="Previous step"
            className="gap-2"
          >
            <ChevronLeft className="h-5 w-5" />
            Back
          </Button>
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-muted-foreground gap-2"
            aria-label="Exit cooking mode"
          >
            <X className="h-4 w-4" />
            Exit
          </Button>
          {onLastStep ? (
            <Button
              onClick={onComplete}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              Done cooking
            </Button>
          ) : (
            <Button onClick={goNext} className="gap-2 bg-orange-500 hover:bg-orange-600 text-white">
              Next
              <ChevronRight className="h-5 w-5" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
