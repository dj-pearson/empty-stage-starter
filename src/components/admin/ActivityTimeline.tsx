/**
 * Activity Timeline Admin Component
 *
 * Provides a complete history of user actions for support and analytics.
 * Features search, filtering, and export capabilities.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  RefreshCw,
  Search,
  Download,
  Filter,
  Clock,
  User,
  Calendar,
  ChefHat,
  ShoppingCart,
  Baby,
  CreditCard,
  Sparkles,
  FileText,
  Upload,
} from 'lucide-react';
import { activityTracker, ActivityEntry, ActivityCategory, ActivityType } from '@/lib/activity-tracker';
import { downloadJSON, downloadCSV } from '@/lib/file-utils';
import { cn } from '@/lib/utils';

/**
 * Category icons
 */
const CATEGORY_ICONS: Record<ActivityCategory, React.ReactNode> = {
  account: <User className="h-4 w-4" />,
  content: <FileText className="h-4 w-4" />,
  meal_planning: <Calendar className="h-4 w-4" />,
  shopping: <ShoppingCart className="h-4 w-4" />,
  family: <Baby className="h-4 w-4" />,
  billing: <CreditCard className="h-4 w-4" />,
  ai: <Sparkles className="h-4 w-4" />,
  engagement: <ChefHat className="h-4 w-4" />,
  storage: <Upload className="h-4 w-4" />,
  general: <Clock className="h-4 w-4" />,
};

/**
 * Category colors
 */
const CATEGORY_COLORS: Record<ActivityCategory, string> = {
  account: 'bg-blue-100 text-blue-800',
  content: 'bg-green-100 text-green-800',
  meal_planning: 'bg-purple-100 text-purple-800',
  shopping: 'bg-orange-100 text-orange-800',
  family: 'bg-pink-100 text-pink-800',
  billing: 'bg-yellow-100 text-yellow-800',
  ai: 'bg-indigo-100 text-indigo-800',
  engagement: 'bg-teal-100 text-teal-800',
  storage: 'bg-gray-100 text-gray-800',
  general: 'bg-slate-100 text-slate-800',
};

interface ActivityTimelineProps {
  userId?: string; // If provided, shows only this user's activity
}

export function ActivityTimeline({ userId }: ActivityTimelineProps) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [filteredActivities, setFilteredActivities] = useState<ActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedView, setSelectedView] = useState<'timeline' | 'grouped'>('timeline');

  useEffect(() => {
    loadActivities();
  }, [userId]);

  useEffect(() => {
    filterActivities();
  }, [activities, searchQuery, selectedCategory]);

  const loadActivities = async () => {
    setIsLoading(true);
    try {
      let result: ActivityEntry[];
      if (userId) {
        result = await activityTracker.getTimeline(userId, { limit: 200 });
      } else {
        result = await activityTracker.getRecentActivities(200);
      }
      setActivities(result);
    } catch (error) {
      toast.error('Failed to load activity timeline');
    } finally {
      setIsLoading(false);
    }
  };

  const filterActivities = () => {
    let filtered = activities;

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.title.toLowerCase().includes(query) ||
          a.description?.toLowerCase().includes(query) ||
          a.activityType.toLowerCase().includes(query)
      );
    }

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter((a) => a.activityCategory === selectedCategory);
    }

    setFilteredActivities(filtered);
  };

  const handleExportJSON = () => {
    downloadJSON(filteredActivities, `activity-timeline-${new Date().toISOString().split('T')[0]}.json`);
    toast.success('Exported as JSON');
  };

  const handleExportCSV = () => {
    const csvData = filteredActivities.map((a) => ({
      id: a.id,
      user_id: a.userId,
      type: a.activityType,
      category: a.activityCategory,
      title: a.title,
      description: a.description || '',
      entity_type: a.entityType || '',
      entity_id: a.entityId || '',
      created_at: a.createdAt,
    }));
    downloadCSV(csvData, `activity-timeline-${new Date().toISOString().split('T')[0]}.csv`);
    toast.success('Exported as CSV');
  };

  const groupedByDate = filteredActivities.reduce((groups, activity) => {
    const date = new Date(activity.createdAt).toLocaleDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(activity);
    return groups;
  }, {} as Record<string, ActivityEntry[]>);

  const groupedByCategory = filteredActivities.reduce((groups, activity) => {
    const category = activity.activityCategory;
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(activity);
    return groups;
  }, {} as Record<string, ActivityEntry[]>);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Activity Timeline</CardTitle>
              <CardDescription>
                {userId ? 'User activity history' : 'Recent activity across all users'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadActivities} disabled={isLoading}>
                <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportJSON}>
                <Download className="h-4 w-4 mr-2" />
                JSON
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-2" />
                CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            {/* Search */}
            <div className="flex-1">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search activities..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Category Filter */}
            <div className="w-48">
              <Label>Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  <SelectItem value="account">Account</SelectItem>
                  <SelectItem value="content">Content</SelectItem>
                  <SelectItem value="meal_planning">Meal Planning</SelectItem>
                  <SelectItem value="shopping">Shopping</SelectItem>
                  <SelectItem value="family">Family</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="ai">AI</SelectItem>
                  <SelectItem value="engagement">Engagement</SelectItem>
                  <SelectItem value="storage">Storage</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* View Toggle */}
            <div className="w-48">
              <Label>View</Label>
              <Select value={selectedView} onValueChange={(v) => setSelectedView(v as 'timeline' | 'grouped')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="timeline">Timeline</SelectItem>
                  <SelectItem value="grouped">By Category</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Activities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredActivities.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {filteredActivities.filter(
                (a) => new Date(a.createdAt).toDateString() === new Date().toDateString()
              ).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(groupedByCategory).length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Object.keys(groupedByDate).length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Activity List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No activities found
            </div>
          ) : selectedView === 'timeline' ? (
            <ScrollArea className="h-[600px]">
              <div className="p-6">
                {Object.entries(groupedByDate).map(([date, dayActivities]) => (
                  <div key={date} className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-semibold">{date}</h3>
                      <Badge variant="secondary">{dayActivities.length}</Badge>
                    </div>

                    <div className="relative ml-4 border-l-2 border-muted pl-6 space-y-4">
                      {dayActivities.map((activity) => (
                        <div key={activity.id} className="relative">
                          {/* Timeline dot */}
                          <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-background border-2 border-primary" />

                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">
                                {formatTime(activity.createdAt)}
                              </span>
                              <Badge className={cn('text-xs', CATEGORY_COLORS[activity.activityCategory])}>
                                {CATEGORY_ICONS[activity.activityCategory]}
                                <span className="ml-1">{activity.activityCategory}</span>
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {activity.activityType}
                              </Badge>
                            </div>

                            <p className="font-medium">{activity.title}</p>

                            {activity.description && (
                              <p className="text-sm text-muted-foreground">{activity.description}</p>
                            )}

                            {activity.entityType && (
                              <p className="text-xs text-muted-foreground">
                                {activity.entityType}: {activity.entityId}
                              </p>
                            )}

                            {!userId && (
                              <p className="text-xs text-muted-foreground">
                                User: {activity.userId.slice(0, 8)}...
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <Tabs defaultValue={Object.keys(groupedByCategory)[0]} className="w-full">
              <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
                {Object.entries(groupedByCategory).map(([category, items]) => (
                  <TabsTrigger
                    key={category}
                    value={category}
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
                  >
                    {CATEGORY_ICONS[category as ActivityCategory]}
                    <span className="ml-2">{category}</span>
                    <Badge variant="secondary" className="ml-2">
                      {items.length}
                    </Badge>
                  </TabsTrigger>
                ))}
              </TabsList>

              {Object.entries(groupedByCategory).map(([category, items]) => (
                <TabsContent key={category} value={category} className="m-0">
                  <ScrollArea className="h-[500px]">
                    <div className="p-6 space-y-3">
                      {items.map((activity) => (
                        <div
                          key={activity.id}
                          className="flex items-start gap-4 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <div className={cn('p-2 rounded-full', CATEGORY_COLORS[activity.activityCategory])}>
                            {CATEGORY_ICONS[activity.activityCategory]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium truncate">{activity.title}</p>
                              <Badge variant="outline" className="text-xs shrink-0">
                                {activity.activityType}
                              </Badge>
                            </div>
                            {activity.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {activity.description}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDateTime(activity.createdAt)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
