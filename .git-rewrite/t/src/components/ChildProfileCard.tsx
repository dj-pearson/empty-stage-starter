import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { 
  AlertTriangle, Heart, Target, TrendingUp, ChefHat, 
  Sparkles, Edit, CheckCircle2, Calendar 
} from "lucide-react";
import { format } from "date-fns";

interface ChildProfileCardProps {
  kid: {
    id: string;
    name: string;
    age?: number;
    date_of_birth?: string;
    profile_picture_url?: string;
    allergens?: string[];
    allergen_severity?: Record<string, string>;
    dietary_restrictions?: string[];
    health_goals?: string[];
    nutrition_concerns?: string[];
    eating_behavior?: string;
    new_food_willingness?: string;
    texture_preferences?: string[];
    flavor_preferences?: string[];
    favorite_foods?: string[];
    always_eats_foods?: string[];
    profile_completed?: boolean;
    profile_last_reviewed?: string;
  };
  safeFoodsCount: number;
  tryBitesCount: number;
  totalMeals: number;
  completedMeals: number;
  onEdit: () => void;
  onCompleteProfile: () => void;
}

export function ChildProfileCard({ 
  kid, 
  safeFoodsCount, 
  tryBitesCount, 
  totalMeals, 
  completedMeals,
  onEdit,
  onCompleteProfile
}: ChildProfileCardProps) {
  const mealProgress = totalMeals > 0 ? (completedMeals / totalMeals) * 100 : 0;
  
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border-2 border-background shadow-md">
              <AvatarImage src={kid.profile_picture_url} />
              <AvatarFallback className="text-xl">{kid.name[0]}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="flex items-center gap-2">
                {kid.name}
                {kid.profile_completed && (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                )}
              </CardTitle>
              {kid.age && <p className="text-sm text-muted-foreground">{kid.age} years old</p>}
              {kid.profile_last_reviewed && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Calendar className="h-3 w-3" />
                  Last updated: {format(new Date(kid.profile_last_reviewed), "MMM d, yyyy")}
                </p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {!kid.profile_completed && (
          <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">Complete {kid.name}'s profile</p>
              </div>
              <Button size="sm" onClick={onCompleteProfile}>
                Start
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Get personalized meal plans by answering a few questions
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Safe Foods</span>
            </div>
            <p className="text-2xl font-bold">{safeFoodsCount}</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ChefHat className="h-4 w-4 text-accent" />
              <span className="text-sm font-medium">Try Bites</span>
            </div>
            <p className="text-2xl font-bold">{tryBitesCount}</p>
          </div>
        </div>

        {kid.allergens && kid.allergens.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-medium">Allergens</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {kid.allergens.map((allergen) => (
                <Badge key={allergen} variant="destructive" className="text-xs">
                  {allergen}
                  {kid.allergen_severity?.[allergen] && 
                    ` (${kid.allergen_severity[allergen]})`
                  }
                </Badge>
              ))}
            </div>
          </div>
        )}

        {kid.dietary_restrictions && kid.dietary_restrictions.length > 0 && (
          <div className="space-y-2">
            <span className="text-sm font-medium">Dietary Restrictions</span>
            <div className="flex flex-wrap gap-1">
              {kid.dietary_restrictions.map((restriction) => (
                <Badge key={restriction} variant="secondary" className="text-xs capitalize">
                  {restriction}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {kid.health_goals && kid.health_goals.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Health Goals</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {kid.health_goals.map((goal) => (
                <Badge key={goal} variant="outline" className="text-xs capitalize">
                  {goal.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {kid.eating_behavior && (
          <div className="space-y-1">
            <span className="text-sm font-medium">Eating Behavior</span>
            <p className="text-sm text-muted-foreground capitalize">
              {kid.eating_behavior.replace(/_/g, " ")}
            </p>
          </div>
        )}

        {kid.texture_preferences && kid.texture_preferences.length > 0 && (
          <div className="space-y-2">
            <span className="text-sm font-medium">Texture Preferences</span>
            <div className="flex flex-wrap gap-1">
              {kid.texture_preferences.slice(0, 5).map((texture) => (
                <Badge key={texture} variant="outline" className="text-xs capitalize">
                  {texture}
                </Badge>
              ))}
              {kid.texture_preferences.length > 5 && (
                <Badge variant="outline" className="text-xs">
                  +{kid.texture_preferences.length - 5} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {kid.flavor_preferences && kid.flavor_preferences.length > 0 && (
          <div className="space-y-2">
            <span className="text-sm font-medium">Flavor Preferences</span>
            <div className="flex flex-wrap gap-1">
              {kid.flavor_preferences.slice(0, 5).map((flavor) => (
                <Badge key={flavor} variant="outline" className="text-xs capitalize">
                  {flavor}
                </Badge>
              ))}
              {kid.flavor_preferences.length > 5 && (
                <Badge variant="outline" className="text-xs">
                  +{kid.flavor_preferences.length - 5} more
                </Badge>
              )}
            </div>
          </div>
        )}

        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Meal Progress</span>
            <span className="font-medium">{completedMeals} / {totalMeals}</span>
          </div>
          <Progress value={mealProgress} className="h-2" />
        </div>
      </CardContent>
    </Card>
  );
}
