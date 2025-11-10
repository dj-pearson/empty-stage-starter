import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProgressStep } from '@/types/quiz';
import { TrendingUp, CheckCircle2 } from 'lucide-react';

interface ProgressPathwayProps {
  pathway: ProgressStep[];
}

export function ProgressPathway({ pathway }: ProgressPathwayProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-6 h-6 text-primary" />
        <h2 className="text-3xl font-bold">Your Child's Progress Pathway</h2>
      </div>
      <p className="text-gray-600 dark:text-gray-300 mb-6">
        A roadmap showing where your child is now and where they're heading
      </p>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-primary/30 hidden md:block" />

        <div className="space-y-6">
          {pathway.map((step, index) => (
            <Card
              key={step.phase}
              className="shadow-md hover:shadow-lg transition-shadow md:ml-16 relative"
            >
              {/* Phase number badge */}
              <div className="absolute -left-20 top-6 hidden md:flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-lg shadow-lg">
                {step.phase}
              </div>

              <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="text-xl">{step.title}</CardTitle>
                    <CardDescription className="mt-1">{step.description}</CardDescription>
                  </div>
                  <Badge variant="outline" className="whitespace-nowrap">
                    {step.duration}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <h4 className="font-semibold text-sm mb-3">Milestones:</h4>
                <div className="space-y-2">
                  {step.milestones.map((milestone, mIndex) => (
                    <div key={mIndex} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{milestone}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
