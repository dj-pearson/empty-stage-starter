import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, History, Settings, Calendar } from "lucide-react";
import {
  createBackup,
  getBackupConfig,
  getBackupHistory,
  updateBackupConfig,
  formatBytes,
  formatBackupStatus,
  type BackupConfig,
  type BackupLog,
} from "@/lib/backup";
import { toast } from "sonner";

export function BackupSettings() {
  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [history, setHistory] = useState<BackupLog[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    const [configData, historyData] = await Promise.all([
      getBackupConfig(),
      getBackupHistory(5),
    ]);
    setConfig(configData);
    setHistory(historyData);
    setIsLoading(false);
  };

  const handleCreateBackup = async () => {
    setIsCreating(true);
    const result = await createBackup(true);
    setIsCreating(false);

    if (result.success) {
      // Reload history to show new backup
      const historyData = await getBackupHistory(5);
      setHistory(historyData);
    }
  };

  const handleUpdateConfig = async (updates: Partial<BackupConfig>) => {
    if (!config) return;

    const newConfig = { ...config, ...updates };
    setConfig(newConfig);

    const success = await updateBackupConfig(updates);
    if (success) {
      loadData(); // Reload to get updated next_backup_at
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">Loading backup settings...</div>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          Failed to load backup settings
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Backup Actions */}
      <Card className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Download className="w-5 h-5" />
              Data Backup & Export
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Download a complete copy of your EatPal data
            </p>
          </div>
          <Button onClick={handleCreateBackup} disabled={isCreating}>
            {isCreating ? "Creating..." : "Create Backup"}
          </Button>
        </div>

        {config.last_backup_at && (
          <div className="text-sm text-muted-foreground">
            Last backup:{" "}
            {new Date(config.last_backup_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
      </Card>

      {/* Automatic Backup Settings */}
      <Card className="p-6">
        <div className="flex items-start gap-3 mb-6">
          <Settings className="w-5 h-5 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold">Automatic Backup Settings</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Configure automated backups to protect your data
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Enable/Disable */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="backup-enabled" className="text-base">
                Enable Automatic Backups
              </Label>
              <p className="text-sm text-muted-foreground">
                Automatically backup your data on a schedule
              </p>
            </div>
            <Switch
              id="backup-enabled"
              checked={config.enabled}
              onCheckedChange={(checked) => handleUpdateConfig({ enabled: checked })}
            />
          </div>

          {/* Frequency */}
          <div className="space-y-2">
            <Label htmlFor="backup-frequency">Backup Frequency</Label>
            <Select
              value={config.frequency}
              onValueChange={(value) => handleUpdateConfig({ frequency: value })}
              disabled={!config.enabled}
            >
              <SelectTrigger id="backup-frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
            {config.next_backup_at && config.enabled && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Next backup:{" "}
                {new Date(config.next_backup_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>

          {/* Retention */}
          <div className="space-y-2">
            <Label htmlFor="backup-retention">Retention Period (days)</Label>
            <Select
              value={config.retention_days.toString()}
              onValueChange={(value) =>
                handleUpdateConfig({ retention_days: parseInt(value) })
              }
              disabled={!config.enabled}
            >
              <SelectTrigger id="backup-retention">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Backups older than this will be automatically deleted
            </p>
          </div>

          {/* Email Notifications */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="backup-email" className="text-base">
                Email Notifications
              </Label>
              <p className="text-sm text-muted-foreground">
                Receive email confirmations when backups complete
              </p>
            </div>
            <Switch
              id="backup-email"
              checked={config.email_notifications}
              onCheckedChange={(checked) =>
                handleUpdateConfig({ email_notifications: checked })
              }
              disabled={!config.enabled}
            />
          </div>
        </div>
      </Card>

      {/* Backup History */}
      <Card className="p-6">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowHistory(!showHistory)}
        >
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <History className="w-5 h-5" />
            Backup History
          </h3>
          <Button variant="ghost" size="sm">
            {showHistory ? "Hide" : "Show"}
          </Button>
        </div>

        {showHistory && (
          <div className="mt-4 space-y-3">
            {history.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No backups yet
              </div>
            ) : (
              history.map((backup) => {
                const status = formatBackupStatus(backup.status);
                return (
                  <div
                    key={backup.id}
                    className="flex items-start justify-between p-4 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`${status.color} font-medium`}>
                          {status.icon} {status.label}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {backup.backup_type}
                        </span>
                      </div>

                      <div className="text-sm text-muted-foreground">
                        {new Date(backup.started_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>

                      {backup.status === "completed" && (
                        <div className="text-sm text-muted-foreground mt-2 space-y-1">
                          <div>
                            Size: {formatBytes(backup.file_size_bytes)} →{" "}
                            {formatBytes(backup.compressed_size_bytes)} (
                            {backup.compression_ratio}% compression)
                          </div>
                          {backup.records_count && (
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(backup.records_count).map(([key, count]) => (
                                <span key={key} className="text-xs bg-muted px-2 py-1 rounded">
                                  {count} {key.replace(/_/g, " ")}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {backup.error_message && (
                        <div className="text-sm text-red-600 mt-2">
                          Error: {backup.error_message}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </Card>

      {/* Info Card */}
      <Card className="p-6 bg-muted/50">
        <h4 className="font-medium mb-2">About Backups</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Backups include all your data: kids, foods, recipes, meal plans, and tracking</li>
          <li>• Data is compressed to reduce file size (typically 70-80% reduction)</li>
          <li>• Backups are stored securely and deleted after the retention period</li>
          <li>• You can restore data by contacting support with your backup file</li>
          <li>• Recent tracking data (90 days) is included to keep backups manageable</li>
        </ul>
      </Card>
    </div>
  );
}
