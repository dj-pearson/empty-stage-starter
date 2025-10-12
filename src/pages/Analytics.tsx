import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, Award, ThumbsDown, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { ResultHistoryCard } from "@/components/ResultHistoryCard";

const RESULT_COLORS = {
  ate: "hsl(var(--safe-food))",
  tasted: "hsl(var(--secondary))",
  refused: "hsl(var(--destructive))",
};

export default function Analytics() {
  const { foods, activeKidId, planEntries, kids, setActiveKidId } = useApp();
  const activeKid = kids.find(k => k.id === activeKidId);
  const isFamilyMode = !activeKidId;

  // Filter entries - all kids if family mode, or specific kid
  const kidEntries = useMemo(() => 
    isFamilyMode 
      ? planEntries.filter(e => e.result !== null)
      : planEntries.filter(e => e.kid_id === activeKidId && e.result !== null),
    [planEntries, activeKidId, isFamilyMode]
  );

  // Overall stats
  const stats = useMemo(() => {
    const total = kidEntries.length;
    const ate = kidEntries.filter(e => e.result === "ate").length;
    const tasted = kidEntries.filter(e => e.result === "tasted").length;
    const refused = kidEntries.filter(e => e.result === "refused").length;
    
    return {
      total,
      ate,
      tasted,
      refused,
      successRate: total > 0 ? Math.round(((ate + tasted) / total) * 100) : 0,
    };
  }, [kidEntries]);

  // Food performance data
  const foodStats = useMemo(() => {
    const foodMap: Record<string, { name: string; ate: number; tasted: number; refused: number; total: number }> = {};
    
    kidEntries.forEach(entry => {
      const food = foods.find(f => f.id === entry.food_id);
      if (!food) return;
      
      if (!foodMap[food.id]) {
        foodMap[food.id] = { name: food.name, ate: 0, tasted: 0, refused: 0, total: 0 };
      }
      
      foodMap[food.id].total++;
      if (entry.result === "ate") foodMap[food.id].ate++;
      else if (entry.result === "tasted") foodMap[food.id].tasted++;
      else if (entry.result === "refused") foodMap[food.id].refused++;
    });
    
    return Object.values(foodMap).sort((a, b) => b.total - a.total);
  }, [kidEntries, foods]);

  // Top performers (most eaten)
  const topFoods = useMemo(() => 
    foodStats
      .filter(f => f.ate > 0)
      .sort((a, b) => b.ate - a.ate)
      .slice(0, 5),
    [foodStats]
  );

  // Most refused
  const mostRefused = useMemo(() =>
    foodStats
      .filter(f => f.refused > 0)
      .sort((a, b) => b.refused - a.refused)
      .slice(0, 5),
    [foodStats]
  );

  // Results distribution for pie chart
  const resultsData = [
    { name: "Ate", value: stats.ate, color: RESULT_COLORS.ate },
    { name: "Tasted", value: stats.tasted, color: RESULT_COLORS.tasted },
    { name: "Refused", value: stats.refused, color: RESULT_COLORS.refused },
  ];

  // Top 10 foods for bar chart
  const chartData = foodStats.slice(0, 10).map(f => ({
    name: f.name.length > 15 ? f.name.slice(0, 15) + "..." : f.name,
    Ate: f.ate,
    Tasted: f.tasted,
    Refused: f.refused,
  }));

  if (!activeKid) {
    return (
      <div className="min-h-screen pb-20 md:pt-20 bg-background">
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          <Card className="p-12 text-center">
            <h3 className="text-xl font-semibold mb-2">No Child Selected</h3>
            <p className="text-muted-foreground">Please select a child to view analytics</p>
          </Card>
        </div>
      </div>
    );
  }

  if (kidEntries.length === 0) {
    return (
      <div className="min-h-screen pb-20 md:pt-20 bg-background">
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          <h1 className="text-3xl font-bold mb-2">
            Food Analytics - {activeKid.name}
          </h1>
          <p className="text-muted-foreground mb-8">Track meal outcomes and food preferences</p>
          
          <Card className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No Data Yet</h3>
            <p className="text-muted-foreground">
              Start tracking meals by marking them as Ate, Tasted, or Refused in the Planner
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 md:pt-20 bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            Food Analytics - {activeKid.name}
          </h1>
          <p className="text-muted-foreground">Track meal outcomes and food preferences</p>
        </div>

        {/* Overall Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Tracked</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Ate</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-safe-food">{stats.ate}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Tasted</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-secondary">{stats.tasted}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Refused</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-destructive">{stats.refused}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Success Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{stats.successRate}%</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Results Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Meal Outcomes Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={resultsData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => {
                      const numValue = Number(value) || 0;
                      const percent = stats.total > 0 ? ((numValue / stats.total) * 100).toFixed(0) : 0;
                      return `${name}: ${percent}%`;
                    }}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {resultsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Top Foods Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Top 10 Foods Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} fontSize={12} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Ate" stackId="a" fill={RESULT_COLORS.ate} />
                  <Bar dataKey="Tasted" stackId="a" fill={RESULT_COLORS.tasted} />
                  <Bar dataKey="Refused" stackId="a" fill={RESULT_COLORS.refused} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Top Performers & Most Refused */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Top Foods */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5 text-primary" />
                Top 5 Favorite Foods
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topFoods.length > 0 ? (
                  topFoods.map((food, index) => (
                    <div key={food.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="font-bold text-primary">{index + 1}</span>
                        </div>
                        <div>
                          <p className="font-medium">{food.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {food.ate} ate, {food.tasted} tasted
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-safe-food text-white">
                        {Math.round((food.ate / food.total) * 100)}%
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No foods fully eaten yet</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Most Refused */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ThumbsDown className="h-5 w-5 text-destructive" />
                Most Challenging Foods
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mostRefused.length > 0 ? (
                  mostRefused.map((food, index) => (
                    <div key={food.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
                          <span className="font-bold text-destructive">{index + 1}</span>
                        </div>
                        <div>
                          <p className="font-medium">{food.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {food.refused} refused, {food.tasted} tasted
                          </p>
                        </div>
                      </div>
                      <Badge variant="destructive">
                        {Math.round((food.refused / food.total) * 100)}%
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No refused foods yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Result History */}
        <div className="mt-6">
          <ResultHistoryCard entries={kidEntries} foods={foods} />
        </div>

        {/* Insights Card */}
        <Card className="mt-6 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Insights</h3>
                {stats.successRate >= 70 && (
                  <p className="text-sm text-muted-foreground mb-2">
                    🎉 Great job! {activeKid.name} has a {stats.successRate}% success rate. Keep up the positive meal experiences!
                  </p>
                )}
                {topFoods.length > 0 && (
                  <p className="text-sm text-muted-foreground mb-2">
                    ⭐ {topFoods[0].name} is {activeKid.name}'s favorite food with {topFoods[0].ate} successful meals.
                  </p>
                )}
                {mostRefused.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    💡 Try pairing {mostRefused[0].name} with favorite foods to increase acceptance.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
