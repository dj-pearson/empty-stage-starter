import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Plus,
  Edit,
  History,
  Copy,
  Trash2,
  RotateCcw,
  FileText,
  Sparkles,
} from 'lucide-react';
import { format } from 'date-fns';
import { logger } from '@/lib/logger';

interface PromptTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  system_prompt: string;
  user_prompt_template: string;
  variables: string[];
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface PromptVersion {
  version_number: number;
  system_prompt: string;
  user_prompt_template: string;
  variables: string[];
  change_notes: string | null;
  created_at: string;
}

interface PromptUsageStats {
  total_uses: number;
  success_rate: number;
  avg_tokens: number;
}

export function PromptTemplateManager() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showVersionsDialog, setShowVersionsDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [selectedVersions, setSelectedVersions] = useState<PromptVersion[]>([]);
  const [usageStats, setUsageStats] = useState<Record<string, PromptUsageStats>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'blog',
    system_prompt: '',
    user_prompt_template: '',
    variables: '',
    is_active: true,
    is_default: false,
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('prompt_templates')
        .select('*')
        .order('category', { ascending: true })
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });

      if (error) throw error;
      setTemplates(data || []);

      // Load usage stats for each template
      const stats: Record<string, PromptUsageStats> = {};
      for (const template of data || []) {
        const { data: usageData } = await supabase
          .from('prompt_usage_log')
          .select('success, tokens_used')
          .eq('template_id', template.id);

        if (usageData && usageData.length > 0) {
          const totalUses = usageData.length;
          const successCount = usageData.filter((u) => u.success).length;
          const avgTokens = usageData.reduce((sum, u) => sum + (u.tokens_used || 0), 0) / totalUses;

          stats[template.id] = {
            total_uses: totalUses,
            success_rate: Math.round((successCount / totalUses) * 100),
            avg_tokens: Math.round(avgTokens),
          };
        }
      }
      setUsageStats(stats);
    } catch (error) {
      logger.error('Error loading prompt templates:', error);
      toast.error('Failed to load prompt templates');
    } finally {
      setLoading(false);
    }
  };

  const loadVersionHistory = async (templateId: string) => {
    try {
      const { data, error } = await supabase
        .from('prompt_template_versions')
        .select('*')
        .eq('template_id', templateId)
        .order('version_number', { ascending: false });

      if (error) throw error;

      // Parse variables from JSONB
      const versions = (data || []).map((v) => ({
        ...v,
        variables: Array.isArray(v.variables) ? v.variables : JSON.parse(v.variables || '[]'),
      }));

      setSelectedVersions(versions);
      setShowVersionsDialog(true);
    } catch (error) {
      logger.error('Error loading version history:', error);
      toast.error('Failed to load version history');
    }
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.system_prompt || !formData.user_prompt_template) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      // Parse variables from comma-separated string
      const variablesArray = formData.variables
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0);

      const { error } = await supabase.from('prompt_templates').insert([
        {
          name: formData.name,
          description: formData.description || null,
          category: formData.category,
          system_prompt: formData.system_prompt,
          user_prompt_template: formData.user_prompt_template,
          variables: variablesArray,
          is_active: formData.is_active,
          is_default: formData.is_default,
        },
      ]);

      if (error) throw error;

      toast.success('Prompt template created successfully');
      setShowCreateDialog(false);
      resetForm();
      loadTemplates();
    } catch (error) {
      logger.error('Error creating prompt template:', error);
      toast.error('Failed to create prompt template');
    }
  };

  const handleUpdate = async () => {
    if (!editingTemplate) return;

    try {
      const variablesArray = formData.variables
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0);

      const { error } = await supabase
        .from('prompt_templates')
        .update({
          name: formData.name,
          description: formData.description || null,
          category: formData.category,
          system_prompt: formData.system_prompt,
          user_prompt_template: formData.user_prompt_template,
          variables: variablesArray,
          is_active: formData.is_active,
          is_default: formData.is_default,
        })
        .eq('id', editingTemplate.id);

      if (error) throw error;

      toast.success('Prompt template updated successfully');
      setShowEditDialog(false);
      setEditingTemplate(null);
      resetForm();
      loadTemplates();
    } catch (error) {
      logger.error('Error updating prompt template:', error);
      toast.error('Failed to update prompt template');
    }
  };

  const requestDelete = (id: string) => {
    setPendingDeleteId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setShowDeleteConfirm(false);
    setPendingDeleteId(null);

    try {
      const { error } = await supabase.from('prompt_templates').delete().eq('id', id);

      if (error) throw error;

      toast.success('Prompt template deleted');
      loadTemplates();
    } catch (error) {
      logger.error('Error deleting prompt template:', error);
      toast.error('Failed to delete prompt template');
    }
  };

  const handleDuplicate = async (template: PromptTemplate) => {
    try {
      const { error } = await supabase.from('prompt_templates').insert([
        {
          name: `${template.name} (Copy)`,
          description: template.description,
          category: template.category,
          system_prompt: template.system_prompt,
          user_prompt_template: template.user_prompt_template,
          variables: template.variables,
          is_active: true,
          is_default: false,
        },
      ]);

      if (error) throw error;

      toast.success('Prompt template duplicated');
      loadTemplates();
    } catch (error) {
      logger.error('Error duplicating prompt template:', error);
      toast.error('Failed to duplicate prompt template');
    }
  };

  const handleRestoreVersion = async (templateId: string, versionNumber: number) => {
    try {
      const { data, error } = await supabase.rpc('restore_prompt_version', {
        p_template_id: templateId,
        p_version_number: versionNumber,
      });

      if (error) throw error;

      if (data) {
        toast.success(`Restored to version ${versionNumber}`);
        setShowVersionsDialog(false);
        loadTemplates();
      } else {
        toast.error('Failed to restore version');
      }
    } catch (error) {
      logger.error('Error restoring version:', error);
      toast.error('Failed to restore version');
    }
  };

  const openEditDialog = (template: PromptTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || '',
      category: template.category,
      system_prompt: template.system_prompt,
      user_prompt_template: template.user_prompt_template,
      variables: Array.isArray(template.variables) ? template.variables.join(', ') : '',
      is_active: template.is_active,
      is_default: template.is_default,
    });
    setShowEditDialog(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      category: 'blog',
      system_prompt: '',
      user_prompt_template: '',
      variables: '',
      is_active: true,
      is_default: false,
    });
  };

  const groupedTemplates = templates.reduce((acc, template) => {
    const category = template.category || 'other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(template);
    return acc;
  }, {} as Record<string, PromptTemplate[]>);

  const categoryLabels: Record<string, string> = {
    blog: 'Blog Content',
    social: 'Social Media',
    email: 'Email Marketing',
    other: 'Other',
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Prompt Templates
            </CardTitle>
            <CardDescription>
              Manage and version AI prompt templates for content generation
            </CardDescription>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Template
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No prompt templates yet. Create your first template to get started!</p>
          </div>
        ) : (
          <Accordion type="multiple" className="w-full">
            {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
              <AccordionItem key={category} value={category}>
                <AccordionTrigger className="text-lg font-semibold">
                  {categoryLabels[category] || category}
                  <Badge variant="secondary" className="ml-2">
                    {categoryTemplates.length}
                  </Badge>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4">
                    {categoryTemplates.map((template) => (
                      <Card key={template.id} className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-semibold">{template.name}</h4>
                              {template.is_default && (
                                <Badge variant="default" className="text-xs">
                                  Default
                                </Badge>
                              )}
                              {!template.is_active && (
                                <Badge variant="outline" className="text-xs">
                                  Inactive
                                </Badge>
                              )}
                            </div>
                            {template.description && (
                              <p className="text-sm text-muted-foreground mb-2">
                                {template.description}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-1 mb-2">
                              {Array.isArray(template.variables) &&
                                template.variables.map((v) => (
                                  <Badge key={v} variant="secondary" className="text-xs">
                                    {`{{${v}}}`}
                                  </Badge>
                                ))}
                            </div>
                            {usageStats[template.id] && (
                              <div className="flex gap-4 text-xs text-muted-foreground">
                                <span>Uses: {usageStats[template.id].total_uses}</span>
                                <span>Success: {usageStats[template.id].success_rate}%</span>
                                <span>Avg tokens: {usageStats[template.id].avg_tokens}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => loadVersionHistory(template.id)}
                              title="Version History"
                            >
                              <History className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDuplicate(template)}
                              title="Duplicate"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(template)}
                              title="Edit"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => requestDelete(template.id)}
                              className="text-destructive hover:text-destructive"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>

      {/* Create/Edit Dialog */}
      <Dialog
        open={showCreateDialog || showEditDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setShowEditDialog(false);
            setEditingTemplate(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              {editingTemplate ? 'Edit Prompt Template' : 'Create Prompt Template'}
            </DialogTitle>
            <DialogDescription>
              Define the system and user prompts for AI content generation. Use {`{{variable}}`}{' '}
              syntax for dynamic values.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Template Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Blog Article Generator"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blog">Blog Content</SelectItem>
                    <SelectItem value="social">Social Media</SelectItem>
                    <SelectItem value="email">Email Marketing</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of what this template generates"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="system_prompt">System Prompt *</Label>
              <Textarea
                id="system_prompt"
                value={formData.system_prompt}
                onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                placeholder="You are an expert content writer..."
                rows={6}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Define the AI's role and behavior. Use {`{{variable}}`} for dynamic values.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="user_prompt">User Prompt Template *</Label>
              <Textarea
                id="user_prompt"
                value={formData.user_prompt_template}
                onChange={(e) =>
                  setFormData({ ...formData, user_prompt_template: e.target.value })
                }
                placeholder="Create a blog article about: {{topic}}..."
                rows={12}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                The main instruction template. Variables in {`{{name}}`} format will be replaced at
                runtime.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="variables">Variables (comma-separated)</Label>
              <Input
                id="variables"
                value={formData.variables}
                onChange={(e) => setFormData({ ...formData, variables: e.target.value })}
                placeholder="topic, keywords, targetAudience, tone"
              />
              <p className="text-xs text-muted-foreground">
                List expected variables used in the template
              </p>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="is_default"
                  checked={formData.is_default}
                  onCheckedChange={(v) => setFormData({ ...formData, is_default: v })}
                />
                <Label htmlFor="is_default">Default Template</Label>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setShowEditDialog(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={editingTemplate ? handleUpdate : handleCreate}>
              {editingTemplate ? 'Save Changes' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              prompt template and all its version history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Version History Dialog */}
      <Dialog open={showVersionsDialog} onOpenChange={setShowVersionsDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Version History
            </DialogTitle>
            <DialogDescription>
              View and restore previous versions of this prompt template
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            {selectedVersions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No version history available</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedVersions.map((version) => (
                    <TableRow key={version.version_number}>
                      <TableCell>
                        <Badge variant="outline">v{version.version_number}</Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(version.created_at), 'MMM d, yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {version.change_notes || '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleRestoreVersion(
                              editingTemplate?.id || '',
                              version.version_number
                            )
                          }
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Restore
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowVersionsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default PromptTemplateManager;
