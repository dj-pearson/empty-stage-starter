import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle,
  XCircle,
  Minus,
  AlertTriangle,
  TrendingUp,
  Camera,
  Plus,
  Trophy,
  Star,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

interface FoodAttempt {
  id: string;
  food_id: string;
  attempted_at: string;
  stage: string;
  outcome: string;
  bites_taken: number;
  amount_consumed: string;
  mood_before: string;
  mood_after: string;
  reaction_notes: string;
  parent_notes: string;
  is_milestone: boolean;
  foods: {
    name: string;
  };
}

interface Achievement {
  id: string;
  achievement_name: string;
  achievement_description: string;
  icon_name: string;
  points_value: number;
  earned_at: string;
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

export function FoodSuccessTracker() {
  const { activeKidId, kids, foods } = useApp();
  const [attempts, setAttempts] = useState<FoodAttempt[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedFood, setSelectedFood] = useState("");
  const activeKid = kids.find(k => k.id === activeKidId);
  const [filterOutcome, setFilterOutcome] = useState<string>("all");

  // Form state
  const [attemptForm, setAttemptForm] = useState({
    food_id: "",
    stage: "full_bite",
    outcome: "success",
    bites_taken: 1,
    amount_consumed: "most",
    mood_before: "neutral",
    mood_after: "happy",
    reaction_notes: "",
    parent_notes: "",
    is_milestone: false,
  });

  const loadAttempts = useCallback(async () => {
    try {
      setLoading(true);

      let query = supabase
        .from("food_attempts")
        .select(`
          *,
          foods (name)
        `)
        .eq("kid_id", activeKidId)
        .order("attempted_at", { ascending: false })
        .limit(50);

      if (filterOutcome !== "all") {
        query = query.eq("outcome", filterOutcome);
      }

      const { data, error } = await query;
      if (error) throw error;

      setAttempts(data || []);
    } catch (error: unknown) {
      logger.error("Error loading attempts:", error);
      toast.error("Failed to load food attempts");
    } finally {
      setLoading(false);
    }
  }, [activeKidId, filterOutcome]);

  const loadAchievements = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("kid_achievements")
        .select("*")
        .eq("kid_id", activeKidId)
        .order("earned_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      setAchievements(data || []);
    } catch (error: unknown) {
      logger.error("Error loading achievements:", error);
    }
  }, [activeKidId]);

  useEffect(() => {
    if (activeKidId) {
      loadAttempts();
      loadAchievements();
    }
  }, [activeKidId, loadAttempts, loadAchievements]);

  const handleAddAttempt = async () => {
    if (!attemptForm.food_id) {
      toast.error("Please select a food");
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase.from("food_attempts").insert([
        {
          kid_id: activeKidId,
          ...attemptForm,
        },
      ]);

      if (error) throw error;

      toast.success("Food attempt logged!");
      setShowAddDialog(false);
      resetForm();
      loadAttempts();
      loadAchievements(); // Reload to show new achievements
    } catch (error: unknown) {
      logger.error("Error adding attempt:", error);
      toast.error("Failed to log attempt");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setAttemptForm({
      food_id: "",
      stage: "full_bite",
      outcome: "success",
      bites_taken: 1,
      amount_consumed: "most",
      mood_before: "neutral",
      mood_after: "happy",
      reaction_notes: "",
      parent_notes: "",
      is_milestone: false,
    });
  };

  const getOutcomeIcon = (outcome: string) => {
    const match = OUTCOMES.find((o) => o.value === outcome);
    if (!match) return null;
    const Icon = match.icon;
    return <Icon className={cn("h-5 w-5", match.color)} />;
  };

  const getOutcomeBadge = (outcome: string) => {
    const colors: Record<string, string> = {
      success: "bg-safe-food text-white",
      partial: "bg-yellow-500 text-white",
      refused: "bg-gray-500 text-white",
      tantrum: "bg-red-500 text-white",
    };

    return (
      <Badge className={colors[outcome] || "bg-gray-500 text-white"}>
        {outcome.charAt(0).toUpperCase() + outcome.slice(1)}
      </Badge>
    );
  };

  const getStageBadge = (stage: string) => {
    const stageInfo = STAGES.find((s) => s.value === stage);
    return (
      <Badge variant="outline" className="text-xs">
        {stageInfo?.label || stage}
      </Badge>
    );
  };

  const getAchievementIcon = (iconName: string) => {
    const icons: Record<string, any> = {
      star: Star,
      trophy: Trophy,
      medal: Trophy,
      crown: Trophy,
    };
    const Icon = icons[iconName] || Star;
    return <Icon className="h-5 w-5 text-yellow-500" />;
  };

  // Calculate stats
  const totalAttempts = attempts.length;
  const successfulAttempts = attempts.filter((a) => a.outcome === "success").length;
  const successRate = totalAttempts > 0 ? (successfulAttempts / totalAttempts) * 100 : 0;
  const uniqueFoodsTried = new Set(attempts.map((a) => a.food_id)).size;
  const totalPoints = achievements.reduce((sum, a) => sum + a.points_value, 0);

  if (!activeKidId) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          <p>Please select a child to track food attempts</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <TrendingUp className="h-6 w-6 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold">{totalAttempts}</div>
              <p className="text-xs text-muted-foreground">Total Attempts</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <CheckCircle className="h-6 w-6 mx-auto mb-2 text-safe-food" />
              <div className="text-2xl font-bold">{successfulAttempts}</div>
              <p className="text-xs text-muted-foreground">Successes</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <Star className="h-6 w-6 mx-auto mb-2 text-accent" />
              <div className="text-2xl font-bold">{Math.round(successRate)}%</div>
              <p className="text-xs text-muted-foreground">Success Rate</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <Calendar className="h-6 w-6 mx-auto mb-2 text-try-bite" />
              <div className="text-2xl font-bold">{uniqueFoodsTried}</div>
              <p className="text-xs text-muted-foreground">Foods Tried</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <Trophy className="h-6 w-6 mx-auto mb-2 text-yellow-500" />
              <div className="text-2xl font-bold">{totalPoints}</div>
              <p className="text-xs text-muted-foreground">Points Earned</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Achievements */}
      {achievements.length > 0 && (
        <Card className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/20">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Recent Achievements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {achievements.slice(0, 5).map((achievement) => (
                <div
                  key={achievement.id}
                  className="flex flex-col items-center min-w-[120px] p-4 bg-white dark:bg-gray-800 rounded-lg border"
                >
                  {getAchievementIcon(achievement.icon_name)}
                  <p className="text-sm font-semibold mt-2 text-center">
                    {achievement.achievement_name}
                  </p>
                  <p className="text-xs text-muted-foreground text-center">
                    {achievement.achievement_description}
                  </p>
                  <Badge variant="secondary" className="mt-2 text-xs">
                    +{achievement.points_value} pts
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Attempts List */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Food Attempts</CardTitle>
                <CardDescription>Track every attempt to help build confidence</CardDescription>
              </div>
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Log Attempt
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Select value={filterOutcome} onValueChange={setFilterOutcome}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Outcomes</SelectItem>
                  <SelectItem value="success">Success Only</SelectItem>
                  <SelectItem value="partial">Partial Only</SelectItem>
                  <SelectItem value="refused">Refused Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading && attempts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : attempts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="mb-2">No food attempts logged yet!</p>
                <p className="text-sm">Click "Log Attempt" to start tracking</p>
              </div>
            ) : (
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-3">
                  {attempts.map((attempt) => (
                    <Card key={attempt.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="pt-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="font-semibold flex items-center gap-2">
                              {attempt.foods.name}
                              {attempt.is_milestone && (
                                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                              )}
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(attempt.attempted_at), "MMM d, yyyy 'at' h:mm a")}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {getStageBadge(attempt.stage)}
                            {getOutcomeBadge(attempt.outcome)}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                          <div>
                            <span className="text-muted-foreground">Bites:</span>{" "}
                            <span className="font-medium">{attempt.bites_taken}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Amount:</span>{" "}
                            <span className="font-medium">{attempt.amount_consumed}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Mood Before:</span>{" "}
                            <span className="font-medium">{attempt.mood_before}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Mood After:</span>{" "}
                            <span className="font-medium">{attempt.mood_after}</span>
                          </div>
                        </div>

                        {attempt.parent_notes && (
                          <p className="text-sm text-muted-foreground italic">
                            "{attempt.parent_notes}"
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {OUTCOMES.map((outcome) => {
                const count = attempts.filter((a) => a.outcome === outcome.value).length;
                const percentage = totalAttempts > 0 ? (count / totalAttempts) * 100 : 0;
                const Icon = outcome.icon;

                return (
                  <div key={outcome.value}>
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-2">
                        <Icon className={cn("h-4 w-4", outcome.color)} />
                        <span className="text-sm font-medium">{outcome.label}</span>
                      </div>
                      <span className="text-sm font-semibold">{count}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full transition-all", {
                          "bg-safe-food": outcome.value === "success",
                          "bg-yellow-500": outcome.value === "partial",
                          "bg-gray-500": outcome.value === "refused",
                          "bg-red-500": outcome.value === "tantrum",
                        })}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Attempt Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log Food Attempt</DialogTitle>
            <DialogDescription>Track every attempt to build a success history</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Food *</Label>
              <Select
                value={attemptForm.food_id}
                onValueChange={(value) => setAttemptForm({ ...attemptForm, food_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select food" />
                </SelectTrigger>
                <SelectContent>
                  {foods.map((food) => (
                    <SelectItem key={food.id} value={food.id}>
                      {food.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Stage</Label>
                <Select
                  value={attemptForm.stage}
                  onValueChange={(value) => setAttemptForm({ ...attemptForm, stage: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map((stage) => (
                      <SelectItem key={stage.value} value={stage.value}>
                        {stage.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Outcome *</Label>
                <Select
                  value={attemptForm.outcome}
                  onValueChange={(value) => setAttemptForm({ ...attemptForm, outcome: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OUTCOMES.map((outcome) => (
                      <SelectItem key={outcome.value} value={outcome.value}>
                        {outcome.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Bites Taken</Label>
                <Input
                  type="number"
                  min="0"
                  value={attemptForm.bites_taken}
                  onChange={(e) =>
                    setAttemptForm({ ...attemptForm, bites_taken: parseInt(e.target.value) || 0 })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Amount Consumed</Label>
                <Select
                  value={attemptForm.amount_consumed}
                  onValueChange={(value) =>
                    setAttemptForm({ ...attemptForm, amount_consumed: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="quarter">Quarter</SelectItem>
                    <SelectItem value="half">Half</SelectItem>
                    <SelectItem value="most">Most</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Mood Before</Label>
                <Select
                  value={attemptForm.mood_before}
                  onValueChange={(value) => setAttemptForm({ ...attemptForm, mood_before: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOODS.map((mood) => (
                      <SelectItem key={mood.value} value={mood.value}>
                        {mood.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Mood After</Label>
                <Select
                  value={attemptForm.mood_after}
                  onValueChange={(value) => setAttemptForm({ ...attemptForm, mood_after: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOODS.map((mood) => (
                      <SelectItem key={mood.value} value={mood.value}>
                        {mood.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Parent Notes</Label>
              <Textarea
                value={attemptForm.parent_notes}
                onChange={(e) => setAttemptForm({ ...attemptForm, parent_notes: e.target.value })}
                placeholder="Any observations, strategies used, or context..."
                rows={3}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="milestone"
                checked={attemptForm.is_milestone}
                onChange={(e) =>
                  setAttemptForm({ ...attemptForm, is_milestone: e.target.checked })
                }
                className="rounded"
              />
              <Label htmlFor="milestone" className="cursor-pointer">
                Mark as milestone (first time, breakthrough, etc.)
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDialog(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleAddAttempt} disabled={loading}>
              Save Attempt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
