import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { GripVertical, Plus, X, FileText } from "lucide-react";

interface InstructionStepBuilderProps {
  steps: string[];
  onChange: (steps: string[]) => void;
}

export function InstructionStepBuilder({
  steps,
  onChange,
}: InstructionStepBuilderProps) {
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
        <label className="text-sm font-medium">Instructions</label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setImportDialogOpen(true)}
        >
          <FileText className="h-3 w-3" />
          Import from text
        </Button>
      </div>

      {steps.map((step, index) => (
        <div key={index} className="flex gap-2 items-start group">
          {/* Drag + step number */}
          <div className="flex items-center gap-1 pt-2 shrink-0">
            <button
              type="button"
              className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                // Simple up/down since full drag-and-drop requires @dnd-kit
                // which may not be installed
              }}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-medium text-primary">
              {index + 1}
            </span>
          </div>

          <Input
            value={step}
            onChange={(e) => updateStep(index, e.target.value)}
            placeholder={`Step ${index + 1}...`}
            className="flex-1 text-sm"
          />

          {/* Move up/down */}
          <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-xs px-1"
              onClick={() => moveStep(index, index - 1)}
              disabled={index === 0}
              aria-label="Move step up"
            >
              ▲
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-xs px-1"
              onClick={() => moveStep(index, index + 1)}
              disabled={index === steps.length - 1}
              aria-label="Move step down"
            >
              ▼
            </button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => removeStep(index)}
            aria-label="Remove step"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addStep}
        className="gap-1.5 w-full"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Step
      </Button>

      {/* Import from text dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import Instructions</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Paste your recipe instructions. Each line or numbered step will
            become a separate step.
          </p>
          <Textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={`1. Preheat oven to 350°F\n2. Mix dry ingredients\n3. Add wet ingredients...`}
            rows={8}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setImportDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleImport}>Import Steps</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
