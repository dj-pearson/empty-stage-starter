import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FileSpreadsheet,
  FileText,
  Download,
  Users,
  Receipt,
  Utensils,
  Calendar,
  BarChart3,
  Settings,
  CheckCircle2,
  Loader2,
  Package,
  Mail,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { logger } from "@/lib/logger";
import { exportToExcel, exportToDocx, ExcelSheet, DocxParagraph, DocxTable } from "@/lib/document-export";
import { cn } from "@/lib/utils";

interface ExportTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  type: "excel" | "docx" | "both";
  dataSource: string;
  columns?: string[];
}

const EXPORT_TEMPLATES: ExportTemplate[] = [
  {
    id: "users",
    name: "User Report",
    description: "Export all user data including profiles and activity",
    icon: <Users className="h-5 w-5" />,
    type: "both",
    dataSource: "profiles",
    columns: ["email", "full_name", "created_at", "last_sign_in_at", "role"],
  },
  {
    id: "subscriptions",
    name: "Subscription Report",
    description: "Active and past subscription details",
    icon: <Receipt className="h-5 w-5" />,
    type: "both",
    dataSource: "user_subscriptions",
    columns: ["user_email", "plan_name", "status", "start_date", "end_date", "amount"],
  },
  {
    id: "meals",
    name: "Meal Plans",
    description: "Weekly meal plans and nutrition data",
    icon: <Utensils className="h-5 w-5" />,
    type: "excel",
    dataSource: "plan_entries",
    columns: ["date", "meal_slot", "food_name", "kid_name", "calories", "protein"],
  },
  {
    id: "foods",
    name: "Food Database",
    description: "Complete food inventory with nutrition info",
    icon: <Package className="h-5 w-5" />,
    type: "excel",
    dataSource: "foods",
    columns: ["name", "category", "calories", "protein", "carbs", "fat", "allergens"],
  },
  {
    id: "campaigns",
    name: "Email Campaigns",
    description: "Campaign performance and engagement metrics",
    icon: <Mail className="h-5 w-5" />,
    type: "both",
    dataSource: "email_campaigns",
    columns: ["name", "subject", "sent_count", "open_rate", "click_rate", "sent_at"],
  },
  {
    id: "analytics",
    name: "Analytics Summary",
    description: "Platform usage and engagement analytics",
    icon: <BarChart3 className="h-5 w-5" />,
    type: "docx",
    dataSource: "analytics",
  },
];

export function DocumentExportManager() {
  const [selectedTemplate, setSelectedTemplate] = useState<ExportTemplate | null>(null);
  const [exportFormat, setExportFormat] = useState<"excel" | "docx">("excel");
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
    end: format(new Date(), "yyyy-MM-dd"),
  });
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [includeHeaders, setIncludeHeaders] = useState(true);
  const [splitBySheet, setSplitBySheet] = useState(false);

  const handleSelectTemplate = (template: ExportTemplate) => {
    setSelectedTemplate(template);
    setSelectedColumns(new Set(template.columns || []));
    setExportFormat(template.type === "docx" ? "docx" : "excel");
    setShowConfigDialog(true);
  };

  const toggleColumn = (column: string) => {
    const newSelected = new Set(selectedColumns);
    if (newSelected.has(column)) {
      newSelected.delete(column);
    } else {
      newSelected.add(column);
    }
    setSelectedColumns(newSelected);
  };

  const fetchDataForExport = async (template: ExportTemplate): Promise<any[]> => {
    let query;

    switch (template.dataSource) {
      case "profiles":
        const response = await fetch(`${import.meta.env.VITE_FUNCTIONS_URL}/list-users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
        });
        const users = response.ok ? await response.json() : null;
        return users?.users || [];

      case "user_subscriptions":
        const { data: subs } = await supabase
          .from("user_subscriptions")
          .select("*, profiles(email, full_name)")
          .order("created_at", { ascending: false });
        return (subs || []).map((s: any) => ({
          user_email: s.profiles?.email,
          user_name: s.profiles?.full_name,
          plan_name: s.plan_name,
          status: s.status,
          start_date: s.current_period_start,
          end_date: s.current_period_end,
          amount: s.amount,
        }));

      case "plan_entries":
        const { data: plans } = await supabase
          .from("plan_entries")
          .select("*, foods(name, nutrition_info), kids(name)")
          .gte("date", dateRange.start)
          .lte("date", dateRange.end)
          .order("date", { ascending: false });
        return (plans || []).map((p: any) => ({
          date: p.date,
          meal_slot: p.meal_slot,
          food_name: p.foods?.name,
          kid_name: p.kids?.name,
          calories: p.foods?.nutrition_info?.calories,
          protein: p.foods?.nutrition_info?.protein,
        }));

      case "foods":
        const { data: foods } = await supabase
          .from("foods")
          .select("*")
          .order("name");
        return (foods || []).map((f: any) => ({
          name: f.name,
          category: f.category,
          calories: f.nutrition_info?.calories,
          protein: f.nutrition_info?.protein,
          carbs: f.nutrition_info?.carbs,
          fat: f.nutrition_info?.fat,
          allergens: f.allergens?.join(", "),
        }));

      case "email_campaigns":
        const { data: campaigns } = await supabase
          .from("email_campaigns")
          .select("*")
          .order("created_at", { ascending: false });
        return (campaigns || []).map((c: any) => ({
          name: c.name,
          subject: c.subject,
          sent_count: c.total_sent,
          open_rate: `${(c.open_rate || 0).toFixed(1)}%`,
          click_rate: `${(c.click_rate || 0).toFixed(1)}%`,
          sent_at: c.sent_at ? format(new Date(c.sent_at), "yyyy-MM-dd HH:mm") : "Not sent",
        }));

      case "analytics":
        // Generate analytics summary
        const [usersResult, subsResult, plansResult] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact" }),
          supabase.from("user_subscriptions").select("status").eq("status", "active"),
          supabase.from("plan_entries").select("id", { count: "exact" }),
        ]);

        return [
          { metric: "Total Users", value: usersResult.count || 0 },
          { metric: "Active Subscriptions", value: subsResult.data?.length || 0 },
          { metric: "Total Meal Plans", value: plansResult.count || 0 },
          { metric: "Report Date", value: format(new Date(), "MMMM d, yyyy") },
        ];

      default:
        return [];
    }
  };

  const handleExport = async () => {
    if (!selectedTemplate) return;

    setIsExporting(true);
    setExportProgress(0);

    try {
      setExportProgress(20);
      const data = await fetchDataForExport(selectedTemplate);
      setExportProgress(50);

      if (data.length === 0) {
        toast.error("No data to export");
        return;
      }

      const filename = `${selectedTemplate.name.replace(/\s+/g, "-").toLowerCase()}-${format(new Date(), "yyyy-MM-dd")}`;

      if (exportFormat === "excel") {
        // Filter columns if specified
        const columns = Array.from(selectedColumns);
        const filteredData = columns.length > 0
          ? data.map((row) => {
              const filtered: Record<string, any> = {};
              columns.forEach((col) => {
                filtered[col] = row[col];
              });
              return filtered;
            })
          : data;

        const sheets: ExcelSheet[] = [
          {
            name: selectedTemplate.name,
            columns: (columns.length > 0 ? columns : Object.keys(data[0])).map((key) => ({
              header: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
              key,
              width: 20,
            })),
            data: filteredData,
            freezeHeader: includeHeaders,
            autoFilter: true,
          },
        ];

        setExportProgress(80);
        await exportToExcel({ filename, sheets });
      } else {
        // DOCX export
        const content: (DocxParagraph | DocxTable | { type: "lineBreak" })[] = [
          { text: selectedTemplate.name, style: "title" },
          { text: selectedTemplate.description, style: "subtitle" },
          { text: `Generated on ${format(new Date(), "MMMM d, yyyy 'at' h:mm a")}`, style: "normal" },
          { type: "lineBreak" },
        ];

        if (data.length > 0) {
          const columns = Array.from(selectedColumns).length > 0
            ? Array.from(selectedColumns)
            : Object.keys(data[0]);

          const headers = columns.map(
            (k) => k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " ")
          );
          const rows = data.map((row) => columns.map((col) => String(row[col] ?? "")));

          content.push({ headers, rows });
        }

        setExportProgress(80);
        await exportToDocx({
          filename,
          title: selectedTemplate.name,
          content,
        });
      }

      setExportProgress(100);
      toast.success(`${selectedTemplate.name} exported successfully`);
      setShowConfigDialog(false);
    } catch (error) {
      logger.error("Export failed:", error);
      toast.error("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-3">
            <Download className="h-8 w-8 text-primary" />
            Document Export
          </h2>
          <p className="text-muted-foreground mt-1">
            Export data to Microsoft Office formats (DOCX, XLSX)
          </p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Exports</CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{EXPORT_TEMPLATES.length}</div>
            <p className="text-xs text-muted-foreground">Report templates</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Excel Exports</CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {EXPORT_TEMPLATES.filter((t) => t.type !== "docx").length}
            </div>
            <p className="text-xs text-muted-foreground">XLSX format</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Word Exports</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {EXPORT_TEMPLATES.filter((t) => t.type !== "excel").length}
            </div>
            <p className="text-xs text-muted-foreground">DOCX format</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Both Formats</CardTitle>
            <Star className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {EXPORT_TEMPLATES.filter((t) => t.type === "both").length}
            </div>
            <p className="text-xs text-muted-foreground">Flexible exports</p>
          </CardContent>
        </Card>
      </div>

      {/* Export Templates */}
      <Card>
        <CardHeader>
          <CardTitle>Export Templates</CardTitle>
          <CardDescription>
            Select a template to export data in your preferred format
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {EXPORT_TEMPLATES.map((template) => (
              <Card
                key={template.id}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md hover:border-primary",
                  selectedTemplate?.id === template.id && "border-primary ring-2 ring-primary/20"
                )}
                onClick={() => handleSelectTemplate(template)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-primary/10 text-primary rounded-lg">
                      {template.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{template.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {template.description}
                      </p>
                      <div className="flex gap-2 mt-3">
                        {(template.type === "excel" || template.type === "both") && (
                          <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                            <FileSpreadsheet className="h-3 w-3 mr-1" />
                            XLSX
                          </Badge>
                        )}
                        {(template.type === "docx" || template.type === "both") && (
                          <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
                            <FileText className="h-3 w-3 mr-1" />
                            DOCX
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Export Configuration Dialog */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTemplate?.icon}
              Export {selectedTemplate?.name}
            </DialogTitle>
            <DialogDescription>
              Configure export options and select columns to include
            </DialogDescription>
          </DialogHeader>

          {selectedTemplate && (
            <Tabs defaultValue="format" className="mt-4">
              <TabsList>
                <TabsTrigger value="format">Format</TabsTrigger>
                <TabsTrigger value="columns">Columns</TabsTrigger>
                <TabsTrigger value="options">Options</TabsTrigger>
              </TabsList>

              <TabsContent value="format" className="space-y-4 mt-4">
                <div>
                  <Label>Export Format</Label>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    {(selectedTemplate.type === "excel" || selectedTemplate.type === "both") && (
                      <Card
                        className={cn(
                          "cursor-pointer p-4 transition-all",
                          exportFormat === "excel" && "border-primary ring-2 ring-primary/20"
                        )}
                        onClick={() => setExportFormat("excel")}
                      >
                        <div className="flex items-center gap-3">
                          <FileSpreadsheet className="h-8 w-8 text-green-600" />
                          <div>
                            <p className="font-medium">Excel (XLSX)</p>
                            <p className="text-sm text-muted-foreground">
                              Spreadsheet format with multiple sheets
                            </p>
                          </div>
                        </div>
                      </Card>
                    )}
                    {(selectedTemplate.type === "docx" || selectedTemplate.type === "both") && (
                      <Card
                        className={cn(
                          "cursor-pointer p-4 transition-all",
                          exportFormat === "docx" && "border-primary ring-2 ring-primary/20"
                        )}
                        onClick={() => setExportFormat("docx")}
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-8 w-8 text-blue-600" />
                          <div>
                            <p className="font-medium">Word (DOCX)</p>
                            <p className="text-sm text-muted-foreground">
                              Document format with tables
                            </p>
                          </div>
                        </div>
                      </Card>
                    )}
                  </div>
                </div>

                {selectedTemplate.dataSource === "plan_entries" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Start Date</Label>
                      <Input
                        type="date"
                        value={dateRange.start}
                        onChange={(e) =>
                          setDateRange({ ...dateRange, start: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label>End Date</Label>
                      <Input
                        type="date"
                        value={dateRange.end}
                        onChange={(e) =>
                          setDateRange({ ...dateRange, end: e.target.value })
                        }
                      />
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="columns" className="space-y-4 mt-4">
                {selectedTemplate.columns && selectedTemplate.columns.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-4">
                      <Label>Select columns to include</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (selectedColumns.size === selectedTemplate.columns!.length) {
                            setSelectedColumns(new Set());
                          } else {
                            setSelectedColumns(new Set(selectedTemplate.columns));
                          }
                        }}
                      >
                        {selectedColumns.size === selectedTemplate.columns.length
                          ? "Deselect All"
                          : "Select All"}
                      </Button>
                    </div>
                    {selectedTemplate.columns.map((column) => (
                      <div
                        key={column}
                        className="flex items-center gap-3 p-3 border rounded-lg"
                      >
                        <Checkbox
                          checked={selectedColumns.has(column)}
                          onCheckedChange={() => toggleColumn(column)}
                        />
                        <span className="capitalize">
                          {column.replace(/_/g, " ")}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    All available columns will be included
                  </p>
                )}
              </TabsContent>

              <TabsContent value="options" className="space-y-4 mt-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Include Headers</p>
                    <p className="text-sm text-muted-foreground">
                      Add column headers as the first row
                    </p>
                  </div>
                  <Checkbox
                    checked={includeHeaders}
                    onCheckedChange={(checked) => setIncludeHeaders(checked as boolean)}
                  />
                </div>

                {exportFormat === "excel" && (
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">Split by Category</p>
                      <p className="text-sm text-muted-foreground">
                        Create separate sheets for each category
                      </p>
                    </div>
                    <Checkbox
                      checked={splitBySheet}
                      onCheckedChange={(checked) => setSplitBySheet(checked as boolean)}
                    />
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}

          {isExporting && (
            <div className="space-y-2 py-4">
              <Progress value={exportProgress} />
              <p className="text-sm text-muted-foreground text-center">
                Exporting... {exportProgress}%
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={isExporting}>
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export {exportFormat.toUpperCase()}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
