import { useState, useCallback } from "react";

/**
 * Type for validation rules
 */
type ValidationRule<T> = {
  [K in keyof T]?: (value: T[K], formData: T) => string | undefined;
};

/**
 * Type for validation errors
 */
type ValidationErrors<T> = {
  [K in keyof T]?: string;
};

/**
 * Custom hook for form validation
 *
 * Provides standardized validation pattern with:
 * - Error state management
 * - Field-level validation
 * - Full form validation
 * - Error clearing on change
 *
 * @example
 * const { errors, validate, validateField, clearError, setError } = useFormValidation({
 *   name: (value) => !value.trim() ? "Name is required" : undefined,
 *   email: (value) => !value.includes("@") ? "Invalid email" : undefined,
 * });
 *
 * // Validate on submit
 * const handleSubmit = () => {
 *   if (!validate(formData)) return;
 *   // proceed...
 * };
 *
 * // Validate single field on blur
 * <Input onBlur={() => validateField("name", formData.name, formData)} />
 *
 * // Clear error on change
 * <Input onChange={(e) => { setName(e.target.value); clearError("name"); }} />
 */
export function useFormValidation<T extends Record<string, any>>(
  rules: ValidationRule<T>
) {
  const [errors, setErrors] = useState<ValidationErrors<T>>({});

  /**
   * Validate entire form
   * @returns true if valid, false if errors
   */
  const validate = useCallback(
    (formData: T): boolean => {
      const newErrors: ValidationErrors<T> = {};

      for (const field in rules) {
        const rule = rules[field];
        if (rule) {
          const error = rule(formData[field], formData);
          if (error) {
            newErrors[field] = error;
          }
        }
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    },
    [rules]
  );

  /**
   * Validate a single field
   * @returns error message or undefined
   */
  const validateField = useCallback(
    (field: keyof T, value: any, formData: T): string | undefined => {
      const rule = rules[field];
      if (!rule) return undefined;

      const error = rule(value, formData);
      setErrors((prev) => ({
        ...prev,
        [field]: error || undefined,
      }));

      return error;
    },
    [rules]
  );

  /**
   * Clear error for a specific field
   */
  const clearError = useCallback((field: keyof T) => {
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  }, []);

  /**
   * Set error for a specific field
   */
  const setError = useCallback((field: keyof T, error: string) => {
    setErrors((prev) => ({
      ...prev,
      [field]: error,
    }));
  }, []);

  /**
   * Clear all errors
   */
  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  return {
    errors,
    validate,
    validateField,
    clearError,
    setError,
    clearErrors,
  };
}

/**
 * Common validation rules
 */
export const validationRules = {
  required: (fieldName: string) => (value: any) =>
    !value || (typeof value === "string" && !value.trim())
      ? `${fieldName} is required`
      : undefined,

  minLength: (fieldName: string, min: number) => (value: string) =>
    value && value.length < min
      ? `${fieldName} must be at least ${min} characters`
      : undefined,

  maxLength: (fieldName: string, max: number) => (value: string) =>
    value && value.length > max
      ? `${fieldName} must be less than ${max} characters`
      : undefined,

  email: (value: string) =>
    value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ? "Invalid email address"
      : undefined,

  url: (value: string) =>
    value && !/^https?:\/\/.+/.test(value)
      ? "Invalid URL (must start with http:// or https://)"
      : undefined,

  number: (fieldName: string) => (value: any) =>
    value && isNaN(Number(value)) ? `${fieldName} must be a number` : undefined,

  min: (fieldName: string, min: number) => (value: number) =>
    value != null && value < min
      ? `${fieldName} must be at least ${min}`
      : undefined,

  max: (fieldName: string, max: number) => (value: number) =>
    value != null && value > max
      ? `${fieldName} must be at most ${max}`
      : undefined,

  positive: (fieldName: string) => (value: number) =>
    value != null && value <= 0 ? `${fieldName} must be positive` : undefined,
};
