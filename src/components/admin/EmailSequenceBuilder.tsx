import { useState, useEffect } from "react";
import DOMPurify from "dompurify";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
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
import {
  Mail,
  Plus,
  MoreVertical,
  Clock,
  PlayCircle,
  Trash2,
  Edit,
  Copy,
  Eye,
  ChevronDown,
  ChevronRight,
  Zap,
  Users,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

interface EmailSequence {
  id: string;
  name: string;
  description: string | null;
  trigger_event: string;
  trigger_conditions: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface EmailSequenceStep {
  id: string;
  sequence_id: string;
  step_order: number;
  delay_days: number;
  delay_hours: number;
  subject: string;
  html_body: string;
  text_body: string | null;
  condition_rules: Record<string, any>;
  created_at: string;
}

interface SequenceStats {
  sequence_id: string;
  enrolled: number;
  completed: number;
  active: number;
}

const TRIGGER_EVENTS = [
  { value: "lead_created", label: "New Lead Created", description: "When a new lead is captured" },
  { value: "trial_start", label: "Trial Started", description: "When a user starts a free trial" },
  { value: "trial_ending", label: "Trial Ending", description: "When trial is about to expire" },
  { value: "subscription_active", label: "Subscription Activated", description: "When user converts to paid" },
  { value: "subscription_canceled", label: "Subscription Canceled", description: "When user cancels subscription" },
  { value: "user_inactive", label: "User Inactive", description: "When user hasn't logged in recently" },
  { value: "manual", label: "Manual Trigger", description: "Manually enroll users" },
];

const LEAD_SOURCES = [
  { value: "contact_form", label: "Contact Form" },
  { value: "newsletter", label: "Newsletter Signup" },
  { value: "trial_signup", label: "Trial Signup" },
  { value: "landing_page", label: "Landing Page" },
  { value: "referral", label: "Referral" },
  { value: "social_media", label: "Social Media" },
  { value: "organic_search", label: "Organic Search" },
  { value: "paid_ad", label: "Paid Ad" },
];

const EMAIL_VARIABLES = [
  { variable: "{{first_name}}", description: "Recipient's first name" },
  { variable: "{{full_name}}", description: "Recipient's full name" },
  { variable: "{{email}}", description: "Recipient's email address" },
  { variable: "{{app_url}}", description: "Application URL" },
  { variable: "{{trial_days_left}}", description: "Days remaining in trial" },
  { variable: "{{kid_name}}", description: "Child's name (if applicable)" },
];

export function EmailSequenceBuilder() {
  const [sequences, setSequences] = useState<EmailSequence[]>([]);
  const [steps, setSteps] = useState<Record<string, EmailSequenceStep[]>>({});
  const [stats, setStats] = useState<Record<string, SequenceStats>>({});
  const [loading, setLoading] = useState(true);
  const [expandedSequence, setExpandedSequence] = useState<string | null>(null);

  // Dialog states
  const [showSequenceDialog, setShowSequenceDialog] = useState(false);
  const [showStepDialog, setShowStepDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Edit states
  const [editingSequence, setEditingSequence] = useState<EmailSequence | null>(null);
  const [editingStep, setEditingStep] = useState<EmailSequenceStep | null>(null);
  const [currentSequenceId, setCurrentSequenceId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "sequence" | "step"; id: string } | null>(null);
  const [previewContent, setPreviewContent] = useState<{ subject: string; html: string } | null>(null);

  // Form states
  const [sequenceForm, setSequenceForm] = useState({
    name: "",
    description: "",
    trigger_event: "lead_created",
    trigger_conditions: {} as Record<string, any>,
    is_active: true,
  });

  const [stepForm, setStepForm] = useState({
    delay_days: 0,
    delay_hours: 0,
    subject: "",
    html_body: "",
    text_body: "",
    condition_rules: {} as Record<string, any>,
  });

  useEffect(() => {
    loadSequences();
  }, []);

  const loadSequences = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("email_sequences")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setSequences(data || []);

      // Load steps for each sequence
      for (const sequence of data || []) {
        await loadSteps(sequence.id);
        await loadStats(sequence.id);
      }
    } catch (error) {
      logger.error("Error loading sequences:", error);
      toast.error("Failed to load email sequences");
    } finally {
      setLoading(false);
    }
  };

  const loadSteps = async (sequenceId: string) => {
    try {
      const { data, error } = await supabase
        .from("email_sequence_steps")
        .select("*")
        .eq("sequence_id", sequenceId)
        .order("step_order", { ascending: true });

      if (error) throw error;

      setSteps((prev) => ({
        ...prev,
        [sequenceId]: data || [],
      }));
    } catch (error) {
      logger.error("Error loading steps:", error);
    }
  };

  const loadStats = async (sequenceId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_email_sequences")
        .select("id, completed_at, canceled_at")
        .eq("sequence_id", sequenceId);

      if (error) {
        // Table might not exist yet - handle gracefully
        setStats((prev) => ({
          ...prev,
          [sequenceId]: { sequence_id: sequenceId, enrolled: 0, completed: 0, active: 0 },
        }));
        return;
      }

      const enrolled = data?.length || 0;
      const completed = data?.filter((d) => d.completed_at).length || 0;
      const active = data?.filter((d) => !d.completed_at && !d.canceled_at).length || 0;

      setStats((prev) => ({
        ...prev,
        [sequenceId]: { sequence_id: sequenceId, enrolled, completed, active },
      }));
    } catch (error) {
      logger.error("Error loading stats:", error);
    }
  };

  const handleCreateSequence = async () => {
    try {
      const { data: _data, error } = await supabase
        .from("email_sequences")
        .insert([{
          name: sequenceForm.name,
          description: sequenceForm.description || null,
          trigger_event: sequenceForm.trigger_event,
          trigger_conditions: sequenceForm.trigger_conditions,
          is_active: sequenceForm.is_active,
        }])
        .select()
        .single();

      if (error) throw error;

      toast.success("Email sequence created");
      setShowSequenceDialog(false);
      resetSequenceForm();
      loadSequences();
    } catch (error) {
      logger.error("Error creating sequence:", error);
      toast.error("Failed to create sequence");
    }
  };

  const handleUpdateSequence = async () => {
    if (!editingSequence) return;

    try {
      const { error } = await supabase
        .from("email_sequences")
        .update({
          name: sequenceForm.name,
          description: sequenceForm.description || null,
          trigger_event: sequenceForm.trigger_event,
          trigger_conditions: sequenceForm.trigger_conditions,
          is_active: sequenceForm.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingSequence.id);

      if (error) throw error;

      toast.success("Email sequence updated");
      setShowSequenceDialog(false);
      setEditingSequence(null);
      resetSequenceForm();
      loadSequences();
    } catch (error) {
      logger.error("Error updating sequence:", error);
      toast.error("Failed to update sequence");
    }
  };

  const handleToggleSequence = async (sequence: EmailSequence) => {
    try {
      const { error } = await supabase
        .from("email_sequences")
        .update({ is_active: !sequence.is_active })
        .eq("id", sequence.id);

      if (error) throw error;

      toast.success(sequence.is_active ? "Sequence paused" : "Sequence activated");
      loadSequences();
    } catch (error) {
      logger.error("Error toggling sequence:", error);
      toast.error("Failed to update sequence");
    }
  };

  const handleCreateStep = async () => {
    if (!currentSequenceId) return;

    try {
      const existingSteps = steps[currentSequenceId] || [];
      const nextOrder = existingSteps.length > 0
        ? Math.max(...existingSteps.map((s) => s.step_order)) + 1
        : 1;

      const { error } = await supabase
        .from("email_sequence_steps")
        .insert([{
          sequence_id: currentSequenceId,
          step_order: nextOrder,
          delay_days: stepForm.delay_days,
          delay_hours: stepForm.delay_hours,
          subject: stepForm.subject,
          html_body: stepForm.html_body,
          text_body: stepForm.text_body || null,
          condition_rules: stepForm.condition_rules,
        }]);

      if (error) throw error;

      toast.success("Email step added");
      setShowStepDialog(false);
      resetStepForm();
      loadSteps(currentSequenceId);
    } catch (error) {
      logger.error("Error creating step:", error);
      toast.error("Failed to add step");
    }
  };

  const handleUpdateStep = async () => {
    if (!editingStep) return;

    try {
      const { error } = await supabase
        .from("email_sequence_steps")
        .update({
          delay_days: stepForm.delay_days,
          delay_hours: stepForm.delay_hours,
          subject: stepForm.subject,
          html_body: stepForm.html_body,
          text_body: stepForm.text_body || null,
          condition_rules: stepForm.condition_rules,
        })
        .eq("id", editingStep.id);

      if (error) throw error;

      toast.success("Email step updated");
      setShowStepDialog(false);
      setEditingStep(null);
      resetStepForm();
      loadSteps(editingStep.sequence_id);
    } catch (error) {
      logger.error("Error updating step:", error);
      toast.error("Failed to update step");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      if (deleteTarget.type === "sequence") {
        const { error } = await supabase
          .from("email_sequences")
          .delete()
          .eq("id", deleteTarget.id);

        if (error) throw error;
        toast.success("Sequence deleted");
      } else {
        const { error } = await supabase
          .from("email_sequence_steps")
          .delete()
          .eq("id", deleteTarget.id);

        if (error) throw error;
        toast.success("Step deleted");

        // Reload steps for the affected sequence
        const step = Object.values(steps).flat().find((s) => s.id === deleteTarget.id);
        if (step) {
          await loadSteps(step.sequence_id);
        }
      }

      setShowDeleteDialog(false);
      setDeleteTarget(null);
      loadSequences();
    } catch (error) {
      logger.error("Error deleting:", error);
      toast.error("Failed to delete");
    }
  };

  const handleDuplicateSequence = async (sequence: EmailSequence) => {
    try {
      // Create new sequence
      const { data: newSequence, error: seqError } = await supabase
        .from("email_sequences")
        .insert([{
          name: `${sequence.name} (Copy)`,
          description: sequence.description,
          trigger_event: sequence.trigger_event,
          trigger_conditions: sequence.trigger_conditions,
          is_active: false,
        }])
        .select()
        .single();

      if (seqError) throw seqError;

      // Copy steps
      const sequenceSteps = steps[sequence.id] || [];
      if (sequenceSteps.length > 0) {
        const { error: stepsError } = await supabase
          .from("email_sequence_steps")
          .insert(
            sequenceSteps.map((step) => ({
              sequence_id: newSequence.id,
              step_order: step.step_order,
              delay_days: step.delay_days,
              delay_hours: step.delay_hours,
              subject: step.subject,
              html_body: step.html_body,
              text_body: step.text_body,
              condition_rules: step.condition_rules,
            }))
          );

        if (stepsError) throw stepsError;
      }

      toast.success("Sequence duplicated");
      loadSequences();
    } catch (error) {
      logger.error("Error duplicating sequence:", error);
      toast.error("Failed to duplicate sequence");
    }
  };

  const openEditSequence = (sequence: EmailSequence) => {
    setEditingSequence(sequence);
    setSequenceForm({
      name: sequence.name,
      description: sequence.description || "",
      trigger_event: sequence.trigger_event,
      trigger_conditions: sequence.trigger_conditions || {},
      is_active: sequence.is_active,
    });
    setShowSequenceDialog(true);
  };

  const openEditStep = (step: EmailSequenceStep) => {
    setEditingStep(step);
    setStepForm({
      delay_days: step.delay_days,
      delay_hours: step.delay_hours,
      subject: step.subject,
      html_body: step.html_body,
      text_body: step.text_body || "",
      condition_rules: step.condition_rules || {},
    });
    setShowStepDialog(true);
  };

  const openAddStep = (sequenceId: string) => {
    setCurrentSequenceId(sequenceId);
    setEditingStep(null);
    resetStepForm();
    setShowStepDialog(true);
  };

  const openPreview = (step: EmailSequenceStep) => {
    setPreviewContent({
      subject: step.subject,
      html: step.html_body,
    });
    setShowPreviewDialog(true);
  };

  const resetSequenceForm = () => {
    setSequenceForm({
      name: "",
      description: "",
      trigger_event: "lead_created",
      trigger_conditions: {},
      is_active: true,
    });
  };

  const resetStepForm = () => {
    setStepForm({
      delay_days: 0,
      delay_hours: 0,
      subject: "",
      html_body: "",
      text_body: "",
      condition_rules: {},
    });
  };

  const getTriggerLabel = (event: string) => {
    return TRIGGER_EVENTS.find((t) => t.value === event)?.label || event;
  };

  const formatDelay = (days: number, hours: number) => {
    if (days === 0 && hours === 0) return "Immediately";
    const parts = [];
    if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`);
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
    return parts.join(", ");
  };

  const calculateTotalDuration = (sequenceId: string) => {
    const sequenceSteps = steps[sequenceId] || [];
    let totalDays = 0;
    let totalHours = 0;

    sequenceSteps.forEach((step) => {
      totalDays += step.delay_days;
      totalHours += step.delay_hours;
    });

    totalDays += Math.floor(totalHours / 24);
    totalHours = totalHours % 24;

    return formatDelay(totalDays, totalHours);
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
          <h2 className="text-2xl font-bold">Email Sequences</h2>
          <p className="text-muted-foreground">
            Create automated drip campaigns to nurture leads
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingSequence(null);
            resetSequenceForm();
            setShowSequenceDialog(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Sequence
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Total Sequences
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{sequences.length}</p>
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
              {sequences.filter((s) => s.is_active).length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Enrolled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">
              {Object.values(stats).reduce((sum, s) => sum + s.enrolled, 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-500">
              {Object.values(stats).reduce((sum, s) => sum + s.completed, 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sequences List */}
      <div className="space-y-4">
        {sequences.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No sequences yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first email sequence to start nurturing leads
              </p>
              <Button
                onClick={() => {
                  setEditingSequence(null);
                  resetSequenceForm();
                  setShowSequenceDialog(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Sequence
              </Button>
            </CardContent>
          </Card>
        ) : (
          sequences.map((sequence) => (
            <Card key={sequence.id} className="overflow-hidden">
              {/* Sequence Header */}
              <CardHeader className="border-b bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() =>
                        setExpandedSequence(
                          expandedSequence === sequence.id ? null : sequence.id
                        )
                      }
                      className="p-1 hover:bg-muted rounded"
                    >
                      {expandedSequence === sequence.id ? (
                        <ChevronDown className="h-5 w-5" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{sequence.name}</CardTitle>
                        {sequence.is_active ? (
                          <Badge className="bg-safe-food">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Paused</Badge>
                        )}
                      </div>
                      <CardDescription>
                        <span className="flex items-center gap-2 mt-1">
                          <Zap className="h-3 w-3" />
                          Trigger: {getTriggerLabel(sequence.trigger_event)}
                        </span>
                      </CardDescription>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Quick Stats */}
                    <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
                      <span>
                        {(steps[sequence.id] || []).length} step
                        {(steps[sequence.id] || []).length !== 1 ? "s" : ""}
                      </span>
                      <span>
                        Duration: {calculateTotalDuration(sequence.id)}
                      </span>
                      <span>
                        {stats[sequence.id]?.active || 0} active
                      </span>
                    </div>

                    {/* Toggle & Actions */}
                    <Switch
                      checked={sequence.is_active}
                      onCheckedChange={() => handleToggleSequence(sequence)}
                    />

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditSequence(sequence)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Sequence
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicateSequence(sequence)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            setDeleteTarget({ type: "sequence", id: sequence.id });
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

              {/* Expanded Steps View */}
              {expandedSequence === sequence.id && (
                <CardContent className="pt-6">
                  {sequence.description && (
                    <p className="text-sm text-muted-foreground mb-6">
                      {sequence.description}
                    </p>
                  )}

                  {/* Visual Timeline */}
                  <div className="space-y-4">
                    {/* Trigger Event */}
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                        <Zap className="h-5 w-5 text-primary-foreground" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">Trigger: {getTriggerLabel(sequence.trigger_event)}</p>
                        {Object.keys(sequence.trigger_conditions || {}).length > 0 && (
                          <p className="text-sm text-muted-foreground">
                            Conditions: {JSON.stringify(sequence.trigger_conditions)}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Steps */}
                    {(steps[sequence.id] || []).map((step, index) => (
                      <div key={step.id} className="flex items-start gap-4">
                        {/* Timeline connector */}
                        <div className="flex flex-col items-center">
                          <div className="w-px h-6 bg-border" />
                          <div
                            className={cn(
                              "w-10 h-10 rounded-full flex items-center justify-center",
                              "bg-muted border-2 border-primary"
                            )}
                          >
                            <Mail className="h-4 w-4 text-primary" />
                          </div>
                          {index < (steps[sequence.id] || []).length - 1 && (
                            <div className="w-px h-full bg-border flex-1" />
                          )}
                        </div>

                        {/* Step Content */}
                        <Card className="flex-1">
                          <CardHeader className="py-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">Step {step.step_order}</Badge>
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Wait: {formatDelay(step.delay_days, step.delay_hours)}
                                  </span>
                                </div>
                                <CardTitle className="text-base mt-2">{step.subject}</CardTitle>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openPreview(step)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => openEditStep(step)}>
                                      <Edit className="h-4 w-4 mr-2" />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openPreview(step)}>
                                      <Eye className="h-4 w-4 mr-2" />
                                      Preview
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive"
                                      onClick={() => {
                                        setDeleteTarget({ type: "step", id: step.id });
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
                      </div>
                    ))}

                    {/* Add Step Button */}
                    <div className="flex items-center gap-4 pt-2">
                      <div className="flex flex-col items-center">
                        <div className="w-px h-6 bg-border" />
                        <div className="w-10 h-10 rounded-full border-2 border-dashed border-muted-foreground flex items-center justify-center">
                          <Plus className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => openAddStep(sequence.id)}
                        className="flex-1"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Email Step
                      </Button>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          ))
        )}
      </div>

      {/* Create/Edit Sequence Dialog */}
      <Dialog open={showSequenceDialog} onOpenChange={setShowSequenceDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingSequence ? "Edit Sequence" : "Create Email Sequence"}
            </DialogTitle>
            <DialogDescription>
              Configure your automated email sequence
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="seq-name">Sequence Name *</Label>
              <Input
                id="seq-name"
                value={sequenceForm.name}
                onChange={(e) =>
                  setSequenceForm({ ...sequenceForm, name: e.target.value })
                }
                placeholder="Welcome Series"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="seq-desc">Description</Label>
              <Textarea
                id="seq-desc"
                value={sequenceForm.description}
                onChange={(e) =>
                  setSequenceForm({ ...sequenceForm, description: e.target.value })
                }
                placeholder="Describe the purpose of this sequence..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="seq-trigger">Trigger Event *</Label>
              <Select
                value={sequenceForm.trigger_event}
                onValueChange={(value) =>
                  setSequenceForm({ ...sequenceForm, trigger_event: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_EVENTS.map((trigger) => (
                    <SelectItem key={trigger.value} value={trigger.value}>
                      <div>
                        <p className="font-medium">{trigger.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {trigger.description}
                        </p>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {sequenceForm.trigger_event === "lead_created" && (
              <div className="space-y-2">
                <Label>Filter by Source (optional)</Label>
                <Select
                  value={sequenceForm.trigger_conditions?.source || ""}
                  onValueChange={(value) =>
                    setSequenceForm({
                      ...sequenceForm,
                      trigger_conditions: value
                        ? { source: value }
                        : {},
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All sources" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All sources</SelectItem>
                    {LEAD_SOURCES.map((source) => (
                      <SelectItem key={source.value} value={source.value}>
                        {source.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch
                id="seq-active"
                checked={sequenceForm.is_active}
                onCheckedChange={(checked) =>
                  setSequenceForm({ ...sequenceForm, is_active: checked })
                }
              />
              <Label htmlFor="seq-active">Activate sequence immediately</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSequenceDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={editingSequence ? handleUpdateSequence : handleCreateSequence}
              disabled={!sequenceForm.name || !sequenceForm.trigger_event}
            >
              {editingSequence ? "Update" : "Create"} Sequence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Step Dialog */}
      <Dialog open={showStepDialog} onOpenChange={setShowStepDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingStep ? "Edit Email Step" : "Add Email Step"}
            </DialogTitle>
            <DialogDescription>
              Configure when and what to send
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="content" className="space-y-4">
            <TabsList>
              <TabsTrigger value="content">Email Content</TabsTrigger>
              <TabsTrigger value="timing">Timing</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="step-subject">Subject Line *</Label>
                <Input
                  id="step-subject"
                  value={stepForm.subject}
                  onChange={(e) =>
                    setStepForm({ ...stepForm, subject: e.target.value })
                  }
                  placeholder="Welcome to EatPal, {{first_name}}!"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="step-html">HTML Body *</Label>
                <Textarea
                  id="step-html"
                  value={stepForm.html_body}
                  onChange={(e) =>
                    setStepForm({ ...stepForm, html_body: e.target.value })
                  }
                  placeholder="<div>Your email content here...</div>"
                  rows={10}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="step-text">Plain Text Body (optional)</Label>
                <Textarea
                  id="step-text"
                  value={stepForm.text_body}
                  onChange={(e) =>
                    setStepForm({ ...stepForm, text_body: e.target.value })
                  }
                  placeholder="Plain text version for email clients that don't support HTML..."
                  rows={4}
                />
              </div>

              {/* Variables Help */}
              <Card className="bg-muted/50">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Available Variables
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-2">
                  <div className="flex flex-wrap gap-2">
                    {EMAIL_VARIABLES.map((v) => (
                      <Badge
                        key={v.variable}
                        variant="outline"
                        className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                        onClick={() =>
                          setStepForm({
                            ...stepForm,
                            html_body: stepForm.html_body + v.variable,
                          })
                        }
                      >
                        {v.variable}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="timing" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="step-days">Delay (Days)</Label>
                  <Input
                    id="step-days"
                    type="number"
                    min="0"
                    value={stepForm.delay_days}
                    onChange={(e) =>
                      setStepForm({
                        ...stepForm,
                        delay_days: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="step-hours">Delay (Hours)</Label>
                  <Input
                    id="step-hours"
                    type="number"
                    min="0"
                    max="23"
                    value={stepForm.delay_hours}
                    onChange={(e) =>
                      setStepForm({
                        ...stepForm,
                        delay_hours: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <Card className="bg-muted/50">
                <CardContent className="py-4">
                  <p className="text-sm">
                    This email will be sent{" "}
                    <strong>
                      {formatDelay(stepForm.delay_days, stepForm.delay_hours)}
                    </strong>{" "}
                    after the previous step (or trigger if this is the first step).
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="preview">
              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="text-sm font-normal">
                    Subject: {stepForm.subject || "(no subject)"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {stepForm.html_body ? (
                    <div
                      className="p-4 prose max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(stepForm.html_body, {
                          ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'code', 'pre', 'div', 'span', 'table', 'thead', 'tbody', 'tr', 'td', 'th'],
                          ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'width', 'height']
                        })
                      }}
                    />
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      No content to preview
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStepDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={editingStep ? handleUpdateStep : handleCreateStep}
              disabled={!stepForm.subject || !stepForm.html_body}
            >
              {editingStep ? "Update" : "Add"} Step
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
          </DialogHeader>
          {previewContent && (
            <div className="space-y-4">
              <div className="bg-muted p-3 rounded-lg">
                <Label className="text-xs text-muted-foreground">Subject</Label>
                <p className="font-medium">{previewContent.subject}</p>
              </div>
              <div className="border rounded-lg">
                <div
                  className="p-4"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(previewContent.html, {
                      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'code', 'pre', 'div', 'span', 'table', 'thead', 'tbody', 'tr', 'td', 'th'],
                      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'style', 'target', 'width', 'height']
                    })
                  }}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "sequence"
                ? "This will permanently delete this email sequence and all its steps. Active enrollments will be canceled."
                : "This will permanently delete this email step."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
