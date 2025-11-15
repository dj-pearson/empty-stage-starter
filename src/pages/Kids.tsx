import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserCircle, UserPlus } from "lucide-react";
import { ManageKidsDialog, ManageKidsDialogRef } from "@/components/ManageKidsDialog";
import { ChildIntakeQuestionnaire } from "@/components/ChildIntakeQuestionnaire";
import { ChildProfileCard } from "@/components/ChildProfileCard";
import { useRef, useState } from "react";
import { toast } from "sonner";

export default function Kids() {
  const { kids, foods, planEntries } = useApp();
  const manageKidsRef = useRef<ManageKidsDialogRef>(null);
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);
  const [selectedKidForQuestionnaire, setSelectedKidForQuestionnaire] = useState<{ id: string; name: string } | null>(null);

  const getKidStats = (kidId: string) => {
    const kidMeals = planEntries.filter(entry => entry.kid_id === kidId);
    const totalMeals = kidMeals.length;
    const completedMeals = kidMeals.filter(entry => entry.result === "ate").length;
    const safeFoodsCount = foods.filter(f => f.is_safe).length;
    const tryBitesCount = foods.filter(f => f.is_try_bite).length;
    return { totalMeals, completedMeals, safeFoodsCount, tryBitesCount };
  };

  const handleCompleteProfile = (kid: { id: string; name: string }) => {
    setSelectedKidForQuestionnaire(kid);
    setQuestionnaireOpen(true);
  };

  const handleQuestionnaireComplete = () => {
    // Refresh happens automatically through context
    toast.success("Profile updated successfully!");
  };

  return (
    <div className="min-h-screen pt-4 pb-20 md:pt-24 bg-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">My Children</h1>
            <p className="text-muted-foreground">
              Manage child profiles and food preferences
            </p>
          </div>
          <Button onClick={() => manageKidsRef.current?.openForEdit('')} className="gap-2">
            <UserPlus className="h-4 w-4" />
            Add Child
          </Button>
        </div>

        {kids.length === 0 ? (
          <div className="max-w-3xl mx-auto">
            <Card>
              <CardContent className="pt-12 pb-8 px-6">
                <div className="text-center mb-8">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <UserCircle className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold mb-2">Add Your First Child</h3>
                  <p className="text-muted-foreground max-w-xl mx-auto mb-6">
                    Create a profile to get personalized meal plans, track food preferences,
                    and monitor eating progress for your child.
                  </p>
                  <Button onClick={() => manageKidsRef.current?.openForEdit('')} size="lg" className="gap-2">
                    <UserPlus className="h-5 w-5" />
                    Create Child Profile
                  </Button>
                </div>

                {/* Information Cards */}
                <div className="grid md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <div className="text-2xl mb-2">🎯</div>
                    <h4 className="font-semibold text-sm mb-1">Track Preferences</h4>
                    <p className="text-xs text-muted-foreground">
                      Safe foods, textures, and allergens
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <div className="text-2xl mb-2">📊</div>
                    <h4 className="font-semibold text-sm mb-1">Monitor Progress</h4>
                    <p className="text-xs text-muted-foreground">
                      See what foods are working
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4 text-center">
                    <div className="text-2xl mb-2">🤖</div>
                    <h4 className="font-semibold text-sm mb-1">AI Meal Plans</h4>
                    <p className="text-xs text-muted-foreground">
                      Personalized to their preferences
                    </p>
                  </div>
                </div>

                {/* Quick Tips */}
                <div className="border-t pt-6">
                  <p className="text-sm font-semibold mb-3">What you'll need:</p>
                  <div className="grid md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                    <div className="flex gap-2">
                      <span className="text-primary">•</span>
                      <span>Child's name and basic info (age, gender)</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-primary">•</span>
                      <span>Any food allergies or restrictions</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-primary">•</span>
                      <span>Optional: texture preferences</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-primary">•</span>
                      <span>Optional: photo for their profile</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {kids.map((kid) => {
              const stats = getKidStats(kid.id);
              
              return (
                <ChildProfileCard
                  key={kid.id}
                  kid={kid}
                  safeFoodsCount={stats.safeFoodsCount}
                  tryBitesCount={stats.tryBitesCount}
                  totalMeals={stats.totalMeals}
                  completedMeals={stats.completedMeals}
                  onEdit={() => manageKidsRef.current?.openForEdit(kid.id)}
                  onCompleteProfile={() => handleCompleteProfile({ id: kid.id, name: kid.name })}
                />
              );
            })}
          </div>
        )}

        <ManageKidsDialog ref={manageKidsRef} />

        {selectedKidForQuestionnaire && (
          <ChildIntakeQuestionnaire
            open={questionnaireOpen}
            onOpenChange={setQuestionnaireOpen}
            kidId={selectedKidForQuestionnaire.id}
            kidName={selectedKidForQuestionnaire.name}
            onComplete={handleQuestionnaireComplete}
          />
        )}
      </div>
    </div>
  );
}
