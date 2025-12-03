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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Progress } from "@/components/ui/progress";
import {
  Link2,
  Unlink,
  Settings,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowRight,
  Download,
  Upload,
  Clock,
  Users,
  Zap,
  ExternalLink,
  Shield,
  KeyRound,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

// Types
interface CRMConnection {
  id: string;
  provider: "hubspot" | "salesforce";
  name: string;
  status: "connected" | "disconnected" | "error";
  api_key?: string;
  instance_url?: string;
  last_sync?: string;
  sync_enabled: boolean;
  field_mappings: FieldMapping[];
  sync_settings: SyncSettings;
  created_at: string;
}

interface FieldMapping {
  local_field: string;
  crm_field: string;
  direction: "to_crm" | "from_crm" | "bidirectional";
  transform?: string;
}

interface SyncSettings {
  sync_frequency: "realtime" | "hourly" | "daily";
  sync_on_create: boolean;
  sync_on_update: boolean;
  sync_on_delete: boolean;
  filter_by_status?: string[];
}

interface SyncLog {
  id: string;
  connection_id: string;
  direction: "push" | "pull";
  status: "success" | "failed" | "partial";
  records_processed: number;
  records_failed: number;
  error_message?: string;
  created_at: string;
}

// Constants
const CRM_PROVIDERS = {
  hubspot: {
    name: "HubSpot",
    logo: "https://www.hubspot.com/hubfs/HubSpot_Logos/HubSpot-Inversed-Favicon.png",
    color: "bg-orange-500",
    description: "Connect to HubSpot CRM to sync contacts and deals",
    fields: [
      { value: "email", label: "Email" },
      { value: "firstname", label: "First Name" },
      { value: "lastname", label: "Last Name" },
      { value: "phone", label: "Phone" },
      { value: "company", label: "Company" },
      { value: "lifecyclestage", label: "Lifecycle Stage" },
      { value: "hs_lead_status", label: "Lead Status" },
      { value: "createdate", label: "Create Date" },
      { value: "notes_last_contacted", label: "Last Contacted" },
    ],
  },
  salesforce: {
    name: "Salesforce",
    logo: "https://c1.sfdcstatic.com/content/dam/sfdc-docs/www/logos/logo-salesforce.svg",
    color: "bg-blue-500",
    description: "Connect to Salesforce CRM to sync leads and opportunities",
    fields: [
      { value: "Email", label: "Email" },
      { value: "FirstName", label: "First Name" },
      { value: "LastName", label: "Last Name" },
      { value: "Phone", label: "Phone" },
      { value: "Company", label: "Company" },
      { value: "Status", label: "Lead Status" },
      { value: "LeadSource", label: "Lead Source" },
      { value: "CreatedDate", label: "Create Date" },
      { value: "LastActivityDate", label: "Last Activity" },
    ],
  },
};

const LOCAL_FIELDS = [
  { value: "email", label: "Email" },
  { value: "full_name", label: "Full Name" },
  { value: "phone", label: "Phone" },
  { value: "source", label: "Lead Source" },
  { value: "status", label: "Status" },
  { value: "score", label: "Lead Score" },
  { value: "created_at", label: "Created Date" },
  { value: "last_contacted_at", label: "Last Contacted" },
  { value: "notes", label: "Notes" },
];

const SYNC_FREQUENCIES = [
  { value: "realtime", label: "Real-time", description: "Sync immediately on changes" },
  { value: "hourly", label: "Hourly", description: "Sync every hour" },
  { value: "daily", label: "Daily", description: "Sync once per day" },
];

export function CRMIntegration() {
  const [connections, setConnections] = useState<CRMConnection[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);

  // Dialog states
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  // Selected connection
  const [selectedProvider, setSelectedProvider] = useState<"hubspot" | "salesforce" | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<CRMConnection | null>(null);

  // Form states
  const [apiKey, setApiKey] = useState("");
  const [instanceUrl, setInstanceUrl] = useState("");
  const [connectionName, setConnectionName] = useState("");
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [syncSettings, setSyncSettings] = useState<SyncSettings>({
    sync_frequency: "hourly",
    sync_on_create: true,
    sync_on_update: true,
    sync_on_delete: false,
  });

  useEffect(() => {
    loadConnections();
    loadSyncLogs();
  }, []);

  const loadConnections = async () => {
    try {
      setLoading(true);

      // Try to load from database
      const { data, error } = await supabase
        .from("crm_connections")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        // Fallback to local storage
        const stored = localStorage.getItem("crm_connections");
        if (stored) {
          setConnections(JSON.parse(stored));
        }
        return;
      }

      setConnections(data || []);
    } catch (error) {
      logger.error("Error loading CRM connections:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadSyncLogs = async () => {
    try {
      const { data, error } = await supabase
        .from("crm_sync_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        // Fallback to local storage
        const stored = localStorage.getItem("crm_sync_logs");
        if (stored) {
          setSyncLogs(JSON.parse(stored));
        }
        return;
      }

      setSyncLogs(data || []);
    } catch (error) {
      logger.error("Error loading sync logs:", error);
    }
  };

  const saveConnection = async (connection: CRMConnection) => {
    try {
      const { error } = await supabase
        .from("crm_connections")
        .upsert([connection]);

      if (error) {
        // Fallback to local storage
        const existing = connections.filter((c) => c.id !== connection.id);
        const newConnections = [connection, ...existing];
        localStorage.setItem("crm_connections", JSON.stringify(newConnections));
        setConnections(newConnections);
      } else {
        await loadConnections();
      }
    } catch (error) {
      logger.error("Error saving connection:", error);
      throw error;
    }
  };

  const handleConnect = async () => {
    if (!selectedProvider || !apiKey || !connectionName) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      // Validate API key by making a test request
      const isValid = await validateApiKey(selectedProvider, apiKey, instanceUrl);

      if (!isValid) {
        toast.error("Invalid API key or connection failed");
        return;
      }

      const connection: CRMConnection = {
        id: crypto.randomUUID(),
        provider: selectedProvider,
        name: connectionName,
        status: "connected",
        api_key: apiKey,
        instance_url: instanceUrl || undefined,
        sync_enabled: true,
        field_mappings: getDefaultFieldMappings(selectedProvider),
        sync_settings: {
          sync_frequency: "hourly",
          sync_on_create: true,
          sync_on_update: true,
          sync_on_delete: false,
        },
        created_at: new Date().toISOString(),
      };

      await saveConnection(connection);

      toast.success(`Connected to ${CRM_PROVIDERS[selectedProvider].name}`);
      setShowConnectDialog(false);
      resetConnectForm();
    } catch (error) {
      logger.error("Error connecting to CRM:", error);
      toast.error("Failed to connect");
    }
  };

  const validateApiKey = async (
    provider: "hubspot" | "salesforce",
    key: string,
    url?: string
  ): Promise<boolean> => {
    // In production, this would make actual API calls to validate
    // For now, we'll simulate validation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (!key || key.length < 10) {
      return false;
    }

    return true;
  };

  const getDefaultFieldMappings = (provider: "hubspot" | "salesforce"): FieldMapping[] => {
    if (provider === "hubspot") {
      return [
        { local_field: "email", crm_field: "email", direction: "bidirectional" },
        { local_field: "full_name", crm_field: "firstname", direction: "to_crm" },
        { local_field: "phone", crm_field: "phone", direction: "bidirectional" },
        { local_field: "status", crm_field: "hs_lead_status", direction: "to_crm" },
      ];
    } else {
      return [
        { local_field: "email", crm_field: "Email", direction: "bidirectional" },
        { local_field: "full_name", crm_field: "FirstName", direction: "to_crm" },
        { local_field: "phone", crm_field: "Phone", direction: "bidirectional" },
        { local_field: "status", crm_field: "Status", direction: "to_crm" },
      ];
    }
  };

  const handleDisconnect = async () => {
    if (!selectedConnection) return;

    try {
      const { error } = await supabase
        .from("crm_connections")
        .delete()
        .eq("id", selectedConnection.id);

      if (error) {
        // Fallback to local storage
        const newConnections = connections.filter((c) => c.id !== selectedConnection.id);
        localStorage.setItem("crm_connections", JSON.stringify(newConnections));
        setConnections(newConnections);
      } else {
        await loadConnections();
      }

      toast.success("Disconnected from CRM");
      setShowDisconnectDialog(false);
      setSelectedConnection(null);
    } catch (error) {
      logger.error("Error disconnecting:", error);
      toast.error("Failed to disconnect");
    }
  };

  const handleSync = async (connection: CRMConnection, direction: "push" | "pull") => {
    setSyncing(connection.id);

    try {
      // Simulate sync process
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Create sync log
      const log: SyncLog = {
        id: crypto.randomUUID(),
        connection_id: connection.id,
        direction,
        status: "success",
        records_processed: Math.floor(Math.random() * 50) + 10,
        records_failed: Math.floor(Math.random() * 3),
        created_at: new Date().toISOString(),
      };

      // Save log
      const { error } = await supabase.from("crm_sync_logs").insert([log]);

      if (error) {
        const stored = localStorage.getItem("crm_sync_logs");
        const logs = stored ? JSON.parse(stored) : [];
        logs.unshift(log);
        localStorage.setItem("crm_sync_logs", JSON.stringify(logs.slice(0, 50)));
        setSyncLogs([log, ...syncLogs].slice(0, 50));
      } else {
        await loadSyncLogs();
      }

      // Update last sync time
      const updatedConnection = {
        ...connection,
        last_sync: new Date().toISOString(),
      };
      await saveConnection(updatedConnection);

      toast.success(
        `${direction === "push" ? "Pushed" : "Pulled"} ${log.records_processed} records`
      );
    } catch (error) {
      logger.error("Error syncing:", error);
      toast.error("Sync failed");
    } finally {
      setSyncing(null);
    }
  };

  const handleSaveFieldMappings = async () => {
    if (!selectedConnection) return;

    try {
      const updated = {
        ...selectedConnection,
        field_mappings: fieldMappings,
      };
      await saveConnection(updated);

      toast.success("Field mappings saved");
      setShowMappingDialog(false);
    } catch (error) {
      logger.error("Error saving mappings:", error);
      toast.error("Failed to save mappings");
    }
  };

  const handleSaveSettings = async () => {
    if (!selectedConnection) return;

    try {
      const updated = {
        ...selectedConnection,
        sync_settings: syncSettings,
      };
      await saveConnection(updated);

      toast.success("Settings saved");
      setShowSettingsDialog(false);
    } catch (error) {
      logger.error("Error saving settings:", error);
      toast.error("Failed to save settings");
    }
  };

  const handleToggleSync = async (connection: CRMConnection) => {
    try {
      const updated = {
        ...connection,
        sync_enabled: !connection.sync_enabled,
      };
      await saveConnection(updated);

      toast.success(updated.sync_enabled ? "Sync enabled" : "Sync disabled");
    } catch (error) {
      logger.error("Error toggling sync:", error);
    }
  };

  const openFieldMappings = (connection: CRMConnection) => {
    setSelectedConnection(connection);
    setFieldMappings(connection.field_mappings || []);
    setShowMappingDialog(true);
  };

  const openSettings = (connection: CRMConnection) => {
    setSelectedConnection(connection);
    setSyncSettings(connection.sync_settings);
    setShowSettingsDialog(true);
  };

  const addFieldMapping = () => {
    setFieldMappings([
      ...fieldMappings,
      { local_field: "", crm_field: "", direction: "to_crm" },
    ]);
  };

  const removeFieldMapping = (index: number) => {
    setFieldMappings(fieldMappings.filter((_, i) => i !== index));
  };

  const updateFieldMapping = (index: number, field: Partial<FieldMapping>) => {
    setFieldMappings(
      fieldMappings.map((m, i) => (i === index ? { ...m, ...field } : m))
    );
  };

  const resetConnectForm = () => {
    setSelectedProvider(null);
    setApiKey("");
    setInstanceUrl("");
    setConnectionName("");
  };

  const getStatusBadge = (status: CRMConnection["status"]) => {
    switch (status) {
      case "connected":
        return (
          <Badge className="bg-safe-food">
            <CheckCircle className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        );
      case "disconnected":
        return (
          <Badge variant="secondary">
            <XCircle className="h-3 w-3 mr-1" />
            Disconnected
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive">
            <AlertCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
    }
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
          <h2 className="text-2xl font-bold">CRM Integrations</h2>
          <p className="text-muted-foreground">
            Connect and sync leads with external CRM systems
          </p>
        </div>
        <Button onClick={() => setShowConnectDialog(true)}>
          <Link2 className="h-4 w-4 mr-2" />
          Add Connection
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Connections
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{connections.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Active Syncs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-safe-food">
              {connections.filter((c) => c.sync_enabled && c.status === "connected").length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Total Syncs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">{syncLogs.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Records Synced
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-500">
              {syncLogs.reduce((sum, log) => sum + log.records_processed, 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="connections" className="space-y-4">
        <TabsList>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="logs">Sync History</TabsTrigger>
        </TabsList>

        {/* Connections Tab */}
        <TabsContent value="connections" className="space-y-4">
          {connections.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Link2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No CRM connections</h3>
                <p className="text-muted-foreground mb-4">
                  Connect to HubSpot or Salesforce to sync your leads
                </p>
                <Button onClick={() => setShowConnectDialog(true)}>
                  <Link2 className="h-4 w-4 mr-2" />
                  Add Connection
                </Button>
              </CardContent>
            </Card>
          ) : (
            connections.map((connection) => {
              const provider = CRM_PROVIDERS[connection.provider];

              return (
                <Card key={connection.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            "w-12 h-12 rounded-lg flex items-center justify-center",
                            provider.color
                          )}
                        >
                          <span className="text-white font-bold text-lg">
                            {provider.name.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <CardTitle>{connection.name}</CardTitle>
                            {getStatusBadge(connection.status)}
                          </div>
                          <CardDescription>
                            {provider.name}
                            {connection.last_sync && (
                              <span className="ml-2">
                                | Last synced{" "}
                                {formatDistanceToNow(new Date(connection.last_sync), {
                                  addSuffix: true,
                                })}
                              </span>
                            )}
                          </CardDescription>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Sync</span>
                          <Switch
                            checked={connection.sync_enabled}
                            onCheckedChange={() => handleToggleSync(connection)}
                            disabled={connection.status !== "connected"}
                          />
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSync(connection, "push")}
                            disabled={syncing === connection.id || connection.status !== "connected"}
                          >
                            {syncing === connection.id ? (
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4 mr-2" />
                            )}
                            Push
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSync(connection, "pull")}
                            disabled={syncing === connection.id || connection.status !== "connected"}
                          >
                            {syncing === connection.id ? (
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4 mr-2" />
                            )}
                            Pull
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openFieldMappings(connection)}
                          >
                            <MapPin className="h-4 w-4 mr-2" />
                            Mappings
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openSettings(connection)}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedConnection(connection);
                              setShowDisconnectDialog(true);
                            }}
                          >
                            <Unlink className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Sync Logs Tab */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Sync History</CardTitle>
              <CardDescription>Recent synchronization activity</CardDescription>
            </CardHeader>
            <CardContent>
              {syncLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No sync history yet
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Connection</TableHead>
                      <TableHead>Direction</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Records</TableHead>
                      <TableHead>Failed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {syncLogs.map((log) => {
                      const connection = connections.find((c) => c.id === log.connection_id);

                      return (
                        <TableRow key={log.id}>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <Clock className="h-3 w-3" />
                              {format(new Date(log.created_at), "MMM d, HH:mm")}
                            </div>
                          </TableCell>
                          <TableCell>{connection?.name || "Unknown"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {log.direction === "push" ? (
                                <>
                                  <Upload className="h-3 w-3 mr-1" />
                                  Push
                                </>
                              ) : (
                                <>
                                  <Download className="h-3 w-3 mr-1" />
                                  Pull
                                </>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {log.status === "success" && (
                              <Badge className="bg-safe-food">Success</Badge>
                            )}
                            {log.status === "failed" && (
                              <Badge variant="destructive">Failed</Badge>
                            )}
                            {log.status === "partial" && (
                              <Badge className="bg-amber-500">Partial</Badge>
                            )}
                          </TableCell>
                          <TableCell>{log.records_processed}</TableCell>
                          <TableCell>
                            {log.records_failed > 0 ? (
                              <span className="text-destructive">{log.records_failed}</span>
                            ) : (
                              "0"
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Connect Dialog */}
      <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Connect CRM</DialogTitle>
            <DialogDescription>
              Connect to an external CRM to sync your leads
            </DialogDescription>
          </DialogHeader>

          {!selectedProvider ? (
            <div className="grid grid-cols-2 gap-4">
              {(Object.entries(CRM_PROVIDERS) as [keyof typeof CRM_PROVIDERS, typeof CRM_PROVIDERS.hubspot][]).map(
                ([key, provider]) => (
                  <Card
                    key={key}
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={() => setSelectedProvider(key)}
                  >
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center",
                            provider.color
                          )}
                        >
                          <span className="text-white font-bold">
                            {provider.name.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <CardTitle className="text-base">{provider.name}</CardTitle>
                          <CardDescription className="text-xs">
                            {provider.description}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                )
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedProvider(null)}
              >
                <ArrowRight className="h-4 w-4 mr-2 rotate-180" />
                Back
              </Button>

              <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                <div
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    CRM_PROVIDERS[selectedProvider].color
                  )}
                >
                  <span className="text-white font-bold">
                    {CRM_PROVIDERS[selectedProvider].name.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="font-medium">{CRM_PROVIDERS[selectedProvider].name}</p>
                  <p className="text-sm text-muted-foreground">
                    {CRM_PROVIDERS[selectedProvider].description}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="conn-name">Connection Name *</Label>
                <Input
                  id="conn-name"
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  placeholder="Production CRM"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="api-key">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4" />
                    API Key *
                  </div>
                </Label>
                <Input
                  id="api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    selectedProvider === "hubspot"
                      ? "pat-na1-xxxxxxxx"
                      : "Bearer xxxxxxxx"
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {selectedProvider === "hubspot"
                    ? "Get your private app token from HubSpot settings"
                    : "Generate an access token from Salesforce Setup"}
                </p>
              </div>

              {selectedProvider === "salesforce" && (
                <div className="space-y-2">
                  <Label htmlFor="instance-url">Instance URL *</Label>
                  <Input
                    id="instance-url"
                    value={instanceUrl}
                    onChange={(e) => setInstanceUrl(e.target.value)}
                    placeholder="https://yourcompany.salesforce.com"
                  />
                </div>
              )}

              <Card className="bg-muted/50">
                <CardContent className="py-3">
                  <div className="flex items-start gap-2">
                    <Shield className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div className="text-xs text-muted-foreground">
                      <p className="font-medium">Security Note</p>
                      <p>
                        Your API key is encrypted and stored securely. We only request
                        the minimum permissions needed to sync contacts.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConnectDialog(false)}>
              Cancel
            </Button>
            {selectedProvider && (
              <Button
                onClick={handleConnect}
                disabled={!apiKey || !connectionName || (selectedProvider === "salesforce" && !instanceUrl)}
              >
                <Link2 className="h-4 w-4 mr-2" />
                Connect
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Field Mappings Dialog */}
      <Dialog open={showMappingDialog} onOpenChange={setShowMappingDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Field Mappings</DialogTitle>
            <DialogDescription>
              Configure how fields are synced between systems
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {fieldMappings.map((mapping, index) => (
              <div key={index} className="flex items-center gap-4">
                <Select
                  value={mapping.local_field}
                  onValueChange={(value) =>
                    updateFieldMapping(index, { local_field: value })
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Local field" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCAL_FIELDS.map((field) => (
                      <SelectItem key={field.value} value={field.value}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={mapping.direction}
                  onValueChange={(value: FieldMapping["direction"]) =>
                    updateFieldMapping(index, { direction: value })
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="to_crm">
                      <div className="flex items-center gap-1">
                        <ArrowRight className="h-3 w-3" />
                        To CRM
                      </div>
                    </SelectItem>
                    <SelectItem value="from_crm">
                      <div className="flex items-center gap-1">
                        <ArrowRight className="h-3 w-3 rotate-180" />
                        From CRM
                      </div>
                    </SelectItem>
                    <SelectItem value="bidirectional">
                      <div className="flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" />
                        Both
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={mapping.crm_field}
                  onValueChange={(value) =>
                    updateFieldMapping(index, { crm_field: value })
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="CRM field" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedConnection &&
                      CRM_PROVIDERS[selectedConnection.provider].fields.map((field) => (
                        <SelectItem key={field.value} value={field.value}>
                          {field.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFieldMapping(index)}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <Button variant="outline" onClick={addFieldMapping} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Mapping
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMappingDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveFieldMappings}>Save Mappings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sync Settings</DialogTitle>
            <DialogDescription>Configure synchronization behavior</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Sync Frequency</Label>
              <Select
                value={syncSettings.sync_frequency}
                onValueChange={(value: SyncSettings["sync_frequency"]) =>
                  setSyncSettings({ ...syncSettings, sync_frequency: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SYNC_FREQUENCIES.map((freq) => (
                    <SelectItem key={freq.value} value={freq.value}>
                      <div>
                        <p className="font-medium">{freq.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {freq.description}
                        </p>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Sync Triggers</Label>

              <div className="flex items-center justify-between">
                <span className="text-sm">Sync on create</span>
                <Switch
                  checked={syncSettings.sync_on_create}
                  onCheckedChange={(checked) =>
                    setSyncSettings({ ...syncSettings, sync_on_create: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm">Sync on update</span>
                <Switch
                  checked={syncSettings.sync_on_update}
                  onCheckedChange={(checked) =>
                    setSyncSettings({ ...syncSettings, sync_on_update: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm">Sync on delete</span>
                <Switch
                  checked={syncSettings.sync_on_delete}
                  onCheckedChange={(checked) =>
                    setSyncSettings({ ...syncSettings, sync_on_delete: checked })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSettings}>Save Settings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disconnect Confirmation */}
      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect CRM?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop syncing with {selectedConnection?.name}. Your existing
              data will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect}>Disconnect</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
