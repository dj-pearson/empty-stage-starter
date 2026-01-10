/**
 * Storage Management Admin Component
 *
 * Provides admin interface for managing Supabase Storage buckets,
 * viewing upload statistics, and managing files.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { RefreshCw, Trash2, Download, Eye, HardDrive, FileImage, FileText, Lock, Unlock } from 'lucide-react';
import { storageManager, BucketStats, StorageFileInfo, STORAGE_BUCKETS } from '@/lib/storage-manager';
import { formatBytes } from '@/lib/file-utils';
import { cn } from '@/lib/utils';

export function StorageManagement() {
  const [bucketStats, setBucketStats] = useState<BucketStats[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string>('profile-pictures');
  const [files, setFiles] = useState<StorageFileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  useEffect(() => {
    loadBucketStats();
  }, []);

  useEffect(() => {
    if (selectedBucket) {
      loadFiles(selectedBucket);
    }
  }, [selectedBucket]);

  const loadBucketStats = async () => {
    setIsLoading(true);
    try {
      const stats = await storageManager.getAllBucketStats();
      setBucketStats(stats);
    } catch (error) {
      toast.error('Failed to load storage statistics');
    } finally {
      setIsLoading(false);
    }
  };

  const loadFiles = async (bucket: string) => {
    setIsLoadingFiles(true);
    try {
      const fileList = await storageManager.listFiles(bucket, undefined, { limit: 100 });
      setFiles(fileList);
    } catch (error) {
      toast.error('Failed to load files');
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleDeleteFile = async (bucket: string, path: string) => {
    const success = await storageManager.delete(bucket, path);
    if (success) {
      toast.success('File deleted successfully');
      loadFiles(bucket);
      loadBucketStats();
    } else {
      toast.error('Failed to delete file');
    }
  };

  const handleDownloadFile = async (bucket: string, path: string, filename: string) => {
    const blob = await storageManager.download(bucket, path);
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Download started');
    } else {
      toast.error('Failed to download file');
    }
  };

  const buckets = storageManager.getAllBuckets();
  const totalStorage = bucketStats.reduce((sum, b) => sum + b.totalSize, 0);
  const totalFiles = bucketStats.reduce((sum, b) => sum + b.totalFiles, 0);

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Storage</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(totalStorage)}</div>
            <p className="text-xs text-muted-foreground">
              Across {buckets.length} buckets
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Files</CardTitle>
            <FileImage className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalFiles.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Managed files
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Buckets</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{buckets.length}</div>
            <p className="text-xs text-muted-foreground">
              {buckets.filter(b => b.isPublic).length} public, {buckets.filter(b => !b.isPublic).length} private
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bucket Details */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Storage Buckets</CardTitle>
            <CardDescription>Manage files across all storage buckets</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadBucketStats} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedBucket} onValueChange={setSelectedBucket}>
            <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
              {buckets.slice(0, 6).map((bucket) => (
                <TabsTrigger key={bucket.name} value={bucket.name} className="text-xs">
                  {bucket.isPublic ? (
                    <Unlock className="h-3 w-3 mr-1" />
                  ) : (
                    <Lock className="h-3 w-3 mr-1" />
                  )}
                  {bucket.displayName}
                </TabsTrigger>
              ))}
            </TabsList>

            {buckets.map((bucket) => {
              const stats = bucketStats.find(s => s.bucket === bucket.name);
              return (
                <TabsContent key={bucket.name} value={bucket.name} className="mt-4">
                  <div className="space-y-4">
                    {/* Bucket Info */}
                    <div className="grid gap-4 md:grid-cols-2">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Bucket Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Name:</span>
                            <code className="bg-muted px-2 py-0.5 rounded">{bucket.name}</code>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Visibility:</span>
                            <Badge variant={bucket.isPublic ? 'default' : 'secondary'}>
                              {bucket.isPublic ? 'Public' : 'Private'}
                            </Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Max File Size:</span>
                            <span>{formatBytes(bucket.maxFileSize)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Allowed Types:</span>
                            <span className="text-right max-w-48 truncate">
                              {bucket.allowedMimeTypes.slice(0, 3).join(', ')}
                              {bucket.allowedMimeTypes.length > 3 && '...'}
                            </span>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Statistics</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total Files:</span>
                            <span>{stats?.totalFiles.toLocaleString() || 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total Size:</span>
                            <span>{stats?.formattedSize || '0 Bytes'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Oldest File:</span>
                            <span>
                              {stats?.oldestFile
                                ? new Date(stats.oldestFile).toLocaleDateString()
                                : '-'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Newest File:</span>
                            <span>
                              {stats?.newestFile
                                ? new Date(stats.newestFile).toLocaleDateString()
                                : '-'}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Files Table */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Files ({files.length})</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {isLoadingFiles ? (
                          <div className="flex items-center justify-center py-8">
                            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : files.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            No files in this bucket
                          </div>
                        ) : (
                          <div className="rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Name</TableHead>
                                  <TableHead>Size</TableHead>
                                  <TableHead>Type</TableHead>
                                  <TableHead>Created</TableHead>
                                  <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {files.map((file) => (
                                  <TableRow key={file.id}>
                                    <TableCell className="font-medium max-w-48 truncate">
                                      {file.name}
                                    </TableCell>
                                    <TableCell>{formatBytes(file.size)}</TableCell>
                                    <TableCell>
                                      <Badge variant="outline" className="text-xs">
                                        {file.mimeType.split('/')[1]}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      {new Date(file.createdAt).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex justify-end gap-1">
                                        {file.publicUrl && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => window.open(file.publicUrl, '_blank')}
                                          >
                                            <Eye className="h-4 w-4" />
                                          </Button>
                                        )}
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleDownloadFile(bucket.name, file.path, file.name)}
                                        >
                                          <Download className="h-4 w-4" />
                                        </Button>
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="sm" className="text-destructive">
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>Delete file?</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                This will permanently delete "{file.name}". This action cannot be undone.
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                                              <AlertDialogAction
                                                onClick={() => handleDeleteFile(bucket.name, file.path)}
                                                className="bg-destructive text-destructive-foreground"
                                              >
                                                Delete
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
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
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
