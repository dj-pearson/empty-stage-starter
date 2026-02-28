import { Label } from "@/components/ui/label";
import { ReactNode } from "react";
import { AlertCircle } from "lucide-react";

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  children: ReactNode;
  required?: boolean;
  hint?: string;
  className?: string;
}

/**
 * Standardized form field wrapper
 *
 * Features:
 * - Consistent label styling
 * - Required indicator (*)
 * - Inline error display with icon
 * - Optional hint text
 * - Proper aria attributes for accessibility
 *
 * @example
 * <FormField label="Name" error={errors.name} required>
 *   <Input
 *     id="name"
 *     value={name}
 *     onChange={(e) => setName(e.target.value)}
 *     className={errors.name ? "border-destructive" : ""}
 *     aria-invalid={!!errors.name}
 *     aria-describedby={errors.name ? "name-error" : undefined}
 *   />
 * </FormField>
 */
export function FormField({
  label,
  htmlFor,
  error,
  children,
  required = false,
  hint,
  className = "",
}: FormFieldProps) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  const hintId = htmlFor ? `${htmlFor}-hint` : undefined;

  return (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {children}
      {hint && !error && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <div id={errorId} className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
