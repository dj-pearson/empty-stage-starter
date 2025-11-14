import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProgressDashboard } from '@/components/ProgressDashboard';
import { AchievementsView } from '@/components/AchievementsView';
import { WeeklyProgressReport } from '@/components/WeeklyProgressReport';
import { useApp } from '@/contexts/AppContext';
import { Card } from '@/components/ui/card';
import { TrendingUp, Trophy, Calendar } from 'lucide-react';

export default function Progress() {
  const { kids, activeKidId } = useApp();
  const [activeTab, setActiveTab] = useState('overview');

  const activeKid = kids.find(k => k.id === activeKidId);

  if (!activeKid) {
    return (
      <div className="min-h-screen pb-20 md:pt-20 bg-background">
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          <Card className="p-12 text-center">
            <h3 className="text-xl font-semibold mb-2">No Child Selected</h3>
            <p className="text-muted-foreground">
              Please select a child to view progress
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 md:pt-20 bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">{activeKid.name}'s Progress</h1>
          <p className="text-muted-foreground">
            Track growth, celebrate achievements, and review weekly progress
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
            <TabsTrigger value="overview" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="achievements" className="gap-2">
              <Trophy className="h-4 w-4" />
              <span className="hidden sm:inline">Achievements</span>
            </TabsTrigger>
            <TabsTrigger value="weekly" className="gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Weekly Report</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <ProgressDashboard />
          </TabsContent>

          <TabsContent value="achievements" className="space-y-6">
            <AchievementsView />
          </TabsContent>

          <TabsContent value="weekly" className="space-y-6">
            <WeeklyProgressReport />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
