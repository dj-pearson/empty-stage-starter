import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ManageKidsDialog, ManageKidsDialogRef } from "@/components/ManageKidsDialog";
import { ProductSafetyChecker } from "@/components/ProductSafetyChecker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserCircle, Check, AlertTriangle, Heart, Pencil, Trash2, UserPlus } from "lucide-react";
import { differenceInYears } from "date-fns";
import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export default function Kids() {
  const { kids, activeKidId, setActiveKid, planEntries, deleteKid } = useApp();
  const manageDialogRef = useRef<ManageKidsDialogRef>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const calculateAge = (dob: string) => {
    return differenceInYears(new Date(), new Date(dob));
  };

  const getKidStats = (kidId: string) => {
    const kidPlans = planEntries.filter(p => p.kid_id === kidId);
    const completedMeals = kidPlans.filter(p => p.result === "ate").length;
    return { totalMeals: kidPlans.length, completedMeals };
  };

  const handleDelete = (id: string) => {
    if (kids.length === 1) {
      toast.error("You must have at least one child");
      return;
    }
    deleteKid(id);
    setDeleteId(null);
    toast.success("Child removed");
  };

  return (
    <div className="min-h-screen pt-4 pb-20 md:pt-24 bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Manage Children</h1>
            <p className="text-muted-foreground">
              Select active child and manage profiles
            </p>
          </div>
          <Button onClick={() => manageDialogRef.current?.openForEdit('')} className="gap-2">
            <UserPlus className="h-4 w-4" />
            Add Child
          </Button>
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
                        {kid.date_of_birth && (
                          <p className="text-sm text-muted-foreground">
                            Age {calculateAge(kid.date_of_birth)}
                          </p>
                        )}
                        {kid.favorite_foods && kid.favorite_foods.length > 0 && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                            <Heart className="h-3 w-3" />
                            <span>{kid.favorite_foods.length} favorite foods</span>
                          </div>
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
                    <div className="flex items-center gap-1">
                      {isActive && (
                        <div className="flex items-center gap-1 text-primary text-sm font-medium mr-2">
                          <Check className="h-4 w-4" />
                          Active
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          manageDialogRef.current?.openForEdit(kid.id);
                        }}
                        title="Edit profile"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteId(kid.id);
                        }}
                        disabled={kids.length === 1}
                        title="Delete child"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
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
              <Button onClick={() => manageDialogRef.current?.openForEdit('')} className="gap-2">
                <UserPlus className="h-4 w-4" />
                Add Child
              </Button>
            </div>
          </Card>
        )}

        <ManageKidsDialog ref={manageDialogRef} />

        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Child Profile?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all meal plans and data for this child. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteId && handleDelete(deleteId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
