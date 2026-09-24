import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ChevronDown, ChevronUp, Plus, X, FileText } from "lucide-react";
import "@/i18n/appLocale";

interface InstructionStepBuilderProps {
  steps: string[];
  onChange: (steps: string[]) => void;
}

export function InstructionStepBuilder({
  steps,
  onChange,
}: InstructionStepBuilderProps) {
  const { t } = useTranslation();
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importText, setImportText] = useState("");

  const addStep = () => {
    onChange([...steps, ""]);
  };

  const updateStep = (index: number, value: string) => {
    const next = [...steps];
    next[index] = value;
    onChange(next);
  };

  const removeStep = (index: number) => {
    onChange(steps.filter((_, i) => i !== index));
  };

  const moveStep = (from: number, to: number) => {
    if (to < 0 || to >= steps.length) return;
    const next = [...steps];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  const handleImport = () => {
    if (!importText.trim()) return;
    // Split on numbered patterns, newlines, or double newlines
    const parsed = importText
      .split(/(?:\r?\n)+/)
      .map((line) => line.replace(/^\d+[.)]\s*/, "").trim())
      .filter((line) => line.length > 0);

    if (parsed.length > 0) {
      onChange([...steps.filter((s) => s.trim()), ...parsed]);
    }
    setImportText("");
    setImportDialogOpen(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {t("recipes.builder.instructions", { defaultValue: "Instructions" })}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-11 sm:h-8 text-xs gap-1"
          onClick={() => setImportDialogOpen(true)}
        >
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          {t("recipes.builder.importSteps", { defaultValue: "Import from text" })}
        </Button>
      </div>

      <ol className="space-y-2">
        {steps.map((step, index) => {
          const n = index + 1;
          return (
            <li key={index} className="flex gap-1.5 items-center">
              <span
                className="w-6 h-6 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary"
                aria-hidden="true"
              >
                {n}
              </span>

              <Input
                value={step}
                onChange={(e) => updateStep(index, e.target.value)}
                placeholder={t("recipes.builder.stepPlaceholder", { defaultValue: "Step {{n}}...", n })}
                aria-label={t("recipes.builder.stepLabel", { defaultValue: "Step {{n}}", n })}
                className="flex-1 min-w-0 h-11 sm:h-10 text-sm"
              />

              {/* Reorder: always visible, full-size targets, no fake drag grip. */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0"
                onClick={() => moveStep(index, index - 1)}
                disabled={index === 0}
                aria-label={t("recipes.builder.moveStepUp", { defaultValue: "Move step {{n}} up", n })}
              >
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0"
                onClick={() => moveStep(index, index + 1)}
                disabled={index === steps.length - 1}
                aria-label={t("recipes.builder.moveStepDown", { defaultValue: "Move step {{n}} down", n })}
              >
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0"
                onClick={() => removeStep(index)}
                aria-label={t("recipes.builder.removeStep", { defaultValue: "Remove step {{n}}", n })}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          );
        })}
      </ol>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addStep}
        className="gap-1.5 w-full h-11 sm:h-9"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        {t("recipes.builder.addStep", { defaultValue: "Add Step" })}
      </Button>

      {/* Import from text dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("recipes.builder.importStepsTitle", { defaultValue: "Import Instructions" })}</DialogTitle>
            <DialogDescription>
              {t("recipes.builder.importStepsHint", {
                defaultValue: "Paste your recipe instructions. Each line or numbered step will become a separate step.",
              })}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            aria-label={t("recipes.builder.importStepsLabel", { defaultValue: "Instructions to import" })}
            placeholder={`1. Preheat oven to 350\u00B0F\n2. Mix dry ingredients\n3. Add wet ingredients...`}
            rows={8}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImportDialogOpen(false)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button type="button" onClick={handleImport}>
              {t("recipes.builder.importStepsConfirm", { defaultValue: "Import Steps" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
