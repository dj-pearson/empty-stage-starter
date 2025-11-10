import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FoodRecommendations } from '@/types/quiz';
import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react';

interface FoodRecommendationsDisplayProps {
  recommendations: FoodRecommendations;
}

export function FoodRecommendationsDisplay({ recommendations }: FoodRecommendationsDisplayProps) {
  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Food Recommendations</CardTitle>
        <CardDescription>
          Personalized food suggestions based on your child's eating personality
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-3 gap-6">
          {/* Green Light Foods */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <h3 className="font-semibold text-lg">Green Light Foods</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              High likelihood of acceptance
            </p>
            <div className="space-y-2">
              {recommendations.greenLight.map((food, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {food.icon && <span className="text-xl">{food.icon}</span>}
                    <span className="font-medium text-sm">{food.name}</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {food.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Yellow Light Foods */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              <h3 className="font-semibold text-lg">Yellow Light Foods</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Introduce with care
            </p>
            <div className="space-y-2">
              {recommendations.yellowLight.map((food, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {food.icon && <span className="text-xl">{food.icon}</span>}
                    <span className="font-medium text-sm">{food.name}</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {food.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Red Light Foods */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <XCircle className="w-5 h-5 text-red-500" />
              <h3 className="font-semibold text-lg">Red Light Foods</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Avoid for now
            </p>
            <div className="space-y-2">
              {recommendations.redLight.map((food, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {food.icon && <span className="text-xl">{food.icon}</span>}
                    <span className="font-medium text-sm">{food.name}</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {food.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
