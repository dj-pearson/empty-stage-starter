import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, Plus, X, ListPlus, Loader2 } from "lucide-react";
import { CATEGORY_CONFIG } from "@/components/pantry/pantryConstants";
import {
  parsePantryQuickAddLine,
  parsePantryQuickAddBulk,
  type PantryQuickAddParse,
} from "@/lib/pantryQuickAddParser";
import { analytics } from "@/lib/analytics";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import "@/i18n/appLocale";

/**
 * US-288: insanely-fast pantry quick-add.
 *
 *   - Single-line input parses "name [qty] [unit]" / "qty unit name" / bare name.
 *   - Live preview chip below the input shows the inferred category + unit
 *     before the user submits.
 *   - Enter saves and clears for the next item; Cmd/Ctrl+Enter expands a
 *     bulk-paste textarea where each non-empty line becomes one pantry row.
 *     Pasting several lines into the single-line input opens it too, since an
 *     <input> would otherwise flatten the list into one long name.
 *   - Mic button uses the Web Speech API to dictate the input (when available
 *     on the user's browser).
 *
 * THE WRITE CONTRACT. `onAddOne` / `onAddMany` resolve to whether the write
 * landed. Only a `false` counts as failure: the text stays, the input gets
 * focus back, and the parent (which knows why it failed: plan limit, offline,
 * a server error) is the one that says so. This component used to clear the
 * input as soon as the promise settled, so a blocked add threw away what the
 * parent had typed. `void` is still accepted as success so a caller written
 * against the old signature keeps working. Success toasts belong to the
 * caller too; this component only toasts for a thrown error.
 */

/** A pantry row the typed line would stack onto, shown as "Milk: 1 gal -> 2 gal". */
export interface PantryQuickAddExistingMatch {
  name: string;
  from: number;
  to: number;
  unit?: string;
}

export interface PantryQuickAddProps {
  onAddOne: (parse: PantryQuickAddParse) => Promise<boolean | void> | boolean | void;
  onAddMany: (parses: PantryQuickAddParse[]) => Promise<boolean | void> | boolean | void;
  existingMatch?: PantryQuickAddExistingMatch | null;
}

// Browser type checks (minimum needed; full spec lives in the DOM lib).
type SpeechRecognitionLike = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const formatQty = (n: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);

export function PantryQuickAdd({ onAddOne, onAddMany, existingMatch }: PantryQuickAddProps) {
  const { t, i18n } = useTranslation();
  const [value, setValue] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [listening, setListening] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const bulkRef = useRef<HTMLTextAreaElement | null>(null);
  const speechRef = useRef<SpeechRecognitionLike | null>(null);

  // Live preview, recomputed on every keystroke. Cheap (regex + table lookup).
  const preview = useMemo(() => parsePantryQuickAddLine(value), [value]);
  const bulkCount = useMemo(() => parsePantryQuickAddBulk(bulkValue).length, [bulkValue]);

  const refocus = (el: { current: HTMLElement | null }) =>
    requestAnimationFrame(() => el.current?.focus());

  const submit = useCallback(async () => {
    const parsed = parsePantryQuickAddLine(value);
    if (!parsed) return;
    setSubmitting(true);
    let ok = false;
    try {
      ok = (await onAddOne(parsed)) !== false;
      if (ok) {
        setValue("");
        analytics.trackEvent("pantry_quick_add_submitted", {
          parse_confidence: parsed.confidence,
          had_explicit_unit: parsed.unit !== "",
          path: "single",
        });
      }
    } catch (err) {
      logger.error("Pantry quick-add failed:", err);
      toast.error(t("pantry.quickAdd.addFailed", "Could not add item. Try again."));
    } finally {
      setSubmitting(false);
      // Either way the next keystroke belongs in the box: a fresh item on
      // success, a retry on failure.
      refocus(inputRef);
    }
  }, [value, onAddOne, t]);

  const submitBulk = useCallback(async () => {
    const parses = parsePantryQuickAddBulk(bulkValue);
    if (parses.length === 0) {
      toast.error(t("pantry.quickAdd.bulkEmpty", "Add at least one item before saving."));
      return;
    }
    setSubmitting(true);
    try {
      const ok = (await onAddMany(parses)) !== false;
      if (ok) {
        setBulkValue("");
        setBulkOpen(false);
        analytics.trackEvent("pantry_quick_add_submitted", {
          parse_confidence: parses.reduce((acc, p) => acc + p.confidence, 0) / parses.length,
          line_count: parses.length,
          path: "bulk",
        });
        refocus(inputRef);
      } else {
        refocus(bulkRef);
      }
    } catch (err) {
      logger.error("Pantry bulk-add failed:", err);
      toast.error(t("pantry.quickAdd.bulkFailed", "Could not add items. Try again."));
      refocus(bulkRef);
    } finally {
      setSubmitting(false);
    }
  }, [bulkValue, onAddMany, t]);

  const openBulkWith = (text: string) => {
    setBulkValue((prev) => (text ? (prev ? `${text}\n${prev}` : text) : prev));
    setValue("");
    setBulkOpen(true);
    refocus(bulkRef);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    // An IME (Japanese, Chinese, Korean...) confirms a candidate with Enter.
    // That Enter is the keyboard's, not a submit.
    if (e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (e.metaKey || e.ctrlKey) {
      // Carry the current value into the bulk textarea so the user doesn't
      // retype.
      openBulkWith(value);
      return;
    }
    void submit();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!/\r?\n/.test(text.trim())) return;
    // A single-line input would drop the newlines and save "milk eggs bread"
    // as one food. Treat a pasted list as the list it is.
    e.preventDefault();
    const pasted = text.replace(/\r\n/g, "\n").trim();
    openBulkWith(value ? `${value}\n${pasted}` : pasted);
  };

  const stopSpeech = useCallback(() => {
    speechRef.current?.stop();
    speechRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => () => stopSpeech(), [stopSpeech]);

  const startSpeech = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      toast.error(t("pantry.quickAdd.voiceUnsupported", "Voice input isn't supported on this browser yet."));
      return;
    }
    if (listening) {
      stopSpeech();
      return;
    }
    try {
      const r = new Ctor();
      r.lang = i18n.language || "en-US";
      r.continuous = false;
      r.interimResults = false;
      r.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript ?? "";
        if (transcript) {
          setValue((prev) => (prev ? `${prev} ${transcript}` : transcript));
          refocus(inputRef);
        }
      };
      r.onend = () => {
        setListening(false);
        speechRef.current = null;
      };
      r.onerror = (event) => {
        if (event.error && event.error !== "aborted") {
          toast.error(
            t("pantry.quickAdd.voiceFailed", {
              defaultValue: "Voice input failed ({{error}})",
              error: event.error,
            })
          );
        }
      };
      speechRef.current = r;
      setListening(true);
      r.start();
    } catch (err) {
      logger.error("Speech start failed:", err);
      toast.error(t("pantry.quickAdd.voiceBusy", "Voice input is busy. Close other tabs using the mic."));
      setListening(false);
    }
  };

  const previewCategoryConfig = preview ? CATEGORY_CONFIG[preview.category] : null;
  const speechSupported = typeof window !== "undefined" && getSpeechRecognitionCtor() !== null;
  const confident = preview ? preview.confidence >= 0.85 : false;

  return (
    <div className="space-y-2">
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={t("pantry.quickAdd.placeholder", "2 lb chicken, or paste a list")}
            className="pr-9 h-11"
            aria-label={t("pantry.quickAdd.inputLabel", "Quick-add a pantry item")}
            disabled={submitting}
            enterKeyHint="done"
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                setValue("");
                refocus(inputRef);
              }}
              className="absolute right-0 top-1/2 -translate-y-1/2 flex h-11 w-9 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={t("pantry.quickAdd.clear", "Clear quick-add input")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {speechSupported && (
          <Button
            type="button"
            size="icon"
            variant={listening ? "default" : "outline"}
            onClick={startSpeech}
            className="h-11 w-11 shrink-0"
            aria-label={
              listening
                ? t("pantry.quickAdd.voiceStop", "Stop voice input")
                : t("pantry.quickAdd.voiceStart", "Start voice input")
            }
            aria-pressed={listening}
          >
            <Mic className={cn("h-4 w-4", listening && "motion-safe:animate-pulse")} />
          </Button>
        )}

        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={() => setBulkOpen((o) => !o)}
          className="h-11 w-11 shrink-0"
          aria-label={t("pantry.quickAdd.bulkToggle", "Paste a list")}
          aria-pressed={bulkOpen}
          aria-expanded={bulkOpen}
        >
          <ListPlus className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          onClick={() => void submit()}
          disabled={!preview || submitting}
          className="h-11 shrink-0 gap-1.5"
          aria-label={t("pantry.quickAdd.submitLabel", "Add to pantry")}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t("pantry.quickAdd.submit", "Add")}
        </Button>
      </div>

      {/* Live preview chip. aria-live so a screen reader hears what Enter
          will save before pressing it. */}
      <div aria-live="polite" aria-atomic="true">
        {preview && (
          <div
            className={cn(
              "flex items-center flex-wrap gap-2 px-3 py-1.5 rounded-md border text-xs bg-card",
              confident ? "border-primary/40 text-foreground" : "border-warning/60 text-muted-foreground"
            )}
            data-testid="pantry-quick-add-preview"
          >
            {existingMatch ? (
              <span className="font-medium tabular-nums">
                {t("pantry.quickAdd.stacksOnto", {
                  defaultValue: "{{name}}: {{from}} -> {{to}}",
                  name: existingMatch.name,
                  from: `${formatQty(existingMatch.from)}${existingMatch.unit ? ` ${existingMatch.unit}` : ""}`,
                  to: `${formatQty(existingMatch.to)}${existingMatch.unit ? ` ${existingMatch.unit}` : ""}`,
                })}
              </span>
            ) : (
              <>
                <span className="font-medium">{t("pantry.quickAdd.previewTarget", "New in pantry")}</span>
                {previewCategoryConfig && (
                  <>
                    <span className="text-muted-foreground" aria-hidden="true">
                      &middot;
                    </span>
                    <span className="font-medium">{previewCategoryConfig.label}</span>
                  </>
                )}
                <span className="text-muted-foreground" aria-hidden="true">
                  &middot;
                </span>
                <span className="tabular-nums">
                  {formatQty(preview.quantity)}
                  {preview.unit ? ` ${preview.unit}` : ""}
                </span>
              </>
            )}
            {!confident && (
              <span className="ml-auto italic">{t("pantry.quickAdd.guessing", "Best guess, check before saving")}</span>
            )}
          </div>
        )}
      </div>

      {/* Bulk-paste textarea */}
      {bulkOpen && (
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium" id="pantry-quick-add-bulk-title">
              {t("pantry.quickAdd.bulkTitle", "Paste a list, one item per line")}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              onClick={() => setBulkOpen(false)}
              aria-label={t("pantry.quickAdd.bulkClose", "Close bulk paste")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Textarea
            ref={bulkRef}
            value={bulkValue}
            onChange={(e) => setBulkValue(e.target.value)}
            placeholder={t("pantry.quickAdd.bulkPlaceholder", "2 lb chicken\n12 eggs\nmilk\nrice")}
            rows={6}
            className="text-sm"
            aria-labelledby="pantry-quick-add-bulk-title"
          />
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-muted-foreground mr-auto tabular-nums" aria-live="polite">
              {t("pantry.quickAdd.bulkCount", { count: bulkCount, defaultValue: "{{count}} items" })}
            </span>
            <Button
              type="button"
              onClick={() => void submitBulk()}
              disabled={bulkCount === 0 || submitting}
              className="h-11 gap-1.5"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t("pantry.quickAdd.bulkSubmit", { count: bulkCount, defaultValue: "Add {{count}}" })}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
