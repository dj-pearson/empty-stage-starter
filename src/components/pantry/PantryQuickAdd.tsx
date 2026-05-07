import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/**
 * US-288: insanely-fast pantry quick-add.
 *
 *   - Single-line input parses "name [qty] [unit]" / "qty unit name" / bare name.
 *   - Live preview chip below the input shows the inferred category + unit
 *     before the user submits.
 *   - Enter saves and clears for the next item; Cmd/Ctrl+Enter expands a
 *     bulk-paste textarea where each non-empty line becomes one pantry row.
 *   - Mic button uses the Web Speech API to dictate the input (when available
 *     on the user's browser).
 */

interface Props {
  onAddOne: (parse: PantryQuickAddParse) => Promise<void> | void;
  onAddMany: (parses: PantryQuickAddParse[]) => Promise<void> | void;
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

export function PantryQuickAdd({ onAddOne, onAddMany }: Props) {
  const [value, setValue] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [listening, setListening] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const speechRef = useRef<SpeechRecognitionLike | null>(null);

  // Live preview — recomputed on every keystroke. Cheap (regex + table lookup).
  const preview = useMemo(() => parsePantryQuickAddLine(value), [value]);

  const submit = useCallback(async () => {
    const parsed = parsePantryQuickAddLine(value);
    if (!parsed) return;
    setSubmitting(true);
    try {
      await onAddOne(parsed);
      setValue("");
      analytics.trackEvent({
        name: "pantry_quick_add_submitted",
        properties: {
          parse_confidence: parsed.confidence,
          had_explicit_unit: parsed.unit !== "",
          path: "single",
        },
      });
      // Re-focus so the next item flows without mouse work.
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (err) {
      console.error("Pantry quick-add failed:", err);
      toast.error("Could not add item — try again.");
    } finally {
      setSubmitting(false);
    }
  }, [value, onAddOne]);

  const submitBulk = useCallback(async () => {
    const parses = parsePantryQuickAddBulk(bulkValue);
    if (parses.length === 0) {
      toast.error("Add at least one item before saving.");
      return;
    }
    setSubmitting(true);
    try {
      await onAddMany(parses);
      setBulkValue("");
      setBulkOpen(false);
      toast.success(`Added ${parses.length} item${parses.length === 1 ? "" : "s"} to pantry`);
      analytics.trackEvent({
        name: "pantry_quick_add_submitted",
        properties: {
          parse_confidence:
            parses.reduce((acc, p) => acc + p.confidence, 0) / parses.length,
          line_count: parses.length,
          path: "bulk",
        },
      });
    } catch (err) {
      console.error("Pantry bulk-add failed:", err);
      toast.error("Could not add items — try again.");
    } finally {
      setSubmitting(false);
    }
  }, [bulkValue, onAddMany]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        // Carry the current value into the bulk textarea so the user doesn't
        // retype.
        setBulkValue((prev) => (value ? `${value}\n${prev}` : prev));
        setValue("");
        setBulkOpen(true);
        return;
      }
      e.preventDefault();
      void submit();
    }
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
      toast.error("Voice input isn't supported on this browser yet.");
      return;
    }
    if (listening) {
      stopSpeech();
      return;
    }
    try {
      const r = new Ctor();
      r.lang = "en-US";
      r.continuous = false;
      r.interimResults = false;
      r.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript ?? "";
        if (transcript) {
          setValue((prev) => (prev ? `${prev} ${transcript}` : transcript));
          requestAnimationFrame(() => inputRef.current?.focus());
        }
      };
      r.onend = () => {
        setListening(false);
        speechRef.current = null;
      };
      r.onerror = (event) => {
        if (event.error && event.error !== "aborted") {
          toast.error(`Voice input failed (${event.error})`);
        }
      };
      speechRef.current = r;
      setListening(true);
      r.start();
    } catch (err) {
      console.error("Speech start failed:", err);
      toast.error("Voice input is busy — close other tabs using the mic.");
      setListening(false);
    }
  };

  const previewCategoryConfig = preview ? CATEGORY_CONFIG[preview.category] : null;
  const speechSupported = typeof window !== "undefined" && getSpeechRecognitionCtor() !== null;

  return (
    <div className="space-y-2">
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="2 lb chicken — try voice or paste a list"
            className="pr-9 h-11"
            aria-label="Quick-add a pantry item"
            disabled={submitting}
          />
          {value && (
            <button
              type="button"
              onClick={() => setValue("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear quick-add input"
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
            aria-label={listening ? "Stop voice input" : "Start voice input"}
            aria-pressed={listening}
          >
            <Mic className={cn("h-4 w-4", listening && "animate-pulse")} />
          </Button>
        )}

        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={() => setBulkOpen((o) => !o)}
          className="h-11 w-11 shrink-0"
          aria-label="Toggle bulk paste"
          aria-pressed={bulkOpen}
        >
          <ListPlus className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          onClick={() => void submit()}
          disabled={!preview || submitting}
          className="h-11 shrink-0 gap-1.5"
          aria-label="Add to pantry"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </Button>
      </div>

      {/* Live preview chip */}
      {preview && (
        <div
          className={cn(
            "flex items-center flex-wrap gap-2 px-3 py-1.5 rounded-md border text-xs bg-card",
            preview.confidence >= 0.85
              ? "border-primary/40 text-foreground"
              : "border-amber-300/60 text-muted-foreground"
          )}
          data-testid="pantry-quick-add-preview"
        >
          <span className="font-medium">→ Pantry</span>
          <span className="text-muted-foreground">•</span>
          {previewCategoryConfig && (
            <span className="font-medium">{previewCategoryConfig.label}</span>
          )}
          <span className="text-muted-foreground">•</span>
          <span className="tabular-nums">
            {preview.quantity}
            {preview.unit ? ` ${preview.unit}` : ""}
          </span>
          {preview.confidence < 0.85 && (
            <span className="ml-auto italic">guessing — confirm before save</span>
          )}
        </div>
      )}

      {/* Bulk-paste textarea */}
      {bulkOpen && (
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Paste a list — one item per line</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setBulkOpen(false)}
              aria-label="Close bulk paste"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Textarea
            value={bulkValue}
            onChange={(e) => setBulkValue(e.target.value)}
            placeholder={`2 lb chicken\n12 eggs\nmilk\nrice\n...`}
            rows={6}
            className="font-mono text-sm"
            aria-label="Bulk paste pantry items"
          />
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-muted-foreground mr-auto">
              {bulkValue.trim() ? `${parsePantryQuickAddBulk(bulkValue).length} items` : "0 items"}
            </span>
            <Button
              type="button"
              onClick={() => void submitBulk()}
              disabled={!bulkValue.trim() || submitting}
              className="gap-1.5"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add all
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
