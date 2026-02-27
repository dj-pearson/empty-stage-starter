import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle, Heart, Target, TrendingUp, ChefHat,
  Sparkles, Edit, CheckCircle2, Calendar, Utensils,
  Scale, Ruler, ThumbsUp, ThumbsDown, Leaf
} from "lucide-react";
import { format } from "date-fns";
import { calculateAge } from "@/lib/utils";

interface ChildProfileCardProps {
  kid: {
    id: string;
    name: string;
    age?: number;
    date_of_birth?: string;
    gender?: string;
    height_cm?: number;
    weight_kg?: number;
    profile_picture_url?: string;
    allergens?: string[];
    allergen_severity?: Record<string, string>;
    cross_contamination_sensitive?: boolean;
    dietary_restrictions?: string[];
    health_goals?: string[];
    nutrition_concerns?: string[];
    eating_behavior?: string;
    pickiness_level?: string;
    new_food_willingness?: string;
    texture_sensitivity_level?: string;
    texture_preferences?: string[];
    texture_dislikes?: string[];
    flavor_preferences?: string[];
    preferred_preparations?: string[];
    helpful_strategies?: string[];
    favorite_foods?: string[];
    always_eats_foods?: string[];
    disliked_foods?: string[];
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
  const age = calculateAge(kid.date_of_birth);
  
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
              {age !== null && <p className="text-sm text-muted-foreground">{age} years old</p>}
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

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="health">Health</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="foods">Foods</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
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

            {(kid.gender || kid.height_cm || kid.weight_kg) && (
              <div className="grid grid-cols-3 gap-4 p-3 bg-muted/50 rounded-lg">
                {kid.gender && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Gender</span>
                    <p className="text-sm font-medium capitalize">{kid.gender}</p>
                  </div>
                )}
                {kid.height_cm && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <Ruler className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Height</span>
                    </div>
                    <p className="text-sm font-medium">{kid.height_cm} cm</p>
                  </div>
                )}
                {kid.weight_kg && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <Scale className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Weight</span>
                    </div>
                    <p className="text-sm font-medium">{kid.weight_kg} kg</p>
                  </div>
                )}
              </div>
            )}

            {kid.eating_behavior && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Utensils className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Eating Profile</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Badge variant="outline" className="justify-start">
                    Behavior: {kid.eating_behavior.replace(/_/g, " ")}
                  </Badge>
                  {kid.pickiness_level && (
                    <Badge variant="outline" className="justify-start">
                      Pickiness: {kid.pickiness_level}
                    </Badge>
                  )}
                  {kid.new_food_willingness && (
                    <Badge variant="outline" className="justify-start">
                      New Foods: {kid.new_food_willingness}
                    </Badge>
                  )}
                  {kid.texture_sensitivity_level && (
                    <Badge variant="outline" className="justify-start">
                      Texture Sensitivity: {kid.texture_sensitivity_level}
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
          </TabsContent>

          <TabsContent value="health" className="space-y-4 mt-4">
            {kid.allergens && kid.allergens.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium">Allergens & Severity</span>
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
                {kid.cross_contamination_sensitive && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Cross-contamination sensitive
                  </p>
                )}
              </div>
            )}

            {kid.dietary_restrictions && kid.dietary_restrictions.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Leaf className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Dietary Restrictions</span>
                </div>
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

            {kid.nutrition_concerns && kid.nutrition_concerns.length > 0 && (
              <div className="space-y-2">
                <span className="text-sm font-medium">Nutrition Concerns</span>
                <div className="flex flex-wrap gap-1">
                  {kid.nutrition_concerns.map((concern) => (
                    <Badge key={concern} variant="outline" className="text-xs capitalize">
                      {concern.replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {!kid.allergens?.length && !kid.dietary_restrictions?.length && !kid.health_goals?.length && !kid.nutrition_concerns?.length && (
              <div className="text-center py-6 text-muted-foreground">
                <Heart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">No health info added yet</p>
                <p className="text-xs mt-1">Complete {kid.name}'s profile to add health details, allergens, and nutrition concerns</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="preferences" className="space-y-4 mt-4">
            {kid.texture_preferences && kid.texture_preferences.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ThumbsUp className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Texture Preferences</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {kid.texture_preferences.map((texture) => (
                    <Badge key={texture} variant="outline" className="text-xs capitalize">
                      {texture}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {kid.texture_dislikes && kid.texture_dislikes.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ThumbsDown className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium">Texture Dislikes</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {kid.texture_dislikes.map((texture) => (
                    <Badge key={texture} variant="destructive" className="text-xs capitalize">
                      {texture}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {kid.flavor_preferences && kid.flavor_preferences.length > 0 && (
              <div className="space-y-2">
                <span className="text-sm font-medium">Flavor Preferences</span>
                <div className="flex flex-wrap gap-1">
                  {kid.flavor_preferences.map((flavor) => (
                    <Badge key={flavor} variant="outline" className="text-xs capitalize">
                      {flavor}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {kid.preferred_preparations && kid.preferred_preparations.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ChefHat className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium">Preferred Preparations</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {kid.preferred_preparations.map((prep) => (
                    <Badge key={prep} variant="secondary" className="text-xs capitalize">
                      {prep.replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {kid.helpful_strategies && kid.helpful_strategies.length > 0 && (
              <div className="space-y-2">
                <span className="text-sm font-medium">Helpful Strategies</span>
                <div className="flex flex-wrap gap-1">
                  {kid.helpful_strategies.map((strategy) => (
                    <Badge key={strategy} variant="outline" className="text-xs">
                      {strategy.replace(/_/g, " ")}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {!kid.texture_preferences?.length && !kid.texture_dislikes?.length && !kid.flavor_preferences?.length && !kid.preferred_preparations?.length && !kid.helpful_strategies?.length && (
              <div className="text-center py-6 text-muted-foreground">
                <ChefHat className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">No preferences set yet</p>
                <p className="text-xs mt-1">Complete {kid.name}'s profile to add texture and flavor preferences</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="foods" className="space-y-4 mt-4">
            {kid.always_eats_foods && kid.always_eats_foods.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Always Eats</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {kid.always_eats_foods.map((food) => (
                    <Badge key={food} className="text-xs bg-primary/20 text-primary hover:bg-primary/30">
                      {food}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {kid.favorite_foods && kid.favorite_foods.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium">Favorites</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {kid.favorite_foods.map((food) => (
                    <Badge key={food} className="text-xs bg-accent/20 text-accent-foreground">
                      {food}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {kid.disliked_foods && kid.disliked_foods.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ThumbsDown className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium">Foods to Avoid</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {kid.disliked_foods.map((food) => (
                    <Badge key={food} variant="destructive" className="text-xs">
                      {food}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
