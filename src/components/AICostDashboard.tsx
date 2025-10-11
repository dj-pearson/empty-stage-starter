import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, Zap, TrendingUp, AlertCircle, RefreshCw, Calendar } from "lucide-react";
import {
  checkAIBudget,
  getAIUsageLogs,
  getDailyCostSummary,
  getCostByEndpoint,
  getCostByModel,
  formatCost,
  formatTokens,
  getAlertLevelColor,
  calculateEfficiency,
  type BudgetCheck,
  type AIUsageLog,
  type CostSummary,
} from "@/lib/ai-cost-tracking";

export function AICostDashboard() {
  const [loading, setLoading] = useState(true);
  const [budgetCheck, setBudgetCheck] = useState<BudgetCheck | null>(null);
  const [usageLogs, setUsageLogs] = useState<AIUsageLog[]>([]);
  const [dailySummary, setDailySummary] = useState<CostSummary[]>([]);
  const [costByEndpoint, setCostByEndpoint] = useState<any[]>([]);
  const [costByModel, setCostByModel] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);

    const [budgetData, logsData, summaryData, endpointData, modelData] = await Promise.all([
      checkAIBudget("daily"),
      getAIUsageLogs(20),
      getDailyCostSummary(30),
      getCostByEndpoint(),
      getCostByModel(),
    ]);

    setBudgetCheck(budgetData);
    setUsageLogs(logsData);
    setDailySummary(summaryData);
    setCostByEndpoint(endpointData);
    setCostByModel(modelData);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center text-muted-foreground">Loading AI cost data...</div>
      </div>
    );
  }

  const alertColor = budgetCheck ? getAlertLevelColor(budgetCheck.alert_level) : null;

  // Calculate totals
  const totalCostLast30Days = dailySummary.reduce(
    (sum, day) => sum + (day.total_cost_cents || 0),
    0
  );
  const totalRequestsLast30Days = dailySummary.reduce(
    (sum, day) => sum + (day.total_requests || 0),
    0
  );
  const totalTokensLast30Days = dailySummary.reduce(
    (sum, day) => sum + (day.total_tokens || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="w-6 h-6" />
            AI Cost Tracking
          </h2>
          <p className="text-sm text-muted-foreground">Monitor your AI usage and costs</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Budget Status */}
      {budgetCheck && (
        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Daily Budget Status</h3>
              <p className="text-sm text-muted-foreground">
                {formatCost(budgetCheck.current_spend_cents)} of{" "}
                {formatCost(budgetCheck.budget_limit_cents)} used
              </p>
            </div>
            {alertColor && (
              <Badge className={`${alertColor.bg} ${alertColor.text}`}>
                {budgetCheck.alert_level.toUpperCase()}
              </Badge>
            )}
          </div>

          <Progress value={budgetCheck.percentage_used} className="mb-3" />

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {budgetCheck.percentage_used.toFixed(1)}% used
            </span>
            <span className="font-medium">
              {formatCost(budgetCheck.budget_limit_cents - budgetCheck.current_spend_cents)}{" "}
              remaining
            </span>
          </div>

          {budgetCheck.percentage_used >= 80 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div className="text-sm">
                  <div className="font-medium text-yellow-900">
                    Approaching Budget Limit
                  </div>
                  <div className="text-yellow-700">
                    Consider upgrading your plan for higher limits.
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-5 h-5 text-green-500" />
          </div>
          <div className="text-3xl font-bold">{formatCost(totalCostLast30Days)}</div>
          <div className="text-sm text-muted-foreground">Total Cost (30d)</div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <Zap className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-3xl font-bold">{formatTokens(totalTokensLast30Days)}</div>
          <div className="text-sm text-muted-foreground">Total Tokens (30d)</div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-5 h-5 text-purple-500" />
          </div>
          <div className="text-3xl font-bold">{totalRequestsLast30Days}</div>
          <div className="text-sm text-muted-foreground">Total Requests (30d)</div>
        </Card>
      </div>

      {/* Detailed Tabs */}
      <Tabs defaultValue="daily" className="space-y-6">
        <TabsList>
          <TabsTrigger value="daily">
            <Calendar className="w-4 h-4 mr-2" />
            Daily Breakdown
          </TabsTrigger>
          <TabsTrigger value="endpoints">By Endpoint</TabsTrigger>
          <TabsTrigger value="models">By Model</TabsTrigger>
          <TabsTrigger value="logs">Recent Logs</TabsTrigger>
        </TabsList>

        {/* Daily Breakdown */}
        <TabsContent value="daily" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Last 30 Days</h3>
            <div className="space-y-2">
              {dailySummary.slice(0, 15).map((day) => (
                <div key={day.date} className="flex items-center gap-4 text-sm p-3 border rounded-lg">
                  <div className="w-24 text-muted-foreground">
                    {new Date(day.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                  <div className="flex-1 grid grid-cols-4 gap-4">
                    <div>
                      <div className="text-muted-foreground">Cost</div>
                      <div className="font-medium">{formatCost(day.total_cost_cents)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Requests</div>
                      <div className="font-medium">{day.total_requests}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Tokens</div>
                      <div className="font-medium">{formatTokens(day.total_tokens)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Avg Time</div>
                      <div className="font-medium">
                        {day.avg_duration_ms ? `${Math.round(day.avg_duration_ms)}ms` : "-"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* By Endpoint */}
        <TabsContent value="endpoints" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Cost by Endpoint</h3>
            <div className="space-y-3">
              {costByEndpoint.map((endpoint) => (
                <div key={endpoint.endpoint} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium">{endpoint.endpoint}</div>
                    <Badge variant="secondary">{formatCost(endpoint.total_cost_cents)}</Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Requests</div>
                      <div className="font-medium">{endpoint.total_requests}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Users</div>
                      <div className="font-medium">{endpoint.unique_users}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Avg Cost</div>
                      <div className="font-medium">
                        {formatCost(endpoint.avg_cost_per_request_cents)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Efficiency</div>
                      <div className="font-medium">
                        {calculateEfficiency(
                          endpoint.avg_tokens_per_request,
                          endpoint.avg_cost_per_request_cents
                        )}{" "}
                        t/¢
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* By Model */}
        <TabsContent value="models" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Cost by Model</h3>
            <div className="space-y-3">
              {costByModel.map((model) => (
                <div key={model.model} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium">{model.model}</div>
                    <Badge variant="secondary">{formatCost(model.total_cost_cents)}</Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Requests</div>
                      <div className="font-medium">{model.total_requests}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Prompt Tokens</div>
                      <div className="font-medium">{formatTokens(model.total_prompt_tokens)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Completion Tokens</div>
                      <div className="font-medium">
                        {formatTokens(model.total_completion_tokens)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Avg Time</div>
                      <div className="font-medium">
                        {model.avg_duration_ms ? `${Math.round(model.avg_duration_ms)}ms` : "-"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* Recent Logs */}
        <TabsContent value="logs" className="space-y-4">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Recent API Calls</h3>
            <div className="space-y-2">
              {usageLogs.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No API calls logged yet
                </div>
              ) : (
                usageLogs.map((log) => (
                  <div key={log.id} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{log.endpoint}</span>
                        <Badge variant="outline" className="text-xs">
                          {log.model}
                        </Badge>
                        {log.status !== "success" && (
                          <Badge variant="destructive" className="text-xs">
                            {log.status}
                          </Badge>
                        )}
                      </div>
                      <span className="font-medium">{formatCost(log.total_cost_cents)}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{formatTokens(log.total_tokens)} tokens</span>
                      {log.request_duration_ms && <span>{log.request_duration_ms}ms</span>}
                      <span>
                        {new Date(log.created_at).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Info Card */}
      <Card className="p-6 bg-muted/50">
        <h4 className="font-medium mb-2">About AI Costs</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Costs are calculated based on token usage and model pricing</li>
          <li>• Daily budgets reset at midnight UTC</li>
          <li>• Upgrade your plan for higher limits and priority access</li>
          <li>• Contact support if you need custom pricing or enterprise limits</li>
        </ul>
      </Card>
    </div>
  );
}
