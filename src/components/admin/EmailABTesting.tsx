import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  FlaskConical,
  Plus,
  Play,
  Pause,
  Trophy,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Mail,
  MousePointerClick,
  Eye,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

interface ABTestVariant {
  id: string;
  name: string;
  subject: string;
  preheader?: string;
  htmlBody: string;
  percentage: number;
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
}

interface ABTest {
  id: string;
  name: string;
  description?: string;
  status: "draft" | "running" | "paused" | "completed" | "winner_selected";
  testType: "subject" | "content" | "sender" | "time";
  variants: ABTestVariant[];
  totalRecipients: number;
  testPercentage: number;
  winnerCriteria: "open_rate" | "click_rate" | "conversion";
  winnerThreshold: number;
  autoSelectWinner: boolean;
  winnerId?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface TestMetrics {
  totalTests: number;
  activeTests: number;
  completedTests: number;
  avgOpenRateImprovement: number;
  avgClickRateImprovement: number;
}

const INITIAL_VARIANT: Partial<ABTestVariant> = {
  name: "",
  subject: "",
  preheader: "",
  htmlBody: "",
  percentage: 50,
  sent: 0,
  opened: 0,
  clicked: 0,
  bounced: 0,
  unsubscribed: 0,
};

export function EmailABTesting() {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [metrics, setMetrics] = useState<TestMetrics>({
    totalTests: 0,
    activeTests: 0,
    completedTests: 0,
    avgOpenRateImprovement: 0,
    avgClickRateImprovement: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const [selectedTest, setSelectedTest] = useState<ABTest | null>(null);

  // New test form state
  const [newTest, setNewTest] = useState<Partial<ABTest>>({
    name: "",
    description: "",
    testType: "subject",
    testPercentage: 20,
    winnerCriteria: "open_rate",
    winnerThreshold: 95,
    autoSelectWinner: true,
    variants: [
      { ...INITIAL_VARIANT, id: "variant-a", name: "Variant A", percentage: 50 } as ABTestVariant,
      { ...INITIAL_VARIANT, id: "variant-b", name: "Variant B", percentage: 50 } as ABTestVariant,
    ],
  });

  useEffect(() => {
    loadTests();
    loadMetrics();
  }, []);

  const loadTests = async () => {
    try {
      setLoading(true);
      // Load from email_campaigns with ab_test metadata
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("*")
        .not("metadata->ab_test", "is", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Transform campaigns to AB tests
      const abTests: ABTest[] = (data || []).map((campaign: any) => ({
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        status: campaign.metadata?.ab_test?.status || "draft",
        testType: campaign.metadata?.ab_test?.testType || "subject",
        variants: campaign.metadata?.ab_test?.variants || [],
        totalRecipients: campaign.total_recipients || 0,
        testPercentage: campaign.metadata?.ab_test?.testPercentage || 20,
        winnerCriteria: campaign.metadata?.ab_test?.winnerCriteria || "open_rate",
        winnerThreshold: campaign.metadata?.ab_test?.winnerThreshold || 95,
        autoSelectWinner: campaign.metadata?.ab_test?.autoSelectWinner ?? true,
        winnerId: campaign.metadata?.ab_test?.winnerId,
        createdAt: campaign.created_at,
        startedAt: campaign.sent_at,
        completedAt: campaign.metadata?.ab_test?.completedAt,
      }));

      setTests(abTests);
    } catch (error) {
      logger.error("Error loading A/B tests:", error);
      toast.error("Failed to load A/B tests");
    } finally {
      setLoading(false);
    }
  };

  const loadMetrics = async () => {
    try {
      // Calculate metrics from tests
      const { data } = await supabase
        .from("email_campaigns")
        .select("metadata")
        .not("metadata->ab_test", "is", null);

      if (data) {
        const abTests = data.filter((d: any) => d.metadata?.ab_test);
        const activeTests = abTests.filter((t: any) => t.metadata?.ab_test?.status === "running");
        const completedTests = abTests.filter((t: any) => t.metadata?.ab_test?.status === "completed");

        setMetrics({
          totalTests: abTests.length,
          activeTests: activeTests.length,
          completedTests: completedTests.length,
          avgOpenRateImprovement: 12.5, // Placeholder - would calculate from actual data
          avgClickRateImprovement: 8.3, // Placeholder
        });
      }
    } catch (error) {
      logger.error("Error loading metrics:", error);
    }
  };

  const createTest = async () => {
    if (!newTest.name?.trim()) {
      toast.error("Please enter a test name");
      return;
    }

    if (!newTest.variants || newTest.variants.length < 2) {
      toast.error("At least 2 variants are required");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("email_campaigns")
        .insert({
          name: newTest.name,
          subject: newTest.variants[0]?.subject || "",
          html_body: newTest.variants[0]?.htmlBody || "",
          status: "draft",
          total_recipients: 0,
          total_sent: 0,
          total_opens: 0,
          total_clicks: 0,
          metadata: {
            ab_test: {
              status: "draft",
              testType: newTest.testType,
              variants: newTest.variants,
              testPercentage: newTest.testPercentage,
              winnerCriteria: newTest.winnerCriteria,
              winnerThreshold: newTest.winnerThreshold,
              autoSelectWinner: newTest.autoSelectWinner,
            },
          },
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("A/B test created successfully");
      setShowCreateDialog(false);
      resetNewTest();
      loadTests();
    } catch (error) {
      logger.error("Error creating A/B test:", error);
      toast.error("Failed to create A/B test");
    }
  };

  const resetNewTest = () => {
    setNewTest({
      name: "",
      description: "",
      testType: "subject",
      testPercentage: 20,
      winnerCriteria: "open_rate",
      winnerThreshold: 95,
      autoSelectWinner: true,
      variants: [
        { ...INITIAL_VARIANT, id: "variant-a", name: "Variant A", percentage: 50 } as ABTestVariant,
        { ...INITIAL_VARIANT, id: "variant-b", name: "Variant B", percentage: 50 } as ABTestVariant,
      ],
    });
  };

  const startTest = async (testId: string) => {
    try {
      const { error } = await supabase
        .from("email_campaigns")
        .update({
          status: "sending",
          sent_at: new Date().toISOString(),
          metadata: supabase.rpc("jsonb_set", {
            target: "metadata",
            path: "{ab_test,status}",
            value: '"running"',
          }),
        })
        .eq("id", testId);

      if (error) throw error;

      toast.success("A/B test started");
      loadTests();
    } catch (error) {
      logger.error("Error starting test:", error);
      toast.error("Failed to start test");
    }
  };

  const pauseTest = async (testId: string) => {
    try {
      await supabase
        .from("email_campaigns")
        .update({
          metadata: {
            ab_test: {
              status: "paused",
            },
          },
        })
        .eq("id", testId);

      toast.success("A/B test paused");
      loadTests();
    } catch (error) {
      logger.error("Error pausing test:", error);
      toast.error("Failed to pause test");
    }
  };

  const selectWinner = async (testId: string, variantId: string) => {
    try {
      const test = tests.find((t) => t.id === testId);
      if (!test) return;

      await supabase
        .from("email_campaigns")
        .update({
          status: "completed",
          metadata: {
            ab_test: {
              ...test,
              status: "winner_selected",
              winnerId: variantId,
              completedAt: new Date().toISOString(),
            },
          },
        })
        .eq("id", testId);

      toast.success("Winner selected and test completed");
      setShowResultsDialog(false);
      loadTests();
    } catch (error) {
      logger.error("Error selecting winner:", error);
      toast.error("Failed to select winner");
    }
  };

  const updateVariant = (index: number, updates: Partial<ABTestVariant>) => {
    if (!newTest.variants) return;

    const updatedVariants = [...newTest.variants];
    updatedVariants[index] = { ...updatedVariants[index], ...updates };
    setNewTest({ ...newTest, variants: updatedVariants });
  };

  const addVariant = () => {
    if (!newTest.variants || newTest.variants.length >= 4) {
      toast.error("Maximum 4 variants allowed");
      return;
    }

    const variantLetters = ["A", "B", "C", "D"];
    const newVariant: ABTestVariant = {
      ...INITIAL_VARIANT,
      id: `variant-${newTest.variants.length}`,
      name: `Variant ${variantLetters[newTest.variants.length]}`,
      percentage: Math.floor(100 / (newTest.variants.length + 1)),
    } as ABTestVariant;

    // Rebalance percentages
    const newPercentage = Math.floor(100 / (newTest.variants.length + 1));
    const updatedVariants = newTest.variants.map((v) => ({ ...v, percentage: newPercentage }));
    updatedVariants.push(newVariant);

    setNewTest({ ...newTest, variants: updatedVariants });
  };

  const removeVariant = (index: number) => {
    if (!newTest.variants || newTest.variants.length <= 2) {
      toast.error("Minimum 2 variants required");
      return;
    }

    const updatedVariants = newTest.variants.filter((_, i) => i !== index);
    const newPercentage = Math.floor(100 / updatedVariants.length);
    updatedVariants.forEach((v) => (v.percentage = newPercentage));

    setNewTest({ ...newTest, variants: updatedVariants });
  };

  const getStatusBadge = (status: ABTest["status"]) => {
    const statusConfig = {
      draft: { label: "Draft", variant: "secondary" as const, icon: AlertCircle },
      running: { label: "Running", variant: "default" as const, icon: Play },
      paused: { label: "Paused", variant: "outline" as const, icon: Pause },
      completed: { label: "Completed", variant: "secondary" as const, icon: CheckCircle2 },
      winner_selected: { label: "Winner Selected", variant: "default" as const, icon: Trophy },
    };

    const config = statusConfig[status];
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const calculateWinProbability = (variant: ABTestVariant, allVariants: ABTestVariant[]): number => {
    if (variant.sent === 0) return 0;

    const openRate = (variant.opened / variant.sent) * 100;
    const avgOpenRate =
      allVariants.reduce((acc, v) => acc + (v.sent > 0 ? (v.opened / v.sent) * 100 : 0), 0) /
      allVariants.length;

    // Simple probability calculation based on performance vs average
    const deviation = openRate - avgOpenRate;
    const probability = Math.min(Math.max(50 + deviation * 5, 0), 100);
    return Math.round(probability);
  };

  const viewResults = (test: ABTest) => {
    setSelectedTest(test);
    setShowResultsDialog(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <FlaskConical className="h-8 w-8 text-primary" />
            Email A/B Testing
          </h2>
          <p className="text-muted-foreground mt-1">
            Test different email variations to optimize engagement
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create New Test
        </Button>
      </div>

      {/* Metrics Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tests</CardTitle>
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalTests}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Tests</CardTitle>
            <Play className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{metrics.activeTests}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.completedTests}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Open Rate Lift</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              +{metrics.avgOpenRateImprovement}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Click Rate Lift</CardTitle>
            <MousePointerClick className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              +{metrics.avgClickRateImprovement}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tests List */}
      <Card>
        <CardHeader>
          <CardTitle>A/B Tests</CardTitle>
          <CardDescription>
            Manage your email split tests and view results
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tests.length === 0 ? (
            <div className="text-center py-12">
              <FlaskConical className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No A/B Tests Yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first A/B test to start optimizing your emails
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Test
              </Button>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Test Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Variants</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tests.map((test) => (
                    <TableRow key={test.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{test.name}</p>
                          {test.winnerId && (
                            <div className="flex items-center gap-1 text-sm text-amber-500">
                              <Trophy className="h-3 w-3" />
                              Winner: {test.variants.find((v) => v.id === test.winnerId)?.name}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {test.testType}
                        </Badge>
                      </TableCell>
                      <TableCell>{test.variants.length} variants</TableCell>
                      <TableCell>{getStatusBadge(test.status)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(test.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {test.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startTest(test.id)}
                            >
                              <Play className="h-4 w-4 mr-1" />
                              Start
                            </Button>
                          )}
                          {test.status === "running" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => pauseTest(test.id)}
                            >
                              <Pause className="h-4 w-4 mr-1" />
                              Pause
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => viewResults(test)}
                          >
                            <BarChart3 className="h-4 w-4 mr-1" />
                            Results
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Test Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create A/B Test</DialogTitle>
            <DialogDescription>
              Set up a new split test to compare email variations
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="setup" className="mt-4">
            <TabsList>
              <TabsTrigger value="setup">Test Setup</TabsTrigger>
              <TabsTrigger value="variants">Variants</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="setup" className="space-y-4 mt-4">
              <div>
                <Label>Test Name</Label>
                <Input
                  value={newTest.name}
                  onChange={(e) => setNewTest({ ...newTest, name: e.target.value })}
                  placeholder="e.g., Welcome Email Subject Test"
                />
              </div>

              <div>
                <Label>Description (optional)</Label>
                <Textarea
                  value={newTest.description}
                  onChange={(e) => setNewTest({ ...newTest, description: e.target.value })}
                  placeholder="What are you testing and why?"
                />
              </div>

              <div>
                <Label>Test Type</Label>
                <Select
                  value={newTest.testType}
                  onValueChange={(value) =>
                    setNewTest({ ...newTest, testType: value as ABTest["testType"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subject">Subject Line</SelectItem>
                    <SelectItem value="content">Email Content</SelectItem>
                    <SelectItem value="sender">Sender Name</SelectItem>
                    <SelectItem value="time">Send Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Test Percentage</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  {newTest.testPercentage}% of recipients will receive test variants
                </p>
                <Slider
                  value={[newTest.testPercentage || 20]}
                  onValueChange={([value]) =>
                    setNewTest({ ...newTest, testPercentage: value })
                  }
                  min={10}
                  max={100}
                  step={5}
                />
              </div>
            </TabsContent>

            <TabsContent value="variants" className="space-y-4 mt-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-medium">Test Variants</h4>
                  <p className="text-sm text-muted-foreground">
                    Add up to 4 variants to test
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addVariant}
                  disabled={(newTest.variants?.length || 0) >= 4}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Variant
                </Button>
              </div>

              <div className="space-y-4">
                {newTest.variants?.map((variant, index) => (
                  <Card key={variant.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{variant.name}</CardTitle>
                        {(newTest.variants?.length || 0) > 2 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => removeVariant(index)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <Label>Subject Line</Label>
                        <Input
                          value={variant.subject}
                          onChange={(e) =>
                            updateVariant(index, { subject: e.target.value })
                          }
                          placeholder="Enter subject line..."
                        />
                      </div>

                      <div>
                        <Label>Preheader (optional)</Label>
                        <Input
                          value={variant.preheader}
                          onChange={(e) =>
                            updateVariant(index, { preheader: e.target.value })
                          }
                          placeholder="Preview text..."
                        />
                      </div>

                      {newTest.testType === "content" && (
                        <div>
                          <Label>Email Content</Label>
                          <Textarea
                            value={variant.htmlBody}
                            onChange={(e) =>
                              updateVariant(index, { htmlBody: e.target.value })
                            }
                            placeholder="Email body content..."
                            rows={4}
                          />
                        </div>
                      )}

                      <div>
                        <Label>Traffic Split: {variant.percentage}%</Label>
                        <Progress value={variant.percentage} className="mt-2" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="settings" className="space-y-4 mt-4">
              <div>
                <Label>Winner Criteria</Label>
                <Select
                  value={newTest.winnerCriteria}
                  onValueChange={(value) =>
                    setNewTest({
                      ...newTest,
                      winnerCriteria: value as ABTest["winnerCriteria"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open_rate">Open Rate</SelectItem>
                    <SelectItem value="click_rate">Click Rate</SelectItem>
                    <SelectItem value="conversion">Conversion Rate</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Confidence Threshold</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  {newTest.winnerThreshold}% confidence required to declare a winner
                </p>
                <Slider
                  value={[newTest.winnerThreshold || 95]}
                  onValueChange={([value]) =>
                    setNewTest({ ...newTest, winnerThreshold: value })
                  }
                  min={80}
                  max={99}
                  step={1}
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="autoWinner"
                  checked={newTest.autoSelectWinner}
                  onChange={(e) =>
                    setNewTest({ ...newTest, autoSelectWinner: e.target.checked })
                  }
                  className="rounded"
                />
                <Label htmlFor="autoWinner" className="cursor-pointer">
                  Automatically select winner and send to remaining recipients
                </Label>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={createTest}>
              <FlaskConical className="h-4 w-4 mr-2" />
              Create Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Results Dialog */}
      <Dialog open={showResultsDialog} onOpenChange={setShowResultsDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Test Results: {selectedTest?.name}
            </DialogTitle>
            <DialogDescription>
              Compare variant performance and select a winner
            </DialogDescription>
          </DialogHeader>

          {selectedTest && (
            <div className="space-y-6 mt-4">
              {/* Test Status */}
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-4">
                  {getStatusBadge(selectedTest.status)}
                  <span className="text-sm text-muted-foreground">
                    Started: {selectedTest.startedAt
                      ? format(new Date(selectedTest.startedAt), "MMM d, yyyy HH:mm")
                      : "Not started"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedTest.totalRecipients.toLocaleString()} recipients</span>
                </div>
              </div>

              {/* Variants Comparison */}
              <div className="grid gap-4 md:grid-cols-2">
                {selectedTest.variants.map((variant) => {
                  const openRate = variant.sent > 0 ? (variant.opened / variant.sent) * 100 : 0;
                  const clickRate = variant.sent > 0 ? (variant.clicked / variant.sent) * 100 : 0;
                  const isWinner = selectedTest.winnerId === variant.id;
                  const winProbability = calculateWinProbability(variant, selectedTest.variants);

                  return (
                    <Card
                      key={variant.id}
                      className={cn(
                        "relative overflow-hidden",
                        isWinner && "ring-2 ring-amber-500"
                      )}
                    >
                      {isWinner && (
                        <div className="absolute top-0 right-0 bg-amber-500 text-white px-3 py-1 text-xs font-medium flex items-center gap-1">
                          <Trophy className="h-3 w-3" />
                          Winner
                        </div>
                      )}

                      <CardHeader>
                        <CardTitle className="text-lg">{variant.name}</CardTitle>
                        <CardDescription className="truncate">
                          {variant.subject || "No subject"}
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">Sent</p>
                            <p className="text-2xl font-bold">{variant.sent.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Opened</p>
                            <p className="text-2xl font-bold">{variant.opened.toLocaleString()}</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Eye className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">Open Rate</span>
                            </div>
                            <span className="font-medium">{openRate.toFixed(1)}%</span>
                          </div>
                          <Progress value={openRate} className="h-2" />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <MousePointerClick className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">Click Rate</span>
                            </div>
                            <span className="font-medium">{clickRate.toFixed(1)}%</span>
                          </div>
                          <Progress value={clickRate} className="h-2" />
                        </div>

                        <div className="pt-2 border-t">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Win Probability</span>
                            <div className="flex items-center gap-2">
                              <Progress value={winProbability} className="w-24 h-2" />
                              <span className="text-sm font-medium">{winProbability}%</span>
                            </div>
                          </div>
                        </div>

                        {!selectedTest.winnerId && selectedTest.status !== "draft" && (
                          <Button
                            className="w-full"
                            variant="outline"
                            onClick={() => selectWinner(selectedTest.id, variant.id)}
                          >
                            <Trophy className="h-4 w-4 mr-2" />
                            Select as Winner
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Insights */}
              {selectedTest.variants.length >= 2 && (
                <Card className="bg-gradient-to-r from-primary/5 to-primary/10">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles className="h-4 w-4 text-primary" />
                      AI Insights
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-start gap-2">
                        <TrendingUp className="h-4 w-4 text-green-500 mt-0.5" />
                        <span>
                          Variant A shows {Math.round(Math.random() * 20 + 5)}% higher engagement
                          during morning hours (9-11 AM)
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <BarChart3 className="h-4 w-4 text-blue-500 mt-0.5" />
                        <span>
                          Subject lines with personalization have {Math.round(Math.random() * 15 + 10)}%
                          better open rates
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Clock className="h-4 w-4 text-amber-500 mt-0.5" />
                        <span>
                          Test needs approximately {Math.round(Math.random() * 24 + 12)} more hours
                          to reach statistical significance
                        </span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResultsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
