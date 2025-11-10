import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SampleMeal } from '@/types/quiz';
import { Clock, ChefHat } from 'lucide-react';

interface SampleMealsCarouselProps {
  meals: SampleMeal[];
}

export function SampleMealsCarousel({ meals }: SampleMealsCarouselProps) {
  const difficultyColors = {
    easy: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    hard: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <ChefHat className="w-6 h-6 text-primary" />
        <h2 className="text-3xl font-bold">Sample Meal Ideas</h2>
      </div>
      <p className="text-gray-600 dark:text-gray-300 mb-6">
        Meals that kids with this personality type typically love
      </p>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {meals.map((meal) => (
          <Card key={meal.id} className="shadow-md hover:shadow-xl transition-all overflow-hidden">
            {meal.image && (
              <div className="h-48 bg-gradient-to-br from-primary/20 to-purple-200 dark:from-primary/40 dark:to-purple-900 flex items-center justify-center">
                <span className="text-6xl">🍽️</span>
              </div>
            )}
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg">{meal.name}</CardTitle>
                <Badge className={difficultyColors[meal.difficulty]}>
                  {meal.difficulty}
                </Badge>
              </div>
              <CardDescription>{meal.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Clock className="w-4 h-4" />
                <span>{meal.prepTime} minutes</span>
              </div>

              <div>
                <h4 className="font-semibold text-sm mb-2">Key Ingredients:</h4>
                <div className="flex flex-wrap gap-1">
                  {meal.ingredients.slice(0, 4).map((ingredient, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {ingredient}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="bg-primary/5 dark:bg-primary/10 p-3 rounded-lg">
                <h4 className="font-semibold text-sm mb-1">Why It Works:</h4>
                <p className="text-xs text-gray-700 dark:text-gray-300">
                  {meal.whyItWorks}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {meals.length === 0 && (
        <div className="text-center text-gray-500 py-8">
          <p>More meal ideas coming soon!</p>
        </div>
      )}
    </div>
  );
}
