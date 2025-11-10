import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PersonalityScore } from '@/types/quiz';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Legend } from 'recharts';
import { getPersonalityName, getPersonalityColor } from '@/lib/quiz/personalityTypes';

interface PersonalityChartProps {
  scores: PersonalityScore[];
}

export function PersonalityChart({ scores }: PersonalityChartProps) {
  const chartData = scores.map(score => ({
    type: getPersonalityName(score.type),
    score: score.percentage,
    fullMark: 100,
  }));

  const primaryType = scores[0].type;
  const primaryColor = getPersonalityColor(primaryType);

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Personality Profile Breakdown</CardTitle>
        <CardDescription>
          How your child's eating patterns match each personality type
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <RadarChart data={chartData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="type" tick={{ fontSize: 12 }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} />
            <Radar
              name="Match Percentage"
              dataKey="score"
              stroke={primaryColor}
              fill={primaryColor}
              fillOpacity={0.6}
            />
            <Legend />
          </RadarChart>
        </ResponsiveContainer>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-3">
          {scores.map((score, index) => (
            <div
              key={score.type}
              className="p-3 rounded-lg border-2"
              style={{
                borderColor: index === 0 ? getPersonalityColor(score.type) : 'transparent',
                backgroundColor: index === 0 ? `${getPersonalityColor(score.type)}10` : 'transparent',
              }}
            >
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {getPersonalityName(score.type)}
              </div>
              <div className="text-2xl font-bold" style={{ color: getPersonalityColor(score.type) }}>
                {score.percentage}%
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
