import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

export interface BackupLog {
  id: string;
  backup_type: string;
  status: string;
  file_path?: string;
  file_size_bytes?: number;
  compressed_size_bytes?: number;
  compression_ratio?: number;
  records_count?: {
    kids: number;
    foods: number;
    recipes: number;
    plan_entries: number;
    food_attempts: number;
    grocery_items: number;
    meal_creations: number;
    achievements: number;
    ai_conversations: number;
  };
  started_at: string;
  completed_at?: string;
  error_message?: string;
  expires_at?: string;
}

export interface BackupConfig {
  enabled: boolean;
  frequency: string;
  retention_days: number;
  last_backup_at?: string;
  next_backup_at?: string;
  email_notifications: boolean;
}

/**
 * Create a manual backup of user data
 * @param download - If true, downloads the backup file
 * @returns Backup result
 */
export async function createBackup(download: boolean = true): Promise<{
  success: boolean;
  backupId?: string;
  error?: string;
}> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Please sign in to create a backup");
      return { success: false, error: "Not authenticated" };
    }

    toast.info("Creating backup...", { description: "This may take a moment" });

    const { data, error } = await supabase.functions.invoke("backup-user-data", {
      body: {
        backupType: download ? "export" : "manual",
      },
    });

    if (error) {
      logger.error("Backup error:", error);
      toast.error("Backup failed", { description: error.message });
      return { success: false, error: error.message };
    }

    if (!data.success) {
      toast.error("Backup failed", { description: data.error });
      return { success: false, error: data.error };
    }

    // Show success message
    const sizeInMB = (data.original_size / 1024 / 1024).toFixed(2);
    const compressedMB = (data.compressed_size / 1024 / 1024).toFixed(2);

    toast.success("Backup created successfully", {
      description: `${sizeInMB}MB compressed to ${compressedMB}MB (${data.compression_ratio}% reduction)`,
    });

    // Download if requested
    if (download && data.data) {
      downloadBackup(data.data, data.download_filename);
    }

    return { success: true, backupId: data.backup_id };
  } catch (error) {
    logger.error("Backup failed:", error);
    toast.error("Backup failed", {
      description: error instanceof Error ? error.message : "An unexpected error occurred",
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Download backup data as a file
 * @param base64Data - Base64 encoded compressed data
 * @param filename - Download filename
 */
function downloadBackup(base64Data: string, filename: string) {
  try {
    // Convert base64 to blob
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: "application/gzip" });

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success("Backup downloaded", {
      description: "Save this file in a secure location",
    });
  } catch (error) {
    logger.error("Download failed:", error);
    toast.error("Failed to download backup");
  }
}

/**
 * Get backup history for current user
 * @param limit - Number of backups to retrieve
 * @returns Array of backup logs
 */
export async function getBackupHistory(limit: number = 10): Promise<BackupLog[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return [];

const { data, error } = await supabase
      .from("backup_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      logger.error("Failed to fetch backup history:", error);
      return [];
    }

    return data as BackupLog[];
  } catch (error) {
    logger.error("Failed to fetch backup history:", error);
    return [];
  }
}

/**
 * Get backup configuration for current user
 * @returns Backup configuration
 */
export async function getBackupConfig(): Promise<BackupConfig | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return null;

const { data, error } = await supabase
      .from("backup_config")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error) {
      logger.error("Failed to fetch backup config:", error);
      return null;
    }

    return {
      enabled: data.enabled,
      frequency: data.frequency,
      retention_days: data.retention_days,
      last_backup_at: data.last_backup_at,
      next_backup_at: data.next_backup_at,
      email_notifications: data.email_notifications,
    };
  } catch (error) {
    logger.error("Failed to fetch backup config:", error);
    return null;
  }
}

/**
 * Update backup configuration
 * @param config - Partial backup configuration
 * @returns Success status
 */
export async function updateBackupConfig(
  config: Partial<BackupConfig>
): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Please sign in to update backup settings");
      return false;
    }

const { error } = await supabase
      .from("backup_config")
      .upsert({
        user_id: user.id,
        ...config,
      })
      .eq("user_id", user.id);

    if (error) {
      logger.error("Failed to update backup config:", error);
      toast.error("Failed to update backup settings", {
        description: error.message,
      });
      return false;
    }

    toast.success("Backup settings updated");
    return true;
  } catch (error) {
    logger.error("Failed to update backup config:", error);
    toast.error("Failed to update backup settings");
    return false;
  }
}

/**
 * Format bytes to human-readable string
 * @param bytes - Number of bytes
 * @returns Formatted string
 */
export function formatBytes(bytes?: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Format backup status with icon
 * @param status - Backup status
 * @returns Status with icon
 */
export function formatBackupStatus(status: string): {
  label: string;
  icon: string;
  color: string;
} {
  switch (status) {
    case "completed":
      return { label: "Completed", icon: "✓", color: "text-green-600" };
    case "in_progress":
      return { label: "In Progress", icon: "⏳", color: "text-blue-600" };
    case "failed":
      return { label: "Failed", icon: "✗", color: "text-red-600" };
    case "pending":
      return { label: "Pending", icon: "○", color: "text-gray-600" };
    default:
      return { label: status, icon: "?", color: "text-gray-600" };
  }
}
