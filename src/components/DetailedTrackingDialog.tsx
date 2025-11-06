import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Minus, XCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PlanEntry, Food } from "@/types";
import { logger } from "@/lib/logger";

interface DetailedTrackingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: PlanEntry;
  food: Food;
  kidId: string;
  onComplete: (result: "ate" | "tasted" | "refused", attemptId?: string) => void;
}

const STAGES = [
  { value: "looking", label: "👀 Looking", description: "Just looking at the food" },
  { value: "touching", label: "✋ Touching", description: "Touching or playing with food" },
  { value: "smelling", label: "👃 Smelling", description: "Smelling the food" },
  { value: "licking", label: "👅 Licking", description: "Licking or kissing the food" },
  { value: "tiny_taste", label: "🔬 Tiny Taste", description: "Very small taste" },
  { value: "small_bite", label: "🍴 Small Bite", description: "Small bite and chew" },
  { value: "full_bite", label: "😋 Full Bite", description: "Normal bite size" },
  { value: "full_portion", label: "🎉 Full Portion", description: "Ate full serving" },
];

const OUTCOMES = [
  { value: "success", label: "Success", icon: CheckCircle, color: "text-safe-food" },
  { value: "partial", label: "Partial", icon: Minus, color: "text-yellow-500" },
  { value: "refused", label: "Refused", icon: XCircle, color: "text-gray-500" },
  { value: "tantrum", label: "Tantrum", icon: AlertTriangle, color: "text-red-500" },
];

const MOODS = [
  { value: "happy", label: "😊 Happy" },
  { value: "neutral", label: "😐 Neutral" },
  { value: "anxious", label: "😟 Anxious" },
  { value: "resistant", label: "😤 Resistant" },
];

const AMOUNTS = [
  { value: "none", label: "None" },
  { value: "quarter", label: "A Little (¼)" },
  { value: "half", label: "Half" },
  { value: "most", label: "Most" },
  { value: "all", label: "All" },
];

export function DetailedTrackingDialog({
  open,
  onOpenChange,
  entry,
  food,
  kidId,
  onComplete,
}: DetailedTrackingDialogProps) {
  const [stage, setStage] = useState<string>("full_bite");
  const [outcome, setOutcome] = useState<string>("success");
  const [bitesTaken, setBitesTaken] = useState<number>(3);
  const [amount, setAmount] = useState<string>("half");
  const [moodBefore, setMoodBefore] = useState<string>("neutral");
  const [moodAfter, setMoodAfter] = useState<string>("happy");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);

      // Create detailed food attempt
      const { data: attemptData, error: attemptError } = await supabase
        .from("food_attempts")
        .insert({
          kid_id: kidId,
          food_id: entry.food_id,
          attempted_at: new Date().toISOString(),
          stage,
          outcome,
          bites_taken: bitesTaken,
          amount_consumed: amount,
          meal_slot: entry.meal_slot,
          mood_before: moodBefore,
          mood_after: moodAfter,
          parent_notes: notes,
          plan_entry_id: entry.id,
        })
        .select()
        .single();

      if (attemptError) throw attemptError;

      // Map outcome to plan result
      let planResult: "ate" | "tasted" | "refused";
      switch (outcome) {
        case "success":
          planResult = "ate";
          break;
        case "partial":
          planResult = "tasted";
          break;
        default:
          planResult = "refused";
      }

      toast.success("Detailed tracking saved!");
      onComplete(planResult, attemptData.id);
      onOpenChange(false);

      // Reset form
      setStage("full_bite");
      setOutcome("success");
      setBitesTaken(3);
      setAmount("half");
      setMoodBefore("neutral");
      setMoodAfter("happy");
      setNotes("");
    } catch (error) {
      logger.error("Error saving detailed tracking:", error);
      toast.error("Failed to save tracking data");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Track {food.name} in Detail</DialogTitle>
          <DialogDescription>
            Record detailed information about this meal attempt for better insights
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stage Selection */}
          <div className="space-y-2">
            <Label>Stage Achieved</Label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    <div className="flex flex-col">
                      <span>{s.label}</span>
                      <span className="text-xs text-muted-foreground">{s.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Outcome Selection */}
          <div className="space-y-2">
            <Label>Outcome</Label>
            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map((o) => {
                const Icon = o.icon;
                return (
                  <Button
                    key={o.value}
                    type="button"
                    variant={outcome === o.value ? "default" : "outline"}
                    className="justify-start"
                    onClick={() => setOutcome(o.value)}
                  >
                    <Icon className={`h-4 w-4 mr-2 ${o.color}`} />
                    {o.label}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Bites Taken */}
          <div className="space-y-2">
            <Label>Bites Taken: {bitesTaken}</Label>
            <input
              type="range"
              min="0"
              max="20"
              value={bitesTaken}
              onChange={(e) => setBitesTaken(Number(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Amount Consumed */}
          <div className="space-y-2">
            <Label>Amount Consumed</Label>
            <Select value={amount} onValueChange={setAmount}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AMOUNTS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mood Before */}
          <div className="space-y-2">
            <Label>Mood Before</Label>
            <div className="grid grid-cols-2 gap-2">
              {MOODS.map((m) => (
                <Button
                  key={m.value}
                  type="button"
                  variant={moodBefore === m.value ? "default" : "outline"}
                  onClick={() => setMoodBefore(m.value)}
                >
                  {m.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Mood After */}
          <div className="space-y-2">
            <Label>Mood After</Label>
            <div className="grid grid-cols-2 gap-2">
              {MOODS.map((m) => (
                <Button
                  key={m.value}
                  type="button"
                  variant={moodAfter === m.value ? "default" : "outline"}
                  onClick={() => setMoodAfter(m.value)}
                >
                  {m.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any observations, reactions, or context..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Tracking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
