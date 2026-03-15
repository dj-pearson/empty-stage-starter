import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  generateBatch,
  generatePseoPage,
  validatePage,
  publishPage,
  unpublishPage,
  refreshPage,
  getGenerationStats,
  processQueue,
  buildSlug,
  buildTitle,
  buildMetaDescription,
} from '@/lib/pseo/generator';
import type { PseoPageType } from '@/types/pseo';
import type {
  BatchConfig,
  GenerationStats,
  TaxonomyCombination,
  QueueItem,
  ValidationResult,
} from '@/lib/pseo/generator';

// UI components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

// Icons
import {
  RefreshCw,
  Play,
  Pause,
  X,
  Eye,
  Pencil,
  RotateCcw,
  Upload,
  Archive,
  Trash2,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Layers,
  BarChart3,
  ListChecks,
  Settings,
  Loader2,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_TYPES: PseoPageType[] = [
  'FOOD_CHAINING_GUIDE',
  'FOOD_CHAINING_AGE_COMBO',
  'CHALLENGE_MEAL_OCCASION',
  'AGE_MEAL_OCCASION',
  'FOOD_CHALLENGE_COMBO',
  'FOOD_DIETARY_RESTRICTION',
  'CHALLENGE_LANDING',
  'AGE_GROUP_LANDING',
  'MEAL_OCCASION_LANDING',
];

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  generating: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  generated: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  validated: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
  published: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  archived: 'bg-muted text-foreground',
  draft: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400',
};

const TIER_LABELS: Record<number, string> = {
  1: 'Tier 1 - Hub',
  2: 'Tier 2 - Category',
  3: 'Tier 3 - Long-tail',
};

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PseoPage {
  id: string;
  slug: string;
  page_type: string;
  generation_status: string;
  title: string;
  meta_description: string;
  quality_score: number | null;
  tier: number | null;
  needs_refresh: boolean;
  combination: TaxonomyCombination | null;
  created_at: string;
  updated_at: string;
}

interface TaxonomyItem {
  id: string;
  dimension: string;
  value: string;
  page_type: string;
  tier: number;
  active: boolean;
  context: Record<string, unknown> | null;
  combination: TaxonomyCombination | null;
  page_count: number;
}

interface BatchRecord {
  id: string;
  status: string;
  total: number;
  completed: number;
  failed: number;
  page_types: string[];
  tiers: number[];
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  className,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: typeof FileText;
  className?: string;
}) {
  return (
    <Card className={cn('', className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className="rounded-md bg-primary/10 p-2">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        STATUS_COLORS[status] ?? STATUS_COLORS.draft,
      )}
    >
      {status}
    </span>
  );
}

function QualityIndicator({ score }: { score: number | null }) {
  if (score == null) return <span className="text-muted-foreground text-sm">--</span>;
  const pct = Math.round(score * 100);
  const color =
    pct >= 80 ? 'text-green-600' : pct >= 70 ? 'text-yellow-600' : 'text-red-600';
  return <span className={cn('text-sm font-medium', color)}>{pct}%</span>;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PseoAdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">pSEO Page Manager</h1>
          <p className="text-muted-foreground">
            Generate, validate, and publish programmatic SEO pages.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="taxonomy" className="gap-1.5">
            <Layers className="h-4 w-4" />
            Taxonomy
          </TabsTrigger>
          <TabsTrigger value="generate" className="gap-1.5">
            <Settings className="h-4 w-4" />
            Generate
          </TabsTrigger>
          <TabsTrigger value="pages" className="gap-1.5">
            <FileText className="h-4 w-4" />
            Pages
          </TabsTrigger>
          <TabsTrigger value="quality" className="gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            Quality
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-1.5">
            <ListChecks className="h-4 w-4" />
            Queue
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="taxonomy">
          <TaxonomyTab />
        </TabsContent>

        <TabsContent value="generate">
          <GenerateTab />
        </TabsContent>

        <TabsContent value="pages">
          <PageBrowserTab />
        </TabsContent>

        <TabsContent value="quality">
          <QualityTab />
        </TabsContent>

        <TabsContent value="queue">
          <QueueTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ===========================================================================
// Tab 1: Overview
// ===========================================================================

function OverviewTab() {
  const [stats, setStats] = useState<GenerationStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getGenerationStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      toast.error('Failed to load overview stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return <LoadingState message="Loading overview..." />;
  }

  if (!stats) {
    return <EmptyState message="No statistics available yet." />;
  }

  const statusEntries = Object.entries(stats.byStatus);
  const typeEntries = Object.entries(stats.byType);
  const tierEntries = Object.entries(stats.byTier).map(([k, v]) => [
    TIER_LABELS[Number(k)] ?? `Tier ${k}`,
    v,
  ]);

  return (
    <div className="space-y-6">
      {/* Top-level stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Pages"
          value={stats.totalPages}
          icon={FileText}
        />
        <StatCard
          title="Avg Quality Score"
          value={`${Math.round(stats.avgQualityScore * 100)}%`}
          icon={CheckCircle2}
        />
        <StatCard
          title="Queue Length"
          value={stats.queueLength}
          icon={Clock}
        />
        <StatCard
          title="Failed"
          value={stats.failedCount}
          subtitle={stats.lastGenerationTime
            ? `Last run: ${new Date(stats.lastGenerationTime).toLocaleString()}`
            : undefined}
          icon={AlertTriangle}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* By status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pages by Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {statusEntries.length === 0 && (
              <p className="text-sm text-muted-foreground">No pages yet</p>
            )}
            {statusEntries.map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <StatusBadge status={status} />
                <span className="text-sm font-medium">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* By type */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pages by Type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {typeEntries.length === 0 && (
              <p className="text-sm text-muted-foreground">No pages yet</p>
            )}
            {typeEntries.map(([type, count]) => (
              <div key={type} className="flex items-center justify-between">
                <span className="text-sm truncate max-w-[180px]" title={type}>
                  {formatPageType(type)}
                </span>
                <span className="text-sm font-medium">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* By tier */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pages by Tier</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tierEntries.length === 0 && (
              <p className="text-sm text-muted-foreground">No pages yet</p>
            )}
            {tierEntries.map(([label, count]) => (
              <div key={String(label)} className="flex items-center justify-between">
                <span className="text-sm">{String(label)}</span>
                <span className="text-sm font-medium">{String(count)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={fetchStats}>
          <RefreshCw className="h-4 w-4 mr-1.5" />
          Refresh Stats
        </Button>
      </div>
    </div>
  );
}

// ===========================================================================
// Tab 2: Taxonomy Manager
// ===========================================================================

function TaxonomyTab() {
  const [taxonomy, setTaxonomy] = useState<TaxonomyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDimension, setFilterDimension] = useState<string>('all');
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchTaxonomy = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pseo_taxonomy')
        .select('*')
        .order('dimension')
        .order('value');

      if (error) throw error;

      // Count pages generated per taxonomy value
      const { data: pages } = await supabase
        .from('pseo_pages')
        .select('page_type, combination');

      const pageCounts = new Map<string, number>();
      for (const page of pages ?? []) {
        const combo = page.combination as TaxonomyCombination | null;
        if (combo) {
          for (const val of Object.values(combo)) {
            pageCounts.set(val, (pageCounts.get(val) ?? 0) + 1);
          }
        }
      }

      const items: TaxonomyItem[] = (data ?? []).map((row) => ({
        id: row.id,
        dimension: row.dimension ?? '',
        value: row.value ?? '',
        page_type: row.page_type ?? '',
        tier: row.tier ?? 0,
        active: row.active ?? true,
        context: (row.context ?? null) as Record<string, unknown> | null,
        combination: (row.combination ?? null) as TaxonomyCombination | null,
        page_count: pageCounts.get(row.value ?? '') ?? 0,
      }));

      setTaxonomy(items);
    } catch (err) {
      console.error('Failed to fetch taxonomy:', err);
      toast.error('Failed to load taxonomy data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTaxonomy();
  }, [fetchTaxonomy]);

  const toggleActive = async (item: TaxonomyItem) => {
    setToggling(item.id);
    try {
      const { error } = await supabase
        .from('pseo_taxonomy')
        .update({ active: !item.active })
        .eq('id', item.id);

      if (error) throw error;

      setTaxonomy((prev) =>
        prev.map((t) => (t.id === item.id ? { ...t, active: !t.active } : t)),
      );
      toast.success(`${item.value} ${item.active ? 'deactivated' : 'activated'}`);
    } catch (err) {
      console.error('Toggle failed:', err);
      toast.error('Failed to update taxonomy item');
    } finally {
      setToggling(null);
    }
  };

  const dimensions = Array.from(new Set(taxonomy.map((t) => t.dimension)));
  const filtered =
    filterDimension === 'all'
      ? taxonomy
      : taxonomy.filter((t) => t.dimension === filterDimension);

  if (loading) return <LoadingState message="Loading taxonomy..." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="dim-filter">Dimension:</Label>
          <Select value={filterDimension} onValueChange={setFilterDimension}>
            <SelectTrigger id="dim-filter" className="w-[200px] h-9">
              <SelectValue placeholder="All dimensions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All dimensions</SelectItem>
              {dimensions.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-sm text-muted-foreground">
          {filtered.length} items
        </span>
      </div>

      <Card>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dimension</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Page Type</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-center">Pages</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead>Context</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No taxonomy items found.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.dimension}</TableCell>
                  <TableCell>{item.value}</TableCell>
                  <TableCell>
                    <span className="text-xs">{formatPageType(item.page_type)}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.tier}</Badge>
                  </TableCell>
                  <TableCell className="text-center">{item.page_count}</TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant={item.active ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={toggling === item.id}
                      onClick={() => toggleActive(item)}
                    >
                      {toggling === item.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : item.active ? (
                        'Active'
                      ) : (
                        'Inactive'
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    {item.context ? (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 text-xs">
                            <Eye className="h-3 w-3 mr-1" />
                            View
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg">
                          <DialogHeader>
                            <DialogTitle>
                              Context: {item.dimension} / {item.value}
                            </DialogTitle>
                          </DialogHeader>
                          <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-80">
                            {JSON.stringify(item.context, null, 2)}
                          </pre>
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <span className="text-muted-foreground text-xs">None</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

// ===========================================================================
// Tab 3: Generation Controls
// ===========================================================================

function GenerateTab() {
  // Batch config
  const [selectedTypes, setSelectedTypes] = useState<PseoPageType[]>([]);
  const [selectedTiers, setSelectedTiers] = useState<number[]>([1, 2, 3]);
  const [batchSize, setBatchSize] = useState(10);
  const [priority, setPriority] = useState<'high' | 'normal' | 'low'>('normal');
  const [batchLoading, setBatchLoading] = useState(false);

  // Single page generation
  const [singleType, setSingleType] = useState<PseoPageType | ''>('');
  const [singleCombination, setSingleCombination] = useState<TaxonomyCombination>({});
  const [singleLoading, setSingleLoading] = useState(false);

  // Active batches
  const [activeBatches, setActiveBatches] = useState<BatchRecord[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(true);

  const fetchActiveBatches = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('pseo_generation_batches')
        .select('*')
        .in('status', ['pending', 'processing', 'paused'])
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setActiveBatches(
        (data ?? []).map((b) => ({
          id: b.id,
          status: b.status ?? 'pending',
          total: b.total ?? 0,
          completed: b.completed ?? 0,
          failed: b.failed ?? 0,
          page_types: (b.page_types ?? []) as string[],
          tiers: (b.tiers ?? []) as number[],
          created_at: b.created_at ?? '',
        })),
      );
    } catch (err) {
      console.error('Failed to fetch batches:', err);
    } finally {
      setBatchesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveBatches();
  }, [fetchActiveBatches]);

  const toggleType = (type: PseoPageType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const toggleTier = (tier: number) => {
    setSelectedTiers((prev) =>
      prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier],
    );
  };

  const handleGenerateBatch = async () => {
    if (selectedTypes.length === 0) {
      toast.error('Select at least one page type');
      return;
    }
    if (selectedTiers.length === 0) {
      toast.error('Select at least one tier');
      return;
    }

    setBatchLoading(true);
    try {
      const config: BatchConfig = {
        pageTypes: selectedTypes,
        tiers: selectedTiers,
        batchSize: Math.min(Math.max(batchSize, 1), 50),
        priority,
      };
      const result = await generateBatch(config);
      toast.success(`Batch created: ${result.queued} pages queued`);
      fetchActiveBatches();
    } catch (err) {
      console.error('Batch generation failed:', err);
      toast.error('Failed to start batch generation');
    } finally {
      setBatchLoading(false);
    }
  };

  const handleGenerateSingle = async () => {
    if (!singleType) {
      toast.error('Select a page type');
      return;
    }

    setSingleLoading(true);
    try {
      const result = await generatePseoPage(
        singleType as PseoPageType,
        singleCombination,
      );
      if (result) {
        toast.success(`Page generated: ${result.slug}`);
        setSingleCombination({});
      } else {
        toast.error('Generation failed');
      }
    } catch (err) {
      console.error('Single generation failed:', err);
      toast.error('Failed to generate page');
    } finally {
      setSingleLoading(false);
    }
  };

  const handleBatchAction = async (
    batchId: string,
    action: 'pause' | 'resume' | 'cancel' | 'process',
  ) => {
    try {
      if (action === 'process') {
        toast.loading('Processing queue...', { id: `batch-${batchId}` });
        const result = await processQueue(batchId);
        toast.success(
          `Processed: ${result.completed} completed, ${result.failed} failed`,
          { id: `batch-${batchId}` },
        );
      } else {
        const statusMap = { pause: 'paused', resume: 'processing', cancel: 'cancelled' };
        await supabase
          .from('pseo_generation_batches')
          .update({ status: statusMap[action] })
          .eq('id', batchId);
        toast.success(`Batch ${action}d`);
      }
      fetchActiveBatches();
    } catch (err) {
      console.error(`Batch ${action} failed:`, err);
      toast.error(`Failed to ${action} batch`);
    }
  };

  const updateCombinationField = (key: string, value: string) => {
    setSingleCombination((prev) => {
      if (!value) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  };

  // Dimension fields that are relevant to the selected single type
  const dimensionFields = getDimensionFieldsForType(singleType as PseoPageType);

  return (
    <div className="space-y-6">
      {/* Batch Generation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Batch Generation</CardTitle>
          <CardDescription>
            Queue multiple pages for generation based on taxonomy combinations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Page type selection */}
          <div className="space-y-2">
            <Label>Page Types</Label>
            <div className="flex flex-wrap gap-2">
              {PAGE_TYPES.map((type) => (
                <Button
                  key={type}
                  variant={selectedTypes.includes(type) ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => toggleType(type)}
                >
                  {formatPageType(type)}
                </Button>
              ))}
            </div>
          </div>

          {/* Tier selection */}
          <div className="space-y-2">
            <Label>Tiers</Label>
            <div className="flex gap-2">
              {[1, 2, 3].map((tier) => (
                <Button
                  key={tier}
                  variant={selectedTiers.includes(tier) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => toggleTier(tier)}
                >
                  Tier {tier}
                </Button>
              ))}
            </div>
          </div>

          {/* Batch size and priority */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="batch-size">Batch Size (max 50)</Label>
              <Input
                id="batch-size"
                type="number"
                min={1}
                max={50}
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                className="w-32"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as 'high' | 'normal' | 'low')}
              >
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleGenerateBatch}
            disabled={batchLoading || selectedTypes.length === 0}
          >
            {batchLoading ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-1.5" />
            )}
            Generate Batch
          </Button>
        </CardContent>
      </Card>

      {/* Single Page Generation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Generate Single Page</CardTitle>
          <CardDescription>
            Manually generate one page by selecting a type and filling in dimension values.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Page Type</Label>
            <Select
              value={singleType}
              onValueChange={(v) => {
                setSingleType(v as PseoPageType);
                setSingleCombination({});
              }}
            >
              <SelectTrigger className="w-full sm:w-[300px] h-9">
                <SelectValue placeholder="Select page type" />
              </SelectTrigger>
              <SelectContent>
                {PAGE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {formatPageType(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {singleType && dimensionFields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {dimensionFields.map((field) => (
                <div key={field} className="space-y-1.5">
                  <Label htmlFor={`dim-${field}`}>
                    {field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </Label>
                  <Input
                    id={`dim-${field}`}
                    placeholder={`Enter ${field.replace(/_/g, ' ')}`}
                    value={singleCombination[field] ?? ''}
                    onChange={(e) => updateCombinationField(field, e.target.value)}
                  />
                </div>
              ))}
            </div>
          )}

          {singleType && (
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>
                <strong>Preview slug:</strong>{' '}
                {buildSlug(singleType as PseoPageType, singleCombination)}
              </p>
              <p>
                <strong>Preview title:</strong>{' '}
                {buildTitle(singleType as PseoPageType, singleCombination)}
              </p>
            </div>
          )}

          <Button
            onClick={handleGenerateSingle}
            disabled={singleLoading || !singleType}
            variant="secondary"
          >
            {singleLoading ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-1.5" />
            )}
            Generate Page
          </Button>
        </CardContent>
      </Card>

      {/* Active Batches */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Active Batches</CardTitle>
            <Button variant="ghost" size="sm" onClick={fetchActiveBatches}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {batchesLoading ? (
            <LoadingState message="Loading batches..." />
          ) : activeBatches.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No active batches.
            </p>
          ) : (
            <div className="space-y-4">
              {activeBatches.map((batch) => {
                const progress =
                  batch.total > 0
                    ? Math.round(
                        ((batch.completed + batch.failed) / batch.total) * 100,
                      )
                    : 0;

                return (
                  <div
                    key={batch.id}
                    className="border rounded-lg p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">
                          Batch {batch.id.slice(0, 8)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {batch.completed}/{batch.total} completed
                          {batch.failed > 0 && `, ${batch.failed} failed`}
                        </p>
                      </div>
                      <StatusBadge status={batch.status} />
                    </div>
                    <Progress value={progress} className="h-2" />
                    <div className="flex gap-1.5">
                      {batch.status === 'processing' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleBatchAction(batch.id, 'process')}
                          >
                            <Play className="h-3 w-3 mr-1" />
                            Process Next
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleBatchAction(batch.id, 'pause')}
                          >
                            <Pause className="h-3 w-3 mr-1" />
                            Pause
                          </Button>
                        </>
                      )}
                      {batch.status === 'paused' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleBatchAction(batch.id, 'resume')}
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Resume
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleBatchAction(batch.id, 'cancel')}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ===========================================================================
// Tab 4: Page Browser
// ===========================================================================

function PageBrowserTab() {
  const [pages, setPages] = useState<PseoPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTier, setFilterTier] = useState<string>('all');
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDesc, setSortDesc] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchPages = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('pseo_pages')
        .select('id, slug, page_type, generation_status, title, meta_description, quality_score, tier, needs_refresh, combination, created_at, updated_at', { count: 'exact' });

      if (filterType !== 'all') {
        query = query.eq('page_type', filterType);
      }
      if (filterStatus !== 'all') {
        query = query.eq('generation_status', filterStatus);
      }
      if (filterTier !== 'all') {
        query = query.eq('tier', Number(filterTier));
      }
      if (searchQuery.trim()) {
        query = query.ilike('title', `%${searchQuery.trim()}%`);
      }

      query = query.order(sortField, { ascending: !sortDesc });
      query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      setPages(
        (data ?? []).map((row) => ({
          id: row.id,
          slug: row.slug ?? '',
          page_type: row.page_type ?? '',
          generation_status: row.generation_status ?? 'draft',
          title: row.title ?? '',
          meta_description: row.meta_description ?? '',
          quality_score: row.quality_score ?? null,
          tier: row.tier ?? null,
          needs_refresh: row.needs_refresh ?? false,
          combination: (row.combination ?? null) as TaxonomyCombination | null,
          created_at: row.created_at ?? '',
          updated_at: row.updated_at ?? '',
        })),
      );
      setTotalCount(count ?? 0);
    } catch (err) {
      console.error('Failed to fetch pages:', err);
      toast.error('Failed to load pages');
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus, filterTier, searchQuery, sortField, sortDesc, page]);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  const handleAction = async (
    pageId: string,
    action: 'publish' | 'unpublish' | 'regenerate' | 'archive',
  ) => {
    setActionLoading(pageId);
    try {
      let success = false;
      switch (action) {
        case 'publish':
          success = await publishPage(pageId);
          break;
        case 'unpublish':
        case 'archive':
          success = await unpublishPage(pageId);
          break;
        case 'regenerate':
          success = await refreshPage(pageId);
          break;
      }

      if (success) {
        toast.success(`Page ${action}ed successfully`);
        fetchPages();
      } else {
        toast.error(`Failed to ${action} page`);
      }
    } catch (err) {
      console.error(`Action ${action} failed:`, err);
      toast.error(`Failed to ${action} page`);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortField(field);
      setSortDesc(true);
    }
    setPage(0);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            className="pl-9 h-9"
          />
        </div>
        <Select
          value={filterType}
          onValueChange={(v) => {
            setFilterType(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-full sm:w-[180px] h-9">
            <SelectValue placeholder="Page Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {PAGE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {formatPageType(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filterStatus}
          onValueChange={(v) => {
            setFilterStatus(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-full sm:w-[150px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.keys(STATUS_COLORS).map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filterTier}
          onValueChange={(v) => {
            setFilterTier(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-full sm:w-[120px] h-9">
            <SelectValue placeholder="Tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="1">Tier 1</SelectItem>
            <SelectItem value="2">Tier 2</SelectItem>
            <SelectItem value="3">Tier 3</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[250px]">
                  <button
                    className="flex items-center gap-1 hover:text-foreground"
                    onClick={() => toggleSort('title')}
                  >
                    Title
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <button
                    className="flex items-center gap-1 hover:text-foreground"
                    onClick={() => toggleSort('quality_score')}
                  >
                    Quality
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>
                  <button
                    className="flex items-center gap-1 hover:text-foreground"
                    onClick={() => toggleSort('created_at')}
                  >
                    Created
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : pages.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-8"
                  >
                    No pages found.
                  </TableCell>
                </TableRow>
              ) : (
                pages.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p className="font-medium text-sm truncate max-w-[300px]" title={p.title}>
                          {p.title || '(untitled)'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                          /{p.slug}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">{formatPageType(p.page_type)}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={p.generation_status} />
                    </TableCell>
                    <TableCell>
                      <QualityIndicator score={p.quality_score} />
                    </TableCell>
                    <TableCell>
                      {p.tier != null ? (
                        <Badge variant="outline">{p.tier}</Badge>
                      ) : (
                        '--'
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.created_at
                        ? new Date(p.created_at).toLocaleDateString()
                        : '--'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title="View page"
                          asChild
                        >
                          <a
                            href={`/guides/${p.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </a>
                        </Button>

                        {p.generation_status !== 'published' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            title="Publish"
                            disabled={actionLoading === p.id}
                            onClick={() => handleAction(p.id, 'publish')}
                          >
                            <Upload className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {p.generation_status === 'published' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            title="Unpublish"
                            disabled={actionLoading === p.id}
                            onClick={() => handleAction(p.id, 'unpublish')}
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title="Regenerate"
                          disabled={actionLoading === p.id}
                          onClick={() => handleAction(p.id, 'regenerate')}
                        >
                          {actionLoading === p.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-sm text-muted-foreground">
              {totalCount} total pages
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm px-2">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ===========================================================================
// Tab 5: Quality Dashboard
// ===========================================================================

function QualityTab() {
  const [lowQualityPages, setLowQualityPages] = useState<PseoPage[]>([]);
  const [needsRefresh, setNeedsRefresh] = useState<PseoPage[]>([]);
  const [missingFaqs, setMissingFaqs] = useState<PseoPage[]>([]);
  const [orphanedPages, setOrphanedPages] = useState<PseoPage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQualityData = useCallback(async () => {
    setLoading(true);
    try {
      // Pages below quality threshold
      const { data: lowQ } = await supabase
        .from('pseo_pages')
        .select('id, slug, page_type, generation_status, title, meta_description, quality_score, tier, needs_refresh, combination, created_at, updated_at')
        .lt('quality_score', 0.7)
        .order('quality_score', { ascending: true })
        .limit(20);

      setLowQualityPages(mapPages(lowQ));

      // Pages needing refresh
      const { data: refresh } = await supabase
        .from('pseo_pages')
        .select('id, slug, page_type, generation_status, title, meta_description, quality_score, tier, needs_refresh, combination, created_at, updated_at')
        .eq('needs_refresh', true)
        .limit(20);

      setNeedsRefresh(mapPages(refresh));

      // Pages with missing FAQs (content check - fetch all and filter client-side)
      const { data: allPages } = await supabase
        .from('pseo_pages')
        .select('id, slug, page_type, generation_status, title, meta_description, quality_score, tier, needs_refresh, combination, content, created_at, updated_at')
        .in('generation_status', ['generated', 'published'])
        .limit(200);

      const noFaqs: PseoPage[] = [];
      const orphans: PseoPage[] = [];

      for (const p of allPages ?? []) {
        const content = p.content as Record<string, unknown> | null;
        if (
          !content ||
          !content.faqs ||
          (Array.isArray(content.faqs) && content.faqs.length === 0)
        ) {
          noFaqs.push(mapPage(p));
        }

        // Check for orphaned pages (no related_pages links)
        const related = (p as Record<string, unknown>).related_pages as
          | unknown[]
          | null;
        if (!related || (Array.isArray(related) && related.length === 0)) {
          orphans.push(mapPage(p));
        }
      }

      setMissingFaqs(noFaqs.slice(0, 20));
      setOrphanedPages(orphans.slice(0, 20));
    } catch (err) {
      console.error('Failed to fetch quality data:', err);
      toast.error('Failed to load quality data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQualityData();
  }, [fetchQualityData]);

  if (loading) return <LoadingState message="Analyzing page quality..." />;

  const sections = [
    {
      title: 'Low Quality Score (< 70%)',
      description: 'Pages that scored below the quality threshold and may need regeneration.',
      icon: AlertTriangle,
      pages: lowQualityPages,
      iconColor: 'text-red-500',
    },
    {
      title: 'Needs Refresh',
      description: 'Pages flagged for content refresh due to staleness or data changes.',
      icon: RefreshCw,
      pages: needsRefresh,
      iconColor: 'text-yellow-500',
    },
    {
      title: 'Missing FAQ Section',
      description: 'Published or generated pages without FAQ structured data.',
      icon: FileText,
      pages: missingFaqs,
      iconColor: 'text-orange-500',
    },
    {
      title: 'Orphaned Pages (No Internal Links)',
      description: 'Pages with no related_pages entries, reducing internal link equity.',
      icon: Layers,
      pages: orphanedPages,
      iconColor: 'text-blue-500',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {sections.map((s) => (
          <StatCard
            key={s.title}
            title={s.title.split('(')[0].trim()}
            value={s.pages.length}
            icon={s.icon}
          />
        ))}
      </div>

      {/* Detail sections */}
      {sections.map((section) => (
        <Card key={section.title}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <section.icon className={cn('h-5 w-5', section.iconColor)} />
              <CardTitle className="text-base">{section.title}</CardTitle>
            </div>
            <CardDescription>{section.description}</CardDescription>
          </CardHeader>
          <CardContent>
            {section.pages.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                All clear - no issues found.
              </div>
            ) : (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Quality</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {section.pages.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <p
                            className="text-sm truncate max-w-[250px]"
                            title={p.title}
                          >
                            {p.title || p.slug}
                          </p>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">
                            {formatPageType(p.page_type)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={p.generation_status} />
                        </TableCell>
                        <TableCell>
                          <QualityIndicator score={p.quality_score} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={async () => {
                              toast.loading('Regenerating...', { id: p.id });
                              const ok = await refreshPage(p.id);
                              if (ok) {
                                toast.success('Page regenerated', { id: p.id });
                                fetchQualityData();
                              } else {
                                toast.error('Regeneration failed', { id: p.id });
                              }
                            }}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Regenerate
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ===========================================================================
// Tab 6: Generation Queue
// ===========================================================================

function QueueTab() {
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [retrying, setRetrying] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('pseo_generation_queue')
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(100);

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      const { data, error } = await query;
      if (error) throw error;

      setQueueItems(
        (data ?? []).map((row) => ({
          id: row.id,
          batch_id: row.batch_id ?? null,
          page_type: row.page_type as PseoPageType,
          combination: (row.combination ?? {}) as TaxonomyCombination,
          priority: row.priority ?? 5,
          status: (row.status ?? 'pending') as QueueItem['status'],
          error_message: row.error_message ?? null,
          created_at: row.created_at ?? '',
        })),
      );
    } catch (err) {
      console.error('Failed to fetch queue:', err);
      toast.error('Failed to load generation queue');
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const retryItem = async (item: QueueItem) => {
    setRetrying(item.id);
    try {
      await supabase
        .from('pseo_generation_queue')
        .update({ status: 'pending', error_message: null })
        .eq('id', item.id);

      toast.success('Item re-queued for processing');
      fetchQueue();
    } catch (err) {
      console.error('Retry failed:', err);
      toast.error('Failed to retry item');
    } finally {
      setRetrying(null);
    }
  };

  const clearCompleted = async () => {
    try {
      const { error } = await supabase
        .from('pseo_generation_queue')
        .delete()
        .eq('status', 'completed');

      if (error) throw error;
      toast.success('Completed items cleared');
      fetchQueue();
    } catch (err) {
      console.error('Clear failed:', err);
      toast.error('Failed to clear completed items');
    }
  };

  const updatePriority = async (itemId: string, newPriority: number) => {
    try {
      await supabase
        .from('pseo_generation_queue')
        .update({ priority: newPriority })
        .eq('id', itemId);

      setQueueItems((prev) =>
        prev
          .map((item) =>
            item.id === itemId ? { ...item, priority: newPriority } : item,
          )
          .sort((a, b) => b.priority - a.priority),
      );
    } catch (err) {
      console.error('Priority update failed:', err);
      toast.error('Failed to update priority');
    }
  };

  const pendingCount = queueItems.filter((i) => i.status === 'pending').length;
  const processingCount = queueItems.filter((i) => i.status === 'processing').length;
  const completedCount = queueItems.filter((i) => i.status === 'completed').length;
  const failedCount = queueItems.filter((i) => i.status === 'failed').length;

  return (
    <div className="space-y-4">
      {/* Queue summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Pending" value={pendingCount} icon={Clock} />
        <StatCard title="Processing" value={processingCount} icon={Loader2} />
        <StatCard title="Completed" value={completedCount} icon={CheckCircle2} />
        <StatCard title="Failed" value={failedCount} icon={AlertTriangle} />
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="q-filter">Status:</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger id="q-filter" className="w-[150px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchQueue}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
          {completedCount > 0 && (
            <Button variant="outline" size="sm" onClick={clearCompleted}>
              <Trash2 className="h-4 w-4 mr-1.5" />
              Clear Completed
            </Button>
          )}
        </div>
      </div>

      {/* Queue table */}
      <Card>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Page Type</TableHead>
                <TableHead>Combination</TableHead>
                <TableHead className="text-center">Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : queueItems.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-8"
                  >
                    Queue is empty.
                  </TableCell>
                </TableRow>
              ) : (
                queueItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <span className="text-xs">
                        {formatPageType(item.page_type)}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <p className="text-xs text-muted-foreground truncate">
                        {Object.entries(item.combination)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(', ') || '--'}
                      </p>
                    </TableCell>
                    <TableCell className="text-center">
                      <Select
                        value={String(item.priority)}
                        onValueChange={(v) =>
                          updatePriority(item.id, Number(v))
                        }
                      >
                        <SelectTrigger className="w-[70px] h-7 text-xs mx-auto">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1</SelectItem>
                          <SelectItem value="5">5</SelectItem>
                          <SelectItem value="10">10</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="max-w-[180px]">
                      {item.error_message ? (
                        <p
                          className="text-xs text-red-600 truncate"
                          title={item.error_message}
                        >
                          {item.error_message}
                        </p>
                      ) : (
                        <span className="text-xs text-muted-foreground">--</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.created_at
                        ? new Date(item.created_at).toLocaleDateString()
                        : '--'}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.status === 'failed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={retrying === item.id}
                          onClick={() => retryItem(item)}
                        >
                          {retrying === item.id ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <RotateCcw className="h-3 w-3 mr-1" />
                          )}
                          Retry
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

// ===========================================================================
// Shared utility components & functions
// ===========================================================================

function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center space-y-3">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function formatPageType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace('Pseo', 'pSEO');
}

function mapPage(row: Record<string, unknown>): PseoPage {
  return {
    id: row.id as string,
    slug: (row.slug ?? '') as string,
    page_type: (row.page_type ?? '') as string,
    generation_status: (row.generation_status ?? 'draft') as string,
    title: (row.title ?? '') as string,
    meta_description: (row.meta_description ?? '') as string,
    quality_score: (row.quality_score ?? null) as number | null,
    tier: (row.tier ?? null) as number | null,
    needs_refresh: (row.needs_refresh ?? false) as boolean,
    combination: (row.combination ?? null) as TaxonomyCombination | null,
    created_at: (row.created_at ?? '') as string,
    updated_at: (row.updated_at ?? '') as string,
  };
}

function mapPages(rows: unknown[] | null): PseoPage[] {
  return (rows ?? []).map((r) => mapPage(r as Record<string, unknown>));
}

function getDimensionFieldsForType(pageType: PseoPageType | ''): string[] {
  if (!pageType) return [];

  const fields: Record<PseoPageType, string[]> = {
    FOOD_CHAINING_GUIDE: ['food'],
    FOOD_CHAINING_AGE_COMBO: ['food', 'age_group'],
    CHALLENGE_MEAL_OCCASION: ['challenge', 'meal_occasion'],
    AGE_MEAL_OCCASION: ['age_group', 'meal_occasion'],
    FOOD_CHALLENGE_COMBO: ['food', 'challenge'],
    FOOD_DIETARY_RESTRICTION: ['food', 'dietary_restriction'],
    CHALLENGE_LANDING: ['challenge'],
    AGE_GROUP_LANDING: ['age_group'],
    MEAL_OCCASION_LANDING: ['meal_occasion'],
  };

  return fields[pageType] ?? [];
}
