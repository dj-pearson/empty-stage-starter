/**
 * Form Utilities
 *
 * Helper functions and hooks for form handling, building on react-hook-form and zod.
 */

import { z } from 'zod';
import { FieldErrors, UseFormSetError } from 'react-hook-form';

/**
 * Convert Zod errors to react-hook-form errors
 *
 * Usage:
 * ```tsx
 * const result = schema.safeParse(data);
 * if (!result.success) {
 *   const formErrors = zodErrorsToFormErrors(result.error);
 *   // Set errors in form
 * }
 * ```
 */
export function zodErrorsToFormErrors(zodError: z.ZodError): Record<string, string> {
  const formErrors: Record<string, string> = {};

  zodError.errors.forEach((error) => {
    const path = error.path.join('.');
    formErrors[path] = error.message;
  });

  return formErrors;
}

/**
 * Set Zod errors on react-hook-form
 *
 * Usage:
 * ```tsx
 * const result = schema.safeParse(data);
 * if (!result.success) {
 *   setZodErrors(result.error, form.setError);
 * }
 * ```
 */
export function setZodErrors(zodError: z.ZodError, setError: UseFormSetError<any>) {
  zodError.errors.forEach((error) => {
    const path = error.path.join('.') as any;
    setError(path, {
      type: 'manual',
      message: error.message,
    });
  });
}

/**
 * Extract first error message from field errors
 *
 * Usage:
 * ```tsx
 * const error = getFirstError(form.formState.errors, 'email');
 * // Returns: "Email is required" or undefined
 * ```
 */
export function getFirstError(errors: FieldErrors, fieldName: string): string | undefined {
  const error = errors[fieldName];
  if (!error) return undefined;

  if (typeof error.message === 'string') {
    return error.message;
  }

  return undefined;
}

/**
 * Check if form has any errors
 */
export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Count number of errors in form
 */
export function countErrors(errors: FieldErrors): number {
  let count = 0;

  const countRecursive = (obj: any) => {
    Object.keys(obj).forEach((key) => {
      if (obj[key] && typeof obj[key] === 'object') {
        if (obj[key].message) {
          count++;
        } else {
          countRecursive(obj[key]);
        }
      }
    });
  };

  countRecursive(errors);
  return count;
}

/**
 * Format phone number to (XXX) XXX-XXXX
 */
export function formatPhoneNumber(value: string): string {
  const cleaned = value.replace(/\D/g, '');
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);

  if (match) {
    return `(${match[1]}) ${match[2]}-${match[3]}`;
  }

  return value;
}

/**
 * Format credit card number with spaces
 */
export function formatCreditCard(value: string): string {
  const cleaned = value.replace(/\D/g, '');
  const parts = cleaned.match(/.{1,4}/g) || [];
  return parts.join(' ');
}

/**
 * Format currency input
 */
export function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(num)) return '';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}

/**
 * Parse currency string to number
 */
export function parseCurrency(value: string): number {
  const cleaned = value.replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
}

/**
 * Validate file size
 *
 * Usage:
 * ```tsx
 * const isValid = validateFileSize(file, 5); // 5MB max
 * ```
 */
export function validateFileSize(file: File, maxSizeMB: number): boolean {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return file.size <= maxSizeBytes;
}

/**
 * Validate file type
 *
 * Usage:
 * ```tsx
 * const isValid = validateFileType(file, ['image/jpeg', 'image/png']);
 * ```
 */
export function validateFileType(file: File, allowedTypes: string[]): boolean {
  return allowedTypes.includes(file.type);
}

/**
 * Format file size to human readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Common validation patterns
 */
export const ValidationPatterns = {
  // Email pattern (basic)
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

  // Phone number patterns
  phoneUS: /^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/,
  phoneInternational: /^\+?[1-9]\d{1,14}$/,

  // Password strength
  hasUppercase: /[A-Z]/,
  hasLowercase: /[a-z]/,
  hasNumber: /[0-9]/,
  hasSpecialChar: /[^A-Za-z0-9]/,

  // URL patterns
  url: /^https?:\/\/.+/,
  slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,

  // Text patterns
  alphanumeric: /^[a-zA-Z0-9]+$/,
  lettersOnly: /^[a-zA-Z\s]+$/,
  numbersOnly: /^[0-9]+$/,

  // Date patterns
  dateISO: /^\d{4}-\d{2}-\d{2}$/,
  dateUS: /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4}$/,

  // Credit card
  creditCard: /^[0-9]{13,19}$/,
  cvv: /^[0-9]{3,4}$/,

  // ZIP codes
  zipUS: /^\d{5}(-\d{4})?$/,
  postalCA: /^[A-Z]\d[A-Z] \d[A-Z]\d$/,
};

/**
 * Password strength calculator
 *
 * Returns strength score from 0-4:
 * 0 = Very weak
 * 1 = Weak
 * 2 = Fair
 * 3 = Good
 * 4 = Strong
 */
export function calculatePasswordStrength(password: string): {
  score: number;
  feedback: string[];
} {
  let score = 0;
  const feedback: string[] = [];

  if (password.length === 0) {
    return { score: 0, feedback: ['Password is required'] };
  }

  // Length check
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  else feedback.push('Use at least 12 characters for better security');

  // Complexity checks
  if (ValidationPatterns.hasUppercase.test(password)) {
    score++;
  } else {
    feedback.push('Add uppercase letters');
  }

  if (ValidationPatterns.hasLowercase.test(password)) {
    score++;
  } else {
    feedback.push('Add lowercase letters');
  }

  if (ValidationPatterns.hasNumber.test(password)) {
    score++;
  } else {
    feedback.push('Add numbers');
  }

  if (ValidationPatterns.hasSpecialChar.test(password)) {
    score++;
  } else {
    feedback.push('Add special characters (!@#$%^&*)');
  }

  // Normalize score to 0-4
  score = Math.min(4, Math.floor(score / 1.5));

  return { score, feedback };
}

/**
 * Get password strength label
 */
export function getPasswordStrengthLabel(score: number): {
  label: string;
  color: string;
} {
  const labels = [
    { label: 'Very Weak', color: 'red' },
    { label: 'Weak', color: 'orange' },
    { label: 'Fair', color: 'yellow' },
    { label: 'Good', color: 'blue' },
    { label: 'Strong', color: 'green' },
  ];

  return labels[Math.min(score, 4)];
}

/**
 * Trim all string fields in an object
 */
export function trimObjectStrings<T extends Record<string, any>>(obj: T): T {
  const result = { ...obj } as any;

  Object.keys(result).forEach((key) => {
    if (typeof result[key] === 'string') {
      result[key] = result[key].trim();
    }
  });

  return result;
}

/**
 * Remove empty string fields from an object
 */
export function removeEmptyStrings<T extends Record<string, any>>(obj: T): Partial<T> {
  const result: Partial<T> = {};

  Object.keys(obj).forEach((key) => {
    if (obj[key] !== '' && obj[key] !== null && obj[key] !== undefined) {
      result[key as keyof T] = obj[key];
    }
  });

  return result;
}

/**
 * Delay utility for form submissions (prevents double-submit)
 */
export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if two form values are equal (deep comparison)
 */
export function isFormValueEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, index) => isFormValueEqual(val, b[index]));
  }

  if (typeof a === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    return keysA.every((key) => isFormValueEqual(a[key], b[key]));
  }

  return false;
}

/**
 * Check if form has unsaved changes
 */
export function hasUnsavedChanges<T extends Record<string, any>>(
  original: T,
  current: T
): boolean {
  return !isFormValueEqual(original, current);
}
