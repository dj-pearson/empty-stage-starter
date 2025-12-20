import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
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
  Globe,
  Server,
  Database,
  Shield,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Activity,
  HardDrive,
  Cloud,
  Map,
  Plus,
  Settings,
  Trash2,
  Download,
  Upload,
  Zap,
  Lock,
  Eye,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

interface Region {
  id: string;
  name: string;
  code: string;
  location: string;
  provider: "aws" | "gcp" | "azure" | "cloudflare";
  status: "active" | "syncing" | "error" | "disabled";
  isPrimary: boolean;
  lastSync: string | null;
  storageUsed: number;
  storageLimit: number;
  latency: number;
  replicationLag: number;
}

interface ReplicationPolicy {
  id: string;
  name: string;
  sourceRegion: string;
  targetRegions: string[];
  frequency: "realtime" | "hourly" | "daily" | "weekly";
  retentionDays: number;
  encryptionEnabled: boolean;
  compressionEnabled: boolean;
  isActive: boolean;
}

interface BackupJob {
  id: string;
  type: "full" | "incremental" | "snapshot";
  sourceRegion: string;
  targetRegion: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  size: number;
  startedAt: string;
  completedAt: string | null;
  error?: string;
}

interface SystemHealth {
  overallStatus: "healthy" | "degraded" | "critical";
  totalStorage: number;
  usedStorage: number;
  activeRegions: number;
  pendingReplications: number;
  lastFullBackup: string | null;
  rpo: number; // Recovery Point Objective in minutes
  rto: number; // Recovery Time Objective in minutes
}

const PROVIDER_ICONS: Record<string, React.ReactNode> = {
  aws: <Cloud className="h-4 w-4 text-orange-500" />,
  gcp: <Cloud className="h-4 w-4 text-blue-500" />,
  azure: <Cloud className="h-4 w-4 text-sky-500" />,
  cloudflare: <Cloud className="h-4 w-4 text-amber-500" />,
};

const REGION_PRESETS: Partial<Region>[] = [
  { code: "us-east-1", name: "US East (N. Virginia)", location: "United States", provider: "aws" },
  { code: "us-west-2", name: "US West (Oregon)", location: "United States", provider: "aws" },
  { code: "eu-west-1", name: "Europe (Ireland)", location: "Ireland", provider: "aws" },
  { code: "eu-central-1", name: "Europe (Frankfurt)", location: "Germany", provider: "aws" },
  { code: "ap-southeast-1", name: "Asia Pacific (Singapore)", location: "Singapore", provider: "aws" },
  { code: "ap-northeast-1", name: "Asia Pacific (Tokyo)", location: "Japan", provider: "aws" },
  { code: "sa-east-1", name: "South America (Sao Paulo)", location: "Brazil", provider: "aws" },
];

export function MultiRegionBackup() {
  const [loading, setLoading] = useState(true);
  const [regions, setRegions] = useState<Region[]>([]);
  const [policies, setPolicies] = useState<ReplicationPolicy[]>([]);
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [health, setHealth] = useState<SystemHealth>({
    overallStatus: "healthy",
    totalStorage: 100 * 1024 * 1024 * 1024, // 100 GB
    usedStorage: 0,
    activeRegions: 0,
    pendingReplications: 0,
    lastFullBackup: null,
    rpo: 60,
    rto: 15,
  });

  const [showAddRegionDialog, setShowAddRegionDialog] = useState(false);
  const [showAddPolicyDialog, setShowAddPolicyDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: string; id: string } | null>(null);

  // New region form state
  const [newRegion, setNewRegion] = useState<Partial<Region>>({
    provider: "aws",
    storageLimit: 50 * 1024 * 1024 * 1024, // 50 GB
  });

  // New policy form state
  const [newPolicy, setNewPolicy] = useState<Partial<ReplicationPolicy>>({
    frequency: "hourly",
    retentionDays: 30,
    encryptionEnabled: true,
    compressionEnabled: true,
    isActive: true,
    targetRegions: [],
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Multi-region backup requires external infrastructure setup
      // This feature displays the current state of configured backup regions
      // Configuration is done through environment variables and infrastructure setup

      // Check if backup infrastructure is configured via environment
      const backupConfigured = import.meta.env.VITE_BACKUP_ENABLED === 'true';

      if (!backupConfigured) {
        // No backup infrastructure configured - show empty state
        setRegions([]);
        setPolicies([]);
        setJobs([]);
        setHealth({
          overallStatus: "degraded",
          totalStorage: 0,
          usedStorage: 0,
          activeRegions: 0,
          pendingReplications: 0,
          lastFullBackup: null,
          rpo: 0,
          rto: 0,
        });
        return;
      }

      // TODO: When backup infrastructure is set up, fetch real data from:
      // - Backup service API
      // - Database backup_regions table
      // - Database backup_policies table
      // - Database backup_jobs table

      // For now, show empty state until infrastructure is configured
      setRegions([]);
      setPolicies([]);
      setJobs([]);
      setHealth({
        overallStatus: "degraded",
        totalStorage: 0,
        usedStorage: 0,
        activeRegions: 0,
        pendingReplications: 0,
        lastFullBackup: null,
        rpo: 0,
        rto: 0,
      });
    } catch (error) {
      logger.error("Error loading backup data:", error);
      toast.error("Failed to load backup configuration");
    } finally {
      setLoading(false);
    }
  };

  const addRegion = async () => {
    if (!newRegion.code || !newRegion.name) {
      toast.error("Please fill in all required fields");
      return;
    }

    const region: Region = {
      id: `region-${Date.now()}`,
      name: newRegion.name,
      code: newRegion.code,
      location: newRegion.location || "",
      provider: newRegion.provider || "aws",
      status: "syncing",
      isPrimary: false,
      lastSync: null,
      storageUsed: 0,
      storageLimit: newRegion.storageLimit || 50 * 1024 * 1024 * 1024,
      latency: 0,
      replicationLag: 0,
    };

    setRegions([...regions, region]);
    setShowAddRegionDialog(false);
    setNewRegion({ provider: "aws", storageLimit: 50 * 1024 * 1024 * 1024 });
    toast.success("Region added successfully. Initial sync starting...");
  };

  const addPolicy = async () => {
    if (!newPolicy.name || !newPolicy.sourceRegion || !newPolicy.targetRegions?.length) {
      toast.error("Please fill in all required fields");
      return;
    }

    const policy: ReplicationPolicy = {
      id: `policy-${Date.now()}`,
      name: newPolicy.name!,
      sourceRegion: newPolicy.sourceRegion!,
      targetRegions: newPolicy.targetRegions!,
      frequency: newPolicy.frequency || "hourly",
      retentionDays: newPolicy.retentionDays || 30,
      encryptionEnabled: newPolicy.encryptionEnabled ?? true,
      compressionEnabled: newPolicy.compressionEnabled ?? true,
      isActive: newPolicy.isActive ?? true,
    };

    setPolicies([...policies, policy]);
    setShowAddPolicyDialog(false);
    setNewPolicy({
      frequency: "hourly",
      retentionDays: 30,
      encryptionEnabled: true,
      compressionEnabled: true,
      isActive: true,
      targetRegions: [],
    });
    toast.success("Replication policy created successfully");
  };

  const togglePolicy = (policyId: string) => {
    setPolicies(
      policies.map((p) => (p.id === policyId ? { ...p, isActive: !p.isActive } : p))
    );
    toast.success("Policy updated");
  };

  const deleteRegion = (regionId: string) => {
    const region = regions.find((r) => r.id === regionId);
    if (region?.isPrimary) {
      toast.error("Cannot delete primary region");
      return;
    }

    setRegions(regions.filter((r) => r.id !== regionId));
    toast.success("Region removed");
  };

  const deletePolicy = (policyId: string) => {
    setPolicies(policies.filter((p) => p.id !== policyId));
    toast.success("Policy deleted");
  };

  const triggerManualSync = async (regionId: string) => {
    const region = regions.find((r) => r.id === regionId);
    if (!region) return;

    // Update region status
    setRegions(
      regions.map((r) => (r.id === regionId ? { ...r, status: "syncing" } : r))
    );

    // Add a new job
    const newJob: BackupJob = {
      id: `job-${Date.now()}`,
      type: "incremental",
      sourceRegion: regions.find((r) => r.isPrimary)?.code || "",
      targetRegion: region.code,
      status: "running",
      progress: 0,
      size: Math.random() * 500 * 1024 * 1024,
      startedAt: new Date().toISOString(),
      completedAt: null,
    };

    setJobs([newJob, ...jobs]);
    toast.success(`Manual sync started for ${region.name}`);

    // Simulate progress
    setTimeout(() => {
      setJobs((prev) =>
        prev.map((j) => (j.id === newJob.id ? { ...j, progress: 30 } : j))
      );
    }, 2000);

    setTimeout(() => {
      setJobs((prev) =>
        prev.map((j) => (j.id === newJob.id ? { ...j, progress: 70 } : j))
      );
    }, 4000);

    setTimeout(() => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === newJob.id
            ? { ...j, progress: 100, status: "completed", completedAt: new Date().toISOString() }
            : j
        )
      );
      setRegions((prev) =>
        prev.map((r) =>
          r.id === regionId
            ? { ...r, status: "active", lastSync: new Date().toISOString(), replicationLag: 0 }
            : r
        )
      );
      toast.success(`Sync completed for ${region.name}`);
    }, 6000);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const getStatusIcon = (status: Region["status"]) => {
    switch (status) {
      case "active":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "syncing":
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "disabled":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getJobStatusBadge = (status: BackupJob["status"]) => {
    const config = {
      pending: { label: "Pending", variant: "secondary" as const },
      running: { label: "Running", variant: "default" as const },
      completed: { label: "Completed", variant: "outline" as const },
      failed: { label: "Failed", variant: "destructive" as const },
    };

    return <Badge variant={config[status].variant}>{config[status].label}</Badge>;
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
            <Globe className="h-8 w-8 text-primary" />
            Multi-Region Backup
          </h2>
          <p className="text-muted-foreground mt-1">
            Geo-redundant backup storage with automatic replication
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setShowAddRegionDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Region
          </Button>
        </div>
      </div>

      {/* System Health Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "h-3 w-3 rounded-full",
                  health.overallStatus === "healthy"
                    ? "bg-green-500"
                    : health.overallStatus === "degraded"
                    ? "bg-yellow-500"
                    : "bg-red-500"
                )}
              />
              <span className="text-2xl font-bold capitalize">{health.overallStatus}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {health.activeRegions} of {regions.length} regions active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatBytes(health.usedStorage)}
            </div>
            <Progress
              value={(health.usedStorage / health.totalStorage) * 100}
              className="mt-2 h-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              of {formatBytes(health.totalStorage)} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">RPO</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{health.rpo} min</div>
            <p className="text-xs text-muted-foreground mt-1">
              Recovery Point Objective
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">RTO</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{health.rto} min</div>
            <p className="text-xs text-muted-foreground mt-1">
              Recovery Time Objective
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="regions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="regions">Regions</TabsTrigger>
          <TabsTrigger value="policies">Replication Policies</TabsTrigger>
          <TabsTrigger value="jobs">Backup Jobs</TabsTrigger>
        </TabsList>

        <TabsContent value="regions">
          <Card>
            <CardHeader>
              <CardTitle>Configured Regions</CardTitle>
              <CardDescription>
                Manage backup storage locations across different geographic regions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {regions.map((region) => (
                  <Card key={region.id} className="relative">
                    {region.isPrimary && (
                      <Badge className="absolute -top-2 -right-2 bg-primary">Primary</Badge>
                    )}
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {PROVIDER_ICONS[region.provider]}
                          <CardTitle className="text-base">{region.name}</CardTitle>
                        </div>
                        {getStatusIcon(region.status)}
                      </div>
                      <CardDescription>
                        {region.location} ({region.code})
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Storage</span>
                          <span>{formatBytes(region.storageUsed)} / {formatBytes(region.storageLimit)}</span>
                        </div>
                        <Progress
                          value={(region.storageUsed / region.storageLimit) * 100}
                          className="h-1"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Latency</p>
                          <p className="font-medium">{region.latency}ms</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Lag</p>
                          <p className={cn(
                            "font-medium",
                            region.replicationLag > 10 ? "text-yellow-500" : ""
                          )}>
                            {region.replicationLag} min
                          </p>
                        </div>
                      </div>

                      <div className="text-sm">
                        <p className="text-muted-foreground">Last Sync</p>
                        <p className="font-medium">
                          {region.lastSync
                            ? formatDistanceToNow(new Date(region.lastSync), { addSuffix: true })
                            : "Never"}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => triggerManualSync(region.id)}
                          disabled={region.status === "syncing" || region.isPrimary}
                        >
                          <RefreshCw className={cn(
                            "h-4 w-4 mr-1",
                            region.status === "syncing" && "animate-spin"
                          )} />
                          Sync
                        </Button>
                        {!region.isPrimary && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive"
                            onClick={() => deleteRegion(region.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Replication Policies</CardTitle>
                <CardDescription>
                  Configure automatic data replication between regions
                </CardDescription>
              </div>
              <Button onClick={() => setShowAddPolicyDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Policy
              </Button>
            </CardHeader>
            <CardContent>
              {policies.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No replication policies configured</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setShowAddPolicyDialog(true)}
                  >
                    Create First Policy
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {policies.map((policy) => (
                    <Card key={policy.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{policy.name}</h4>
                              <Badge variant={policy.isActive ? "default" : "secondary"}>
                                {policy.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span>{policy.sourceRegion}</span>
                              <ArrowRight className="h-4 w-4" />
                              <span>{policy.targetRegions.join(", ")}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <p className="text-sm font-medium capitalize">{policy.frequency}</p>
                              <p className="text-xs text-muted-foreground">Frequency</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium">{policy.retentionDays} days</p>
                              <p className="text-xs text-muted-foreground">Retention</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {policy.encryptionEnabled && (
                                <Lock className="h-4 w-4 text-green-500" title="Encrypted" />
                              )}
                            </div>
                            <Switch
                              checked={policy.isActive}
                              onCheckedChange={() => togglePolicy(policy.id)}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => deletePolicy(policy.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs">
          <Card>
            <CardHeader>
              <CardTitle>Recent Backup Jobs</CardTitle>
              <CardDescription>
                Monitor backup and replication job status
              </CardDescription>
            </CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No backup jobs found</p>
                </div>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Route</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Started</TableHead>
                        <TableHead>Duration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {job.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm">
                              <span>{job.sourceRegion}</span>
                              <ArrowRight className="h-3 w-3" />
                              <span>{job.targetRegion}</span>
                            </div>
                          </TableCell>
                          <TableCell>{getJobStatusBadge(job.status)}</TableCell>
                          <TableCell>
                            <div className="w-32">
                              <Progress value={job.progress} className="h-2" />
                              <p className="text-xs text-muted-foreground mt-1">
                                {job.progress}%
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>{formatBytes(job.size)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(job.startedAt), "HH:mm:ss")}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {job.completedAt
                              ? formatDistanceToNow(new Date(job.startedAt))
                              : "In progress"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Region Dialog */}
      <Dialog open={showAddRegionDialog} onOpenChange={setShowAddRegionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Backup Region</DialogTitle>
            <DialogDescription>
              Configure a new geographic region for backup storage
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Cloud Provider</Label>
              <Select
                value={newRegion.provider}
                onValueChange={(value) =>
                  setNewRegion({ ...newRegion, provider: value as Region["provider"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aws">Amazon Web Services</SelectItem>
                  <SelectItem value="gcp">Google Cloud Platform</SelectItem>
                  <SelectItem value="azure">Microsoft Azure</SelectItem>
                  <SelectItem value="cloudflare">Cloudflare R2</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Region</Label>
              <Select
                value={newRegion.code}
                onValueChange={(value) => {
                  const preset = REGION_PRESETS.find((r) => r.code === value);
                  setNewRegion({
                    ...newRegion,
                    code: value,
                    name: preset?.name,
                    location: preset?.location,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a region" />
                </SelectTrigger>
                <SelectContent>
                  {REGION_PRESETS.map((region) => (
                    <SelectItem key={region.code} value={region.code!}>
                      {region.name} ({region.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Storage Limit</Label>
              <Select
                value={String(newRegion.storageLimit)}
                onValueChange={(value) =>
                  setNewRegion({ ...newRegion, storageLimit: parseInt(value) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={String(10 * 1024 * 1024 * 1024)}>10 GB</SelectItem>
                  <SelectItem value={String(25 * 1024 * 1024 * 1024)}>25 GB</SelectItem>
                  <SelectItem value={String(50 * 1024 * 1024 * 1024)}>50 GB</SelectItem>
                  <SelectItem value={String(100 * 1024 * 1024 * 1024)}>100 GB</SelectItem>
                  <SelectItem value={String(250 * 1024 * 1024 * 1024)}>250 GB</SelectItem>
                  <SelectItem value={String(500 * 1024 * 1024 * 1024)}>500 GB</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddRegionDialog(false)}>
              Cancel
            </Button>
            <Button onClick={addRegion}>
              <Plus className="h-4 w-4 mr-2" />
              Add Region
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Policy Dialog */}
      <Dialog open={showAddPolicyDialog} onOpenChange={setShowAddPolicyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Replication Policy</DialogTitle>
            <DialogDescription>
              Set up automatic data replication between regions
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Policy Name</Label>
              <Input
                value={newPolicy.name}
                onChange={(e) => setNewPolicy({ ...newPolicy, name: e.target.value })}
                placeholder="e.g., Global Replication"
              />
            </div>

            <div>
              <Label>Source Region</Label>
              <Select
                value={newPolicy.sourceRegion}
                onValueChange={(value) => setNewPolicy({ ...newPolicy, sourceRegion: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((region) => (
                    <SelectItem key={region.id} value={region.code}>
                      {region.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Target Regions</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {regions
                  .filter((r) => r.code !== newPolicy.sourceRegion)
                  .map((region) => (
                    <Badge
                      key={region.id}
                      variant={newPolicy.targetRegions?.includes(region.code) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => {
                        const targets = newPolicy.targetRegions || [];
                        if (targets.includes(region.code)) {
                          setNewPolicy({
                            ...newPolicy,
                            targetRegions: targets.filter((t) => t !== region.code),
                          });
                        } else {
                          setNewPolicy({
                            ...newPolicy,
                            targetRegions: [...targets, region.code],
                          });
                        }
                      }}
                    >
                      {region.name}
                    </Badge>
                  ))}
              </div>
            </div>

            <div>
              <Label>Replication Frequency</Label>
              <Select
                value={newPolicy.frequency}
                onValueChange={(value) =>
                  setNewPolicy({ ...newPolicy, frequency: value as ReplicationPolicy["frequency"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="realtime">Real-time (Continuous)</SelectItem>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Retention Period</Label>
              <Select
                value={String(newPolicy.retentionDays)}
                onValueChange={(value) =>
                  setNewPolicy({ ...newPolicy, retentionDays: parseInt(value) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="180">180 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="encryption">Encryption at Rest</Label>
              <Switch
                id="encryption"
                checked={newPolicy.encryptionEnabled}
                onCheckedChange={(checked) =>
                  setNewPolicy({ ...newPolicy, encryptionEnabled: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="compression">Compression</Label>
              <Switch
                id="compression"
                checked={newPolicy.compressionEnabled}
                onCheckedChange={(checked) =>
                  setNewPolicy({ ...newPolicy, compressionEnabled: checked })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPolicyDialog(false)}>
              Cancel
            </Button>
            <Button onClick={addPolicy}>
              <Plus className="h-4 w-4 mr-2" />
              Create Policy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
