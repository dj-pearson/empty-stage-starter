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
          <Card className="p-12 text-center">
            <CardContent>
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <UserCircle className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No children added yet</h3>
              <p className="text-muted-foreground mb-6">
                Add a child to start creating personalized meal plans
              </p>
              <Button onClick={() => manageKidsRef.current?.openForEdit('')} className="gap-2">
                <UserPlus className="h-4 w-4" />
                Add Your First Child
              </Button>
            </CardContent>
          </Card>
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
