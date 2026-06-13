/**
 * File Handling Utilities
 *
 * Helper functions for file uploads, validation, compression, and manipulation.
 */

export interface FileValidationOptions {
  maxSize?: number; // in bytes
  minSize?: number; // in bytes
  allowedTypes?: string[]; // MIME types
  allowedExtensions?: string[]; // file extensions
}

export interface FileValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0-1
  mimeType?: string;
}

/**
 * Validate file against options
 *
 * Usage:
 * ```tsx
 * const result = validateFile(file, {
 *   maxSize: 5 * 1024 * 1024, // 5MB
 *   allowedTypes: ['image/jpeg', 'image/png'],
 * });
 *
 * if (!result.valid) {
 *   console.error(result.errors);
 * }
 * ```
 */
export function validateFile(
  file: File,
  options: FileValidationOptions = {}
): FileValidationResult {
  const errors: string[] = [];

  // Size validation
  if (options.maxSize && file.size > options.maxSize) {
    errors.push(
      `File size (${formatBytes(file.size)}) exceeds maximum (${formatBytes(options.maxSize)})`
    );
  }

  if (options.minSize && file.size < options.minSize) {
    errors.push(
      `File size (${formatBytes(file.size)}) is below minimum (${formatBytes(options.minSize)})`
    );
  }

  // MIME type validation
  if (options.allowedTypes && !options.allowedTypes.includes(file.type)) {
    errors.push(
      `File type "${file.type}" is not allowed. Allowed types: ${options.allowedTypes.join(', ')}`
    );
  }

  // Extension validation
  if (options.allowedExtensions) {
    const extension = getFileExtension(file.name);
    if (!options.allowedExtensions.includes(extension)) {
      errors.push(
        `File extension ".${extension}" is not allowed. Allowed extensions: ${options.allowedExtensions.map((e) => `.${e}`).join(', ')}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate multiple files
 */
export function validateFiles(
  files: File[],
  options: FileValidationOptions = {}
): FileValidationResult[] {
  return files.map((file) => validateFile(file, options));
}

/**
 * Get file extension
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot + 1).toLowerCase();
}

/**
 * Get filename without extension
 */
export function getFilenameWithoutExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return filename;
  return filename.slice(0, lastDot);
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Read file as text
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result as string);
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file);
  });
}

/**
 * Read file as data URL (base64)
 */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result as string);
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Read file as array buffer
 */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result as ArrayBuffer);
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Get image dimensions
 */
export function getImageDimensions(file: File): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File is not an image'));
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: img.width,
        height: img.height,
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Compress image
 *
 * Usage:
 * ```tsx
 * const compressed = await compressImage(file, {
 *   maxWidth: 1920,
 *   maxHeight: 1080,
 *   quality: 0.8,
 * });
 * ```
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<Blob> {
  const {
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 0.8,
    mimeType = file.type,
  } = options;

  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File is not an image'));
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate new dimensions
      let { width, height } = img;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }

      // Create canvas and draw image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        mimeType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Convert blob to file
 */
export function blobToFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: blob.type });
}

/**
 * Convert data URL to blob
 */
export function dataURLToBlob(dataURL: string): Blob {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  return new Blob([u8arr], { type: mime });
}

/**
 * Convert data URL to file
 */
export function dataURLToFile(dataURL: string, filename: string): File {
  const blob = dataURLToBlob(dataURL);
  return blobToFile(blob, filename);
}

/**
 * Download file
 *
 * Usage:
 * ```tsx
 * downloadFile(blob, 'document.pdf');
 * downloadFile(dataURL, 'image.png');
 * ```
 */
export function downloadFile(data: Blob | string, filename: string): void {
  const url = typeof data === 'string' ? data : URL.createObjectURL(data);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  if (typeof data !== 'string') {
    URL.revokeObjectURL(url);
  }
}

/**
 * Download text as file
 */
export function downloadTextFile(text: string, filename: string, mimeType: string = 'text/plain'): void {
  const blob = new Blob([text], { type: mimeType });
  downloadFile(blob, filename);
}

/**
 * Download JSON as file
 */
export function downloadJSON(data: any, filename: string = 'data.json'): void {
  const json = JSON.stringify(data, null, 2);
  downloadTextFile(json, filename, 'application/json');
}

/**
 * Download CSV as file
 */
export function downloadCSV(
  data: any[],
  filename: string = 'data.csv',
  headers?: string[]
): void {
  if (data.length === 0) return;

  const csvHeaders = headers || Object.keys(data[0]);
  const csvRows = data.map((row) =>
    csvHeaders.map((header) => JSON.stringify(row[header] ?? '')).join(',')
  );

  const csv = [csvHeaders.join(','), ...csvRows].join('\n');
  downloadTextFile(csv, filename, 'text/csv');
}

/**
 * Copy file to clipboard (if supported)
 */
export async function copyFileToClipboard(file: File): Promise<void> {
  if (!navigator.clipboard || !('write' in navigator.clipboard)) {
    throw new Error('Clipboard API not supported');
  }

  try {
    const clipboardItem = new ClipboardItem({ [file.type]: file });
    await navigator.clipboard.write([clipboardItem]);
  } catch (error) {
    throw new Error(`Failed to copy file to clipboard: ${error}`);
  }
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(filename: string): string {
  const extension = getFileExtension(filename);

  const mimeTypes: Record<string, string> = {
    // Images
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    bmp: 'image/bmp',
    tiff: 'image/tiff',

    // Documents
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    csv: 'text/csv',
    rtf: 'application/rtf',

    // Archives
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    tar: 'application/x-tar',
    gz: 'application/gzip',

    // Audio
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    flac: 'audio/flac',

    // Video
    mp4: 'video/mp4',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    wmv: 'video/x-ms-wmv',
    flv: 'video/x-flv',

    // Web
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    json: 'application/json',
    xml: 'application/xml',

    // Fonts
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
    eot: 'application/vnd.ms-fontobject',
  };

  return mimeTypes[extension] || 'application/octet-stream';
}

/**
 * Check if file is image
 */
export function isImage(file: File): boolean {
  return file.type.startsWith('image/');
}

/**
 * Check if file is video
 */
export function isVideo(file: File): boolean {
  return file.type.startsWith('video/');
}

/**
 * Check if file is audio
 */
export function isAudio(file: File): boolean {
  return file.type.startsWith('audio/');
}

/**
 * Check if file is document
 */
export function isDocument(file: File): boolean {
  const documentTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
  ];

  return documentTypes.includes(file.type);
}

/**
 * Sanitize filename (remove unsafe characters)
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Generate unique filename
 */
export function generateUniqueFilename(filename: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const extension = getFileExtension(filename);
  const nameWithoutExt = getFilenameWithoutExtension(filename);

  return `${sanitizeFilename(nameWithoutExt)}_${timestamp}_${random}.${extension}`;
}

/**
 * Create thumbnail from image
 */
export async function createThumbnail(
  file: File,
  size: number = 200
): Promise<Blob> {
  return compressImage(file, {
    maxWidth: size,
    maxHeight: size,
    quality: 0.7,
  });
}

/**
 * Batch upload files with progress
 */
export async function batchUpload(
  files: File[],
  uploadFn: (file: File) => Promise<any>,
  onProgress?: (progress: number, file: File, index: number) => void
): Promise<any[]> {
  const results: any[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const result = await uploadFn(file);
    results.push(result);

    if (onProgress) {
      const progress = ((i + 1) / files.length) * 100;
      onProgress(progress, file, i);
    }
  }

  return results;
}

/**
 * Chunk file for chunked upload
 */
export function chunkFile(file: File, chunkSize: number = 1024 * 1024): Blob[] {
  const chunks: Blob[] = [];
  let start = 0;

  while (start < file.size) {
    const end = Math.min(start + chunkSize, file.size);
    chunks.push(file.slice(start, end));
    start = end;
  }

  return chunks;
}

/**
 * Convert file to base64
 */
export async function fileToBase64(file: File): Promise<string> {
  const dataURL = await readFileAsDataURL(file);
  return dataURL.split(',')[1];
}

/**
 * Convert base64 to blob
 */
export function base64ToBlob(base64: string, mimeType: string = 'application/octet-stream'): Blob {
  const byteString = atob(base64);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);

  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }

  return new Blob([arrayBuffer], { type: mimeType });
}

/**
 * Parse CSV file
 */
export async function parseCSV(file: File): Promise<any[]> {
  const text = await readFileAsText(file);
  const lines = text.split('\n').filter((line) => line.trim());

  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim());
    const row: any = {};

    headers.forEach((header, index) => {
      row[header] = values[index];
    });

    data.push(row);
  }

  return data;
}

/**
 * Common file size limits
 */
export const FileSizeLimits = {
  IMAGE_SMALL: 1 * 1024 * 1024, // 1MB
  IMAGE_MEDIUM: 5 * 1024 * 1024, // 5MB
  IMAGE_LARGE: 10 * 1024 * 1024, // 10MB
  DOCUMENT_SMALL: 2 * 1024 * 1024, // 2MB
  DOCUMENT_MEDIUM: 10 * 1024 * 1024, // 10MB
  DOCUMENT_LARGE: 50 * 1024 * 1024, // 50MB
  VIDEO_SMALL: 50 * 1024 * 1024, // 50MB
  VIDEO_MEDIUM: 100 * 1024 * 1024, // 100MB
  VIDEO_LARGE: 500 * 1024 * 1024, // 500MB
};

/**
 * Common MIME type groups
 */
export const MimeTypeGroups = {
  IMAGES: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  DOCUMENTS: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
  ],
  VIDEOS: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
  AUDIO: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'],
  ARCHIVES: ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'],
};
