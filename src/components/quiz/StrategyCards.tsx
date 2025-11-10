import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MealStrategy } from '@/types/quiz';
import { Lightbulb } from 'lucide-react';

interface StrategyCardsProps {
  strategies: MealStrategy[];
}

export function StrategyCards({ strategies }: StrategyCardsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="w-6 h-6 text-primary" />
        <h2 className="text-3xl font-bold">Personalized Feeding Strategies</h2>
      </div>
      <p className="text-gray-600 dark:text-gray-300 mb-6">
        Proven strategies specifically designed for your child's eating personality
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        {strategies.map((strategy, index) => (
          <Card key={index} className="shadow-md hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="text-2xl">{strategy.icon}</span>
                {strategy.title}
              </CardTitle>
              <CardDescription>{strategy.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {strategy.tips.map((tip, tipIndex) => (
                  <li key={tipIndex} className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span className="text-sm">{tip}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
