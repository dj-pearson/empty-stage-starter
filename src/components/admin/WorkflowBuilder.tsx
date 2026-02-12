import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Zap,
  Plus,
  MoreVertical,
  PlayCircle,
  Trash2,
  Edit,
  Copy,
  Save,
  GitBranch,
  Mail,
  Clock,
  Tag,
  Bell,
  Target,
  Settings,
  ChevronRight,
  X,
  Webhook,
  RefreshCw,
  CheckCircle,
  XCircle,
  Timer,
  MessageSquare,
  UserPlus,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

// Types
interface WorkflowNode {
  id: string;
  type: "trigger" | "condition" | "action" | "delay";
  config: Record<string, any>;
  position: number;
  children?: string[]; // For branching (conditions)
}

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: string;
  trigger_config: Record<string, any>;
  nodes: WorkflowNode[];
  stats: {
    runs: number;
    successful: number;
    failed: number;
  };
  created_at: string;
  updated_at: string;
}

// Constants
const TRIGGER_TYPES = [
  { value: "lead_created", label: "New Lead", icon: UserPlus, description: "When a new lead is captured" },
  { value: "lead_status_changed", label: "Lead Status Changed", icon: Target, description: "When lead status updates" },
  { value: "trial_started", label: "Trial Started", icon: PlayCircle, description: "When user starts trial" },
  { value: "trial_ending", label: "Trial Ending Soon", icon: Timer, description: "X days before trial ends" },
  { value: "subscription_created", label: "New Subscription", icon: CheckCircle, description: "When user subscribes" },
  { value: "subscription_canceled", label: "Subscription Canceled", icon: XCircle, description: "When user cancels" },
  { value: "form_submitted", label: "Form Submitted", icon: MessageSquare, description: "When form is submitted" },
  { value: "scheduled", label: "Scheduled", icon: Clock, description: "Run on a schedule" },
  { value: "webhook", label: "Webhook", icon: Webhook, description: "External webhook trigger" },
  { value: "manual", label: "Manual", icon: Settings, description: "Manually triggered" },
];

const ACTION_TYPES = [
  { value: "send_email", label: "Send Email", icon: Mail, description: "Send an email to the contact" },
  { value: "add_to_sequence", label: "Add to Sequence", icon: Send, description: "Enroll in email sequence" },
  { value: "update_lead_status", label: "Update Lead Status", icon: Target, description: "Change lead status" },
  { value: "add_tag", label: "Add Tag", icon: Tag, description: "Add a tag to the contact" },
  { value: "remove_tag", label: "Remove Tag", icon: X, description: "Remove a tag from contact" },
  { value: "send_notification", label: "Send Notification", icon: Bell, description: "Notify team member" },
  { value: "create_task", label: "Create Task", icon: CheckCircle, description: "Create a follow-up task" },
  { value: "webhook", label: "Call Webhook", icon: Webhook, description: "Send data to external URL" },
  { value: "update_field", label: "Update Field", icon: Edit, description: "Update contact field" },
];

const CONDITION_FIELDS = [
  { value: "lead.status", label: "Lead Status" },
  { value: "lead.source", label: "Lead Source" },
  { value: "lead.score", label: "Lead Score" },
  { value: "user.subscription_status", label: "Subscription Status" },
  { value: "user.trial_days_remaining", label: "Trial Days Remaining" },
  { value: "contact.tags", label: "Has Tag" },
  { value: "contact.email_domain", label: "Email Domain" },
  { value: "form.field", label: "Form Field Value" },
];

const CONDITION_OPERATORS = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
  { value: "is_set", label: "is set" },
  { value: "is_not_set", label: "is not set" },
];

const LEAD_STATUSES = [
  "new", "contacted", "qualified", "converted", "unqualified", "lost"
];

const generateId = () => crypto.randomUUID();

export function WorkflowBuilder() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [databaseAvailable, setDatabaseAvailable] = useState(true);
  const [showBuilderDialog, setShowBuilderDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Builder state
  const [workflowName, setWorkflowName] = useState("");
  const [workflowDescription, setWorkflowDescription] = useState("");
  const [triggerType, setTriggerType] = useState("");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, any>>({});
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [isActive, setIsActive] = useState(true);

  // Node editing
  const [editingNode, setEditingNode] = useState<WorkflowNode | null>(null);
  const [showNodeDialog, setShowNodeDialog] = useState(false);
  const [nodeType, setNodeType] = useState<"action" | "condition" | "delay">("action");
  const [nodeConfig, setNodeConfig] = useState<Record<string, any>>({});

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      setLoading(true);

      // Check if automation_workflows table exists
      const { data, error } = await supabase
        .from("automation_workflows")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        // Check if error is due to missing table
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          logger.warn("automation_workflows table not yet created - feature requires database migration");
          setDatabaseAvailable(false);
          setWorkflows([]);
          return;
        }
        logger.error("Error loading workflows:", error);
        toast.error("Failed to load workflows");
        return;
      }

      setDatabaseAvailable(true);
      setWorkflows(data || []);
    } catch (error) {
      logger.error("Error loading workflows:", error);
      setDatabaseAvailable(false);
    } finally {
      setLoading(false);
    }
  };

  const saveWorkflow = async () => {
    if (!workflowName || !triggerType) {
      toast.error("Please provide a name and select a trigger");
      return;
    }

    const workflow: Workflow = {
      id: selectedWorkflow?.id || generateId(),
      name: workflowName,
      description: workflowDescription || null,
      is_active: isActive,
      trigger_type: triggerType,
      trigger_config: triggerConfig,
      nodes,
      stats: selectedWorkflow?.stats || { runs: 0, successful: 0, failed: 0 },
      created_at: selectedWorkflow?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      if (!databaseAvailable) {
        toast.error("Workflow feature requires database setup. Please run the required migrations.");
        return;
      }

      // Save to database
      const { error } = await supabase
        .from("automation_workflows")
        .upsert([workflow]);

      if (error) {
        logger.error("Error saving workflow:", error);
        toast.error("Failed to save workflow. Database may need migration.");
        return;
      }

      await loadWorkflows();
      toast.success(selectedWorkflow ? "Workflow updated" : "Workflow created");
      resetBuilder();
      setShowBuilderDialog(false);
    } catch (error) {
      logger.error("Error saving workflow:", error);
      toast.error("Failed to save workflow");
    }
  };

  const deleteWorkflow = async () => {
    if (!deleteTargetId) return;

    try {
      const { error } = await supabase
        .from("automation_workflows")
        .delete()
        .eq("id", deleteTargetId);

      if (error) {
        // Fallback to local storage
        const newWorkflows = workflows.filter((w) => w.id !== deleteTargetId);
        localStorage.setItem("automation_workflows", JSON.stringify(newWorkflows));
        setWorkflows(newWorkflows);
      } else {
        await loadWorkflows();
      }

      toast.success("Workflow deleted");
      setShowDeleteDialog(false);
      setDeleteTargetId(null);
    } catch (error) {
      logger.error("Error deleting workflow:", error);
      toast.error("Failed to delete workflow");
    }
  };

  const toggleWorkflow = async (workflow: Workflow) => {
    const updated = { ...workflow, is_active: !workflow.is_active };

    try {
      const { error } = await supabase
        .from("automation_workflows")
        .update({ is_active: updated.is_active })
        .eq("id", workflow.id);

      if (error) {
        // Fallback to local storage
        const newWorkflows = workflows.map((w) =>
          w.id === workflow.id ? updated : w
        );
        localStorage.setItem("automation_workflows", JSON.stringify(newWorkflows));
        setWorkflows(newWorkflows);
      } else {
        await loadWorkflows();
      }

      toast.success(updated.is_active ? "Workflow activated" : "Workflow paused");
    } catch (error) {
      logger.error("Error toggling workflow:", error);
    }
  };

  const duplicateWorkflow = async (workflow: Workflow) => {
    const duplicate: Workflow = {
      ...workflow,
      id: generateId(),
      name: `${workflow.name} (Copy)`,
      is_active: false,
      stats: { runs: 0, successful: 0, failed: 0 },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const { error } = await supabase
        .from("automation_workflows")
        .insert([duplicate]);

      if (error) {
        // Fallback to local storage
        const newWorkflows = [duplicate, ...workflows];
        localStorage.setItem("automation_workflows", JSON.stringify(newWorkflows));
        setWorkflows(newWorkflows);
      } else {
        await loadWorkflows();
      }

      toast.success("Workflow duplicated");
    } catch (error) {
      logger.error("Error duplicating workflow:", error);
    }
  };

  const openEditWorkflow = (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setWorkflowName(workflow.name);
    setWorkflowDescription(workflow.description || "");
    setTriggerType(workflow.trigger_type);
    setTriggerConfig(workflow.trigger_config);
    setNodes(workflow.nodes);
    setIsActive(workflow.is_active);
    setShowBuilderDialog(true);
  };

  const resetBuilder = () => {
    setSelectedWorkflow(null);
    setWorkflowName("");
    setWorkflowDescription("");
    setTriggerType("");
    setTriggerConfig({});
    setNodes([]);
    setIsActive(true);
  };

  const addNode = (type: "action" | "condition" | "delay") => {
    setNodeType(type);
    setEditingNode(null);
    setNodeConfig({});
    setShowNodeDialog(true);
  };

  const saveNode = () => {
    const node: WorkflowNode = {
      id: editingNode?.id || generateId(),
      type: nodeType,
      config: nodeConfig,
      position: editingNode?.position ?? nodes.length,
    };

    if (editingNode) {
      setNodes(nodes.map((n) => (n.id === node.id ? node : n)));
    } else {
      setNodes([...nodes, node]);
    }

    setShowNodeDialog(false);
    setEditingNode(null);
    setNodeConfig({});
  };

  const editNode = (node: WorkflowNode) => {
    setEditingNode(node);
    setNodeType(node.type as "action" | "condition" | "delay");
    setNodeConfig(node.config);
    setShowNodeDialog(true);
  };

  const deleteNode = (nodeId: string) => {
    setNodes(nodes.filter((n) => n.id !== nodeId));
  };

  const moveNode = (nodeId: string, direction: "up" | "down") => {
    const index = nodes.findIndex((n) => n.id === nodeId);
    if (index === -1) return;

    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= nodes.length) return;

    const newNodes = [...nodes];
    [newNodes[index], newNodes[newIndex]] = [newNodes[newIndex], newNodes[index]];
    newNodes.forEach((n, i) => (n.position = i));
    setNodes(newNodes);
  };

  const getTriggerIcon = (type: string) => {
    const trigger = TRIGGER_TYPES.find((t) => t.value === type);
    return trigger?.icon || Zap;
  };

  const _getActionIcon = (type: string) => {
    const action = ACTION_TYPES.find((a) => a.value === type);
    return action?.icon || Settings;
  };

  const renderNodeConfig = () => {
    if (nodeType === "delay") {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Days</Label>
              <Input
                type="number"
                min="0"
                value={nodeConfig.days || 0}
                onChange={(e) =>
                  setNodeConfig({ ...nodeConfig, days: parseInt(e.target.value) || 0 })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Hours</Label>
              <Input
                type="number"
                min="0"
                max="23"
                value={nodeConfig.hours || 0}
                onChange={(e) =>
                  setNodeConfig({ ...nodeConfig, hours: parseInt(e.target.value) || 0 })
                }
              />
            </div>
          </div>
        </div>
      );
    }

    if (nodeType === "condition") {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Field</Label>
            <Select
              value={nodeConfig.field || ""}
              onValueChange={(value) => setNodeConfig({ ...nodeConfig, field: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select field" />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_FIELDS.map((field) => (
                  <SelectItem key={field.value} value={field.value}>
                    {field.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Operator</Label>
            <Select
              value={nodeConfig.operator || ""}
              onValueChange={(value) => setNodeConfig({ ...nodeConfig, operator: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select operator" />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_OPERATORS.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!["is_set", "is_not_set"].includes(nodeConfig.operator || "") && (
            <div className="space-y-2">
              <Label>Value</Label>
              <Input
                value={nodeConfig.value || ""}
                onChange={(e) =>
                  setNodeConfig({ ...nodeConfig, value: e.target.value })
                }
                placeholder="Enter value"
              />
            </div>
          )}
        </div>
      );
    }

    // Action config
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Action Type</Label>
          <Select
            value={nodeConfig.action_type || ""}
            onValueChange={(value) => setNodeConfig({ ...nodeConfig, action_type: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select action" />
            </SelectTrigger>
            <SelectContent>
              {ACTION_TYPES.map((action) => (
                <SelectItem key={action.value} value={action.value}>
                  <div className="flex items-center gap-2">
                    <action.icon className="h-4 w-4" />
                    {action.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Action-specific config */}
        {nodeConfig.action_type === "send_email" && (
          <>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                value={nodeConfig.subject || ""}
                onChange={(e) =>
                  setNodeConfig({ ...nodeConfig, subject: e.target.value })
                }
                placeholder="Email subject"
              />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <Textarea
                value={nodeConfig.body || ""}
                onChange={(e) =>
                  setNodeConfig({ ...nodeConfig, body: e.target.value })
                }
                placeholder="Email body (HTML supported)"
                rows={4}
              />
            </div>
          </>
        )}

        {nodeConfig.action_type === "update_lead_status" && (
          <div className="space-y-2">
            <Label>New Status</Label>
            <Select
              value={nodeConfig.status || ""}
              onValueChange={(value) => setNodeConfig({ ...nodeConfig, status: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {(nodeConfig.action_type === "add_tag" || nodeConfig.action_type === "remove_tag") && (
          <div className="space-y-2">
            <Label>Tag</Label>
            <Input
              value={nodeConfig.tag || ""}
              onChange={(e) =>
                setNodeConfig({ ...nodeConfig, tag: e.target.value })
              }
              placeholder="Enter tag name"
            />
          </div>
        )}

        {nodeConfig.action_type === "send_notification" && (
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={nodeConfig.message || ""}
              onChange={(e) =>
                setNodeConfig({ ...nodeConfig, message: e.target.value })
              }
              placeholder="Notification message"
              rows={3}
            />
          </div>
        )}

        {nodeConfig.action_type === "webhook" && (
          <>
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <Input
                value={nodeConfig.url || ""}
                onChange={(e) =>
                  setNodeConfig({ ...nodeConfig, url: e.target.value })
                }
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label>Method</Label>
              <Select
                value={nodeConfig.method || "POST"}
                onValueChange={(value) => setNodeConfig({ ...nodeConfig, method: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderNode = (node: WorkflowNode, index: number) => {
    const isAction = node.type === "action";
    const isCondition = node.type === "condition";
    const isDelay = node.type === "delay";

    let icon = Settings;
    let title = "Unknown";
    let subtitle = "";

    if (isDelay) {
      icon = Clock;
      title = "Wait";
      const days = node.config.days || 0;
      const hours = node.config.hours || 0;
      subtitle = `${days}d ${hours}h`;
    } else if (isCondition) {
      icon = GitBranch;
      title = "Condition";
      subtitle = `${node.config.field} ${node.config.operator} ${node.config.value || ""}`;
    } else if (isAction) {
      const action = ACTION_TYPES.find((a) => a.value === node.config.action_type);
      icon = action?.icon || Settings;
      title = action?.label || "Action";
      subtitle = node.config.subject || node.config.status || node.config.tag || node.config.message?.substring(0, 30) || "";
    }

    const Icon = icon;

    return (
      <div key={node.id} className="flex items-center gap-4">
        {/* Connector line */}
        <div className="flex flex-col items-center">
          <div className="w-px h-6 bg-border" />
          <div
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              isCondition && "bg-amber-100 border-2 border-amber-500",
              isDelay && "bg-blue-100 border-2 border-blue-500",
              isAction && "bg-green-100 border-2 border-green-500"
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4",
                isCondition && "text-amber-600",
                isDelay && "text-blue-600",
                isAction && "text-green-600"
              )}
            />
          </div>
          {index < nodes.length - 1 && <div className="w-px h-full bg-border flex-1" />}
        </div>

        {/* Node card */}
        <Card className="flex-1">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      isCondition && "border-amber-500 text-amber-600",
                      isDelay && "border-blue-500 text-blue-600",
                      isAction && "border-green-500 text-green-600"
                    )}
                  >
                    {title}
                  </Badge>
                </div>
                {subtitle && (
                  <p className="text-sm text-muted-foreground mt-1 truncate max-w-xs">
                    {subtitle}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => moveNode(node.id, "up")}
                  disabled={index === 0}
                >
                  <ChevronRight className="h-4 w-4 -rotate-90" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => moveNode(node.id, "down")}
                  disabled={index === nodes.length - 1}
                >
                  <ChevronRight className="h-4 w-4 rotate-90" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => editNode(node)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => deleteNode(node.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardHeader>
        </Card>
      </div>
    );
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
          <h2 className="text-2xl font-bold">Automation Workflows</h2>
          <p className="text-muted-foreground">
            Create custom automation workflows with triggers, conditions, and actions
          </p>
        </div>
        <Button
          onClick={() => {
            resetBuilder();
            setShowBuilderDialog(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Workflow
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Total Workflows
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{workflows.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <PlayCircle className="h-4 w-4" />
              Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-safe-food">
              {workflows.filter((w) => w.is_active).length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Total Runs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">
              {workflows.reduce((sum, w) => sum + (w.stats?.runs || 0), 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-500">
              {(() => {
                const total = workflows.reduce((sum, w) => sum + (w.stats?.runs || 0), 0);
                const successful = workflows.reduce((sum, w) => sum + (w.stats?.successful || 0), 0);
                return total > 0 ? `${Math.round((successful / total) * 100)}%` : "N/A";
              })()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Workflows List */}
      <div className="space-y-4">
        {workflows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Zap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No workflows yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first automation workflow to streamline your processes
              </p>
              <Button
                onClick={() => {
                  resetBuilder();
                  setShowBuilderDialog(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Workflow
              </Button>
            </CardContent>
          </Card>
        ) : (
          workflows.map((workflow) => {
            const TriggerIcon = getTriggerIcon(workflow.trigger_type);
            const triggerLabel = TRIGGER_TYPES.find((t) => t.value === workflow.trigger_type)?.label || workflow.trigger_type;

            return (
              <Card key={workflow.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <TriggerIcon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle>{workflow.name}</CardTitle>
                          {workflow.is_active ? (
                            <Badge className="bg-safe-food">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Paused</Badge>
                          )}
                        </div>
                        <CardDescription>
                          Trigger: {triggerLabel} | {workflow.nodes.length} step
                          {workflow.nodes.length !== 1 ? "s" : ""}
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
                        <span>{workflow.stats?.runs || 0} runs</span>
                        <span className="text-safe-food">
                          {workflow.stats?.successful || 0} successful
                        </span>
                        {(workflow.stats?.failed || 0) > 0 && (
                          <span className="text-destructive">
                            {workflow.stats.failed} failed
                          </span>
                        )}
                      </div>

                      <Switch
                        checked={workflow.is_active}
                        onCheckedChange={() => toggleWorkflow(workflow)}
                      />

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditWorkflow(workflow)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => duplicateWorkflow(workflow)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              setDeleteTargetId(workflow.id);
                              setShowDeleteDialog(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })
        )}
      </div>

      {/* Workflow Builder Dialog */}
      <Dialog open={showBuilderDialog} onOpenChange={setShowBuilderDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {selectedWorkflow ? "Edit Workflow" : "Create Workflow"}
            </DialogTitle>
            <DialogDescription>
              Build your automation workflow step by step
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="setup" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="setup">Setup</TabsTrigger>
              <TabsTrigger value="steps">Steps ({nodes.length})</TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1">
              <TabsContent value="setup" className="space-y-4 p-1">
                <div className="space-y-2">
                  <Label>Workflow Name *</Label>
                  <Input
                    value={workflowName}
                    onChange={(e) => setWorkflowName(e.target.value)}
                    placeholder="New Lead Follow-up"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={workflowDescription}
                    onChange={(e) => setWorkflowDescription(e.target.value)}
                    placeholder="Describe what this workflow does..."
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Trigger *</Label>
                  <Select value={triggerType} onValueChange={setTriggerType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select trigger" />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIGGER_TYPES.map((trigger) => (
                        <SelectItem key={trigger.value} value={trigger.value}>
                          <div className="flex items-center gap-2">
                            <trigger.icon className="h-4 w-4" />
                            <div>
                              <p className="font-medium">{trigger.label}</p>
                              <p className="text-xs text-muted-foreground">
                                {trigger.description}
                              </p>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Trigger-specific config */}
                {triggerType === "trial_ending" && (
                  <div className="space-y-2">
                    <Label>Days before trial ends</Label>
                    <Input
                      type="number"
                      min="1"
                      value={triggerConfig.days_before || 3}
                      onChange={(e) =>
                        setTriggerConfig({
                          ...triggerConfig,
                          days_before: parseInt(e.target.value) || 3,
                        })
                      }
                    />
                  </div>
                )}

                {triggerType === "scheduled" && (
                  <div className="space-y-2">
                    <Label>Schedule (Cron expression)</Label>
                    <Input
                      value={triggerConfig.cron || ""}
                      onChange={(e) =>
                        setTriggerConfig({ ...triggerConfig, cron: e.target.value })
                      }
                      placeholder="0 9 * * 1 (Every Monday at 9am)"
                    />
                  </div>
                )}

                {triggerType === "lead_created" && (
                  <div className="space-y-2">
                    <Label>Filter by Source (optional)</Label>
                    <Select
                      value={triggerConfig.source || ""}
                      onValueChange={(value) =>
                        setTriggerConfig({ ...triggerConfig, source: value || undefined })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All sources" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All sources</SelectItem>
                        <SelectItem value="contact_form">Contact Form</SelectItem>
                        <SelectItem value="newsletter">Newsletter</SelectItem>
                        <SelectItem value="trial_signup">Trial Signup</SelectItem>
                        <SelectItem value="landing_page">Landing Page</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Switch
                    id="wf-active"
                    checked={isActive}
                    onCheckedChange={setIsActive}
                  />
                  <Label htmlFor="wf-active">Activate workflow immediately</Label>
                </div>
              </TabsContent>

              <TabsContent value="steps" className="space-y-4 p-1">
                {/* Trigger visualization */}
                {triggerType && (
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                      {(() => {
                        const TriggerIcon = getTriggerIcon(triggerType);
                        return <TriggerIcon className="h-5 w-5 text-primary-foreground" />;
                      })()}
                    </div>
                    <div>
                      <p className="font-medium">
                        Trigger: {TRIGGER_TYPES.find((t) => t.value === triggerType)?.label}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Workflow starts when this event occurs
                      </p>
                    </div>
                  </div>
                )}

                {/* Nodes */}
                {nodes.map((node, index) => renderNode(node, index))}

                {/* Add step buttons */}
                <div className="flex items-center gap-4 pt-4">
                  <div className="flex flex-col items-center">
                    {nodes.length > 0 && <div className="w-px h-6 bg-border" />}
                    <div className="w-10 h-10 rounded-full border-2 border-dashed border-muted-foreground flex items-center justify-center">
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" onClick={() => addNode("action")}>
                      <Zap className="h-4 w-4 mr-2" />
                      Add Action
                    </Button>
                    <Button variant="outline" onClick={() => addNode("condition")}>
                      <GitBranch className="h-4 w-4 mr-2" />
                      Add Condition
                    </Button>
                    <Button variant="outline" onClick={() => addNode("delay")}>
                      <Clock className="h-4 w-4 mr-2" />
                      Add Delay
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowBuilderDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveWorkflow}
              disabled={!workflowName || !triggerType}
            >
              <Save className="h-4 w-4 mr-2" />
              {selectedWorkflow ? "Update" : "Create"} Workflow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Node Edit Dialog */}
      <Dialog open={showNodeDialog} onOpenChange={setShowNodeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingNode ? "Edit" : "Add"}{" "}
              {nodeType === "action" ? "Action" : nodeType === "condition" ? "Condition" : "Delay"}
            </DialogTitle>
          </DialogHeader>

          {renderNodeConfig()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNodeDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveNode}>
              {editingNode ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this workflow. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteWorkflow}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
