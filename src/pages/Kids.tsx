import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ManageKidsDialog } from "@/components/ManageKidsDialog";
import { ProductSafetyChecker } from "@/components/ProductSafetyChecker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserCircle, Check, AlertTriangle } from "lucide-react";

export default function Kids() {
  const { kids, activeKidId, setActiveKid, planEntries } = useApp();

  const getKidStats = (kidId: string) => {
    const kidPlans = planEntries.filter(p => p.kid_id === kidId);
    const completedMeals = kidPlans.filter(p => p.result === "ate").length;
    return { totalMeals: kidPlans.length, completedMeals };
  };

  return (
    <div className="min-h-screen pb-20 md:pt-20 bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Manage Children</h1>
            <p className="text-muted-foreground">
              Select active child and manage profiles
            </p>
          </div>
          <ManageKidsDialog />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {kids.map((kid) => {
            const isActive = kid.id === activeKidId;
            const stats = getKidStats(kid.id);

            return (
              <Card
                key={kid.id}
                className={`cursor-pointer transition-all hover:shadow-lg ${
                  isActive ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => setActiveKid(kid.id)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={kid.profile_picture_url} />
                        <AvatarFallback className="bg-primary/10">
                          <UserCircle className="h-6 w-6 text-primary" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-xl">{kid.name}</CardTitle>
                        {kid.age && (
                          <p className="text-sm text-muted-foreground">
                            Age {kid.age}
                          </p>
                        )}
                        {kid.allergens && kid.allergens.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {kid.allergens.map((allergen) => (
                              <Badge key={allergen} variant="destructive" className="text-xs gap-1">
                                <AlertTriangle className="h-2 w-2" />
                                {allergen}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {isActive && (
                      <div className="flex items-center gap-1 text-primary text-sm font-medium">
                        <Check className="h-4 w-4" />
                        Active
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">
                        Planned Meals
                      </p>
                      <p className="text-2xl font-bold">{stats.totalMeals}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">
                        Completed
                      </p>
                      <p className="text-2xl font-bold text-safe-food">
                        {stats.completedMeals}
                      </p>
                    </div>
                  </div>
                  
                  {kid.allergens && kid.allergens.length > 0 && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <ProductSafetyChecker 
                        kidName={kid.name}
                        kidAllergens={kid.allergens}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {kids.length === 0 && (
          <Card className="p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <UserCircle className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No Children Yet</h3>
              <p className="text-muted-foreground mb-6">
                Add your first child to start planning meals
              </p>
              <ManageKidsDialog />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
