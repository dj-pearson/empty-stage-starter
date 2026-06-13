/**
 * Centralized Storage Management Service
 *
 * Provides unified API for Supabase Storage with:
 * - Bucket configuration and management
 * - File upload with validation and compression
 * - Signed URL generation for private assets
 * - CDN integration helpers
 * - Admin management interface support
 *
 * Usage:
 * ```typescript
 * import { storageManager } from '@/lib/storage-manager';
 *
 * // Upload a file
 * const result = await storageManager.upload('profile-pictures', file, {
 *   folder: 'avatars',
 *   compress: true,
 *   maxWidth: 400,
 * });
 *
 * // Get signed URL for private asset
 * const url = await storageManager.getSignedUrl('private-files', 'path/to/file.pdf', 3600);
 *
 * // List bucket contents (admin)
 * const files = await storageManager.listFiles('profile-pictures', 'avatars');
 * ```
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from './logger';
import {
  validateFile,
  compressImage,
  generateUniqueFilename,
  formatBytes,
  getMimeType,
  isImage,
  FileSizeLimits,
  MimeTypeGroups,
} from './file-utils';

/**
 * Storage bucket configuration
 */
export interface BucketConfig {
  name: string;
  displayName: string;
  description: string;
  isPublic: boolean;
  allowedMimeTypes: string[];
  maxFileSize: number;
  signedUrlExpiry?: number; // Default expiry in seconds for signed URLs
}

/**
 * Predefined bucket configurations
 */
export const STORAGE_BUCKETS: Record<string, BucketConfig> = {
  'profile-pictures': {
    name: 'profile-pictures',
    displayName: 'Profile Pictures',
    description: 'User and child profile avatars',
    isPublic: true,
    allowedMimeTypes: MimeTypeGroups.IMAGES,
    maxFileSize: FileSizeLimits.IMAGE_MEDIUM, // 5MB
  },
  'blog-images': {
    name: 'blog-images',
    displayName: 'Blog Images',
    description: 'Featured images and inline content for blog posts',
    isPublic: true,
    allowedMimeTypes: MimeTypeGroups.IMAGES,
    maxFileSize: FileSizeLimits.IMAGE_LARGE, // 10MB
  },
  'recipe-images': {
    name: 'recipe-images',
    displayName: 'Recipe Images',
    description: 'Recipe photos uploaded by users',
    isPublic: true,
    allowedMimeTypes: MimeTypeGroups.IMAGES,
    maxFileSize: FileSizeLimits.IMAGE_MEDIUM, // 5MB
  },
  'assets': {
    name: 'Assets',
    displayName: 'Public Assets',
    description: 'Lead magnets, PDFs, and downloadable resources',
    isPublic: true,
    allowedMimeTypes: [...MimeTypeGroups.IMAGES, ...MimeTypeGroups.DOCUMENTS],
    maxFileSize: FileSizeLimits.DOCUMENT_MEDIUM, // 10MB
  },
  'private-files': {
    name: 'private-files',
    displayName: 'Private Files',
    description: 'User exports, reports, and private documents',
    isPublic: false,
    allowedMimeTypes: [...MimeTypeGroups.IMAGES, ...MimeTypeGroups.DOCUMENTS],
    maxFileSize: FileSizeLimits.DOCUMENT_LARGE, // 50MB
    signedUrlExpiry: 3600, // 1 hour
  },
  'backups': {
    name: 'backups',
    displayName: 'System Backups',
    description: 'Automated system backups (admin only)',
    isPublic: false,
    allowedMimeTypes: ['application/json', 'application/gzip', 'application/zip'],
    maxFileSize: FileSizeLimits.VIDEO_LARGE, // 500MB
    signedUrlExpiry: 300, // 5 minutes
  },
};

/**
 * Upload options
 */
export interface UploadOptions {
  folder?: string;
  filename?: string;
  compress?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  generateThumbnail?: boolean;
  thumbnailSize?: number;
  metadata?: Record<string, string>;
  cacheControl?: string;
  upsert?: boolean;
}

/**
 * Upload result
 */
export interface UploadResult {
  success: boolean;
  path: string;
  publicUrl?: string;
  signedUrl?: string;
  thumbnailPath?: string;
  thumbnailUrl?: string;
  size: number;
  mimeType: string;
  error?: string;
}

/**
 * File info for listing
 */
export interface StorageFileInfo {
  id: string;
  name: string;
  path: string;
  size: number;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
  publicUrl?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Bucket statistics
 */
export interface BucketStats {
  bucket: string;
  totalFiles: number;
  totalSize: number;
  formattedSize: string;
  oldestFile?: string;
  newestFile?: string;
}

/**
 * Storage Manager Class
 */
class StorageManagerService {
  private readonly log = logger.withContext('StorageManager');

  /**
   * Get bucket configuration
   */
  getBucketConfig(bucketName: string): BucketConfig | undefined {
    return STORAGE_BUCKETS[bucketName];
  }

  /**
   * Get all bucket configurations
   */
  getAllBuckets(): BucketConfig[] {
    return Object.values(STORAGE_BUCKETS);
  }

  /**
   * Upload file to storage
   */
  async upload(
    bucketName: string,
    file: File,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const config = this.getBucketConfig(bucketName);

    // Validate bucket exists
    if (!config) {
      return {
        success: false,
        path: '',
        size: 0,
        mimeType: file.type,
        error: `Unknown bucket: ${bucketName}`,
      };
    }

    // Validate file
    const validation = validateFile(file, {
      maxSize: config.maxFileSize,
      allowedTypes: config.allowedMimeTypes,
    });

    if (!validation.valid) {
      return {
        success: false,
        path: '',
        size: file.size,
        mimeType: file.type,
        error: validation.errors.join(', '),
      };
    }

    try {
      // Get current user for folder organization
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'anonymous';

      // Prepare file for upload
      let uploadFile: File | Blob = file;
      let finalMimeType = file.type;

      // Compress image if requested
      if (options.compress && isImage(file)) {
        const compressed = await compressImage(file, {
          maxWidth: options.maxWidth || 1920,
          maxHeight: options.maxHeight || 1080,
          quality: options.quality || 0.85,
        });
        uploadFile = compressed;
        finalMimeType = compressed.type;
      }

      // Generate file path
      const filename = options.filename || generateUniqueFilename(file.name);
      const folder = options.folder || userId;
      const filePath = `${folder}/${filename}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from(config.name)
        .upload(filePath, uploadFile, {
          contentType: finalMimeType,
          cacheControl: options.cacheControl || '3600',
          upsert: options.upsert || false,
        });

      if (error) {
        this.log.error(`Upload failed for ${bucketName}/${filePath}`, error);
        return {
          success: false,
          path: filePath,
          size: uploadFile.size || file.size,
          mimeType: finalMimeType,
          error: error.message,
        };
      }

      // Get URL based on bucket visibility
      let publicUrl: string | undefined;
      let signedUrl: string | undefined;

      if (config.isPublic) {
        const { data: urlData } = supabase.storage
          .from(config.name)
          .getPublicUrl(data.path);
        publicUrl = urlData.publicUrl;
      } else {
        const { data: signedData, error: signedError } = await supabase.storage
          .from(config.name)
          .createSignedUrl(data.path, config.signedUrlExpiry || 3600);

        if (!signedError && signedData) {
          signedUrl = signedData.signedUrl;
        }
      }

      // Generate thumbnail if requested
      let thumbnailPath: string | undefined;
      let thumbnailUrl: string | undefined;

      if (options.generateThumbnail && isImage(file)) {
        const thumbnailResult = await this.generateThumbnail(
          config.name,
          filePath,
          file,
          options.thumbnailSize || 200
        );
        if (thumbnailResult.success) {
          thumbnailPath = thumbnailResult.path;
          thumbnailUrl = thumbnailResult.url;
        }
      }

      this.log.info(`File uploaded: ${config.name}/${data.path}`);

      return {
        success: true,
        path: data.path,
        publicUrl,
        signedUrl,
        thumbnailPath,
        thumbnailUrl,
        size: uploadFile.size || file.size,
        mimeType: finalMimeType,
      };
    } catch (error) {
      this.log.error('Upload error', error);
      return {
        success: false,
        path: '',
        size: file.size,
        mimeType: file.type,
        error: error instanceof Error ? error.message : 'Unknown upload error',
      };
    }
  }

  /**
   * Generate thumbnail for an image
   */
  private async generateThumbnail(
    bucketName: string,
    originalPath: string,
    file: File,
    size: number
  ): Promise<{ success: boolean; path?: string; url?: string }> {
    try {
      const compressed = await compressImage(file, {
        maxWidth: size,
        maxHeight: size,
        quality: 0.7,
      });

      const thumbnailPath = originalPath.replace(/(\.[^.]+)$/, `_thumb$1`);

      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(thumbnailPath, compressed, {
          contentType: compressed.type,
          cacheControl: '86400',
          upsert: true,
        });

      if (error) {
        return { success: false };
      }

      const config = this.getBucketConfig(bucketName);
      let url: string | undefined;

      if (config?.isPublic) {
        const { data: urlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(data.path);
        url = urlData.publicUrl;
      }

      return { success: true, path: data.path, url };
    } catch (error) {
      this.log.error('Thumbnail generation failed', error);
      return { success: false };
    }
  }

  /**
   * Get signed URL for private file
   */
  async getSignedUrl(
    bucketName: string,
    filePath: string,
    expiresIn?: number
  ): Promise<string | null> {
    const config = this.getBucketConfig(bucketName);
    const expiry = expiresIn || config?.signedUrlExpiry || 3600;

    try {
      const { data, error } = await supabase.storage
        .from(config?.name || bucketName)
        .createSignedUrl(filePath, expiry);

      if (error) {
        this.log.error(`Failed to create signed URL: ${bucketName}/${filePath}`, error);
        return null;
      }

      return data.signedUrl;
    } catch (error) {
      this.log.error('Signed URL error', error);
      return null;
    }
  }

  /**
   * Get signed URLs for multiple files
   */
  async getSignedUrls(
    bucketName: string,
    filePaths: string[],
    expiresIn?: number
  ): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>();

    await Promise.all(
      filePaths.map(async (path) => {
        const url = await this.getSignedUrl(bucketName, path, expiresIn);
        results.set(path, url);
      })
    );

    return results;
  }

  /**
   * Get public URL for a file
   */
  getPublicUrl(bucketName: string, filePath: string): string {
    const config = this.getBucketConfig(bucketName);
    const { data } = supabase.storage
      .from(config?.name || bucketName)
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  /**
   * Delete file from storage
   */
  async delete(bucketName: string, filePath: string): Promise<boolean> {
    const config = this.getBucketConfig(bucketName);

    try {
      const { error } = await supabase.storage
        .from(config?.name || bucketName)
        .remove([filePath]);

      if (error) {
        this.log.error(`Delete failed: ${bucketName}/${filePath}`, error);
        return false;
      }

      this.log.info(`File deleted: ${bucketName}/${filePath}`);
      return true;
    } catch (error) {
      this.log.error('Delete error', error);
      return false;
    }
  }

  /**
   * Delete multiple files
   */
  async deleteMany(bucketName: string, filePaths: string[]): Promise<number> {
    const config = this.getBucketConfig(bucketName);

    try {
      const { error } = await supabase.storage
        .from(config?.name || bucketName)
        .remove(filePaths);

      if (error) {
        this.log.error(`Bulk delete failed for ${bucketName}`, error);
        return 0;
      }

      this.log.info(`Deleted ${filePaths.length} files from ${bucketName}`);
      return filePaths.length;
    } catch (error) {
      this.log.error('Bulk delete error', error);
      return 0;
    }
  }

  /**
   * List files in a bucket/folder
   */
  async listFiles(
    bucketName: string,
    folder?: string,
    options: { limit?: number; offset?: number; sortBy?: { column: string; order: 'asc' | 'desc' } } = {}
  ): Promise<StorageFileInfo[]> {
    const config = this.getBucketConfig(bucketName);

    try {
      const { data, error } = await supabase.storage
        .from(config?.name || bucketName)
        .list(folder || '', {
          limit: options.limit || 100,
          offset: options.offset || 0,
          sortBy: options.sortBy || { column: 'created_at', order: 'desc' },
        });

      if (error) {
        this.log.error(`List failed for ${bucketName}/${folder}`, error);
        return [];
      }

      // Filter out folders and map to StorageFileInfo
      return (data || [])
        .filter((item) => item.id !== null) // Exclude folders
        .map((item) => {
          const path = folder ? `${folder}/${item.name}` : item.name;
          let publicUrl: string | undefined;

          if (config?.isPublic) {
            const { data: urlData } = supabase.storage
              .from(config.name)
              .getPublicUrl(path);
            publicUrl = urlData.publicUrl;
          }

          return {
            id: item.id || '',
            name: item.name,
            path,
            size: item.metadata?.size || 0,
            mimeType: item.metadata?.mimetype || getMimeType(item.name),
            createdAt: item.created_at || '',
            updatedAt: item.updated_at || item.created_at || '',
            publicUrl,
            metadata: item.metadata,
          };
        });
    } catch (error) {
      this.log.error('List error', error);
      return [];
    }
  }

  /**
   * Get bucket statistics
   */
  async getBucketStats(bucketName: string): Promise<BucketStats> {
    const files = await this.listFiles(bucketName, undefined, { limit: 1000 });

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const dates = files.map((f) => new Date(f.createdAt).getTime()).filter((d) => !isNaN(d));

    return {
      bucket: bucketName,
      totalFiles: files.length,
      totalSize,
      formattedSize: formatBytes(totalSize),
      oldestFile: dates.length ? new Date(Math.min(...dates)).toISOString() : undefined,
      newestFile: dates.length ? new Date(Math.max(...dates)).toISOString() : undefined,
    };
  }

  /**
   * Get all bucket statistics (admin)
   */
  async getAllBucketStats(): Promise<BucketStats[]> {
    const buckets = this.getAllBuckets();
    const stats = await Promise.all(
      buckets.map((b) => this.getBucketStats(b.name))
    );
    return stats;
  }

  /**
   * Copy file within or between buckets
   */
  async copy(
    sourceBucket: string,
    sourcePath: string,
    destBucket: string,
    destPath: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase.storage
        .from(sourceBucket)
        .copy(sourcePath, destPath);

      if (error) {
        this.log.error(`Copy failed: ${sourceBucket}/${sourcePath} -> ${destBucket}/${destPath}`, error);
        return false;
      }

      return true;
    } catch (error) {
      this.log.error('Copy error', error);
      return false;
    }
  }

  /**
   * Move file (copy + delete)
   */
  async move(
    sourceBucket: string,
    sourcePath: string,
    destBucket: string,
    destPath: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase.storage
        .from(sourceBucket)
        .move(sourcePath, destPath);

      if (error) {
        this.log.error(`Move failed: ${sourceBucket}/${sourcePath} -> ${destPath}`, error);
        return false;
      }

      return true;
    } catch (error) {
      this.log.error('Move error', error);
      return false;
    }
  }

  /**
   * Download file as blob
   */
  async download(bucketName: string, filePath: string): Promise<Blob | null> {
    const config = this.getBucketConfig(bucketName);

    try {
      const { data, error } = await supabase.storage
        .from(config?.name || bucketName)
        .download(filePath);

      if (error) {
        this.log.error(`Download failed: ${bucketName}/${filePath}`, error);
        return null;
      }

      return data;
    } catch (error) {
      this.log.error('Download error', error);
      return null;
    }
  }

  /**
   * Check if file exists
   */
  async exists(bucketName: string, filePath: string): Promise<boolean> {
    const config = this.getBucketConfig(bucketName);
    const folder = filePath.substring(0, filePath.lastIndexOf('/')) || '';
    const filename = filePath.substring(filePath.lastIndexOf('/') + 1);

    try {
      const { data, error } = await supabase.storage
        .from(config?.name || bucketName)
        .list(folder, { search: filename });

      if (error) {
        return false;
      }

      return data.some((f) => f.name === filename);
    } catch {
      return false;
    }
  }

  /**
   * Get CDN-optimized URL with transformations
   * Note: Requires Supabase Image Transformation or Cloudflare Images
   */
  getCdnUrl(
    bucketName: string,
    filePath: string,
    options: {
      width?: number;
      height?: number;
      quality?: number;
      format?: 'webp' | 'avif' | 'origin';
    } = {}
  ): string {
    const baseUrl = this.getPublicUrl(bucketName, filePath);

    // Build transformation query params
    const params = new URLSearchParams();
    if (options.width) params.set('width', options.width.toString());
    if (options.height) params.set('height', options.height.toString());
    if (options.quality) params.set('quality', options.quality.toString());
    if (options.format) params.set('format', options.format);

    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }
}

// Export singleton instance
export const storageManager = new StorageManagerService();

// Export types
export type { BucketConfig, UploadOptions, UploadResult, StorageFileInfo, BucketStats };
