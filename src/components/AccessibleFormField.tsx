import * as React from 'react';
import { useId, useEffect, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useScreenReaderAnnounce } from '@/contexts/AccessibilityContext';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

interface AccessibleFormFieldProps {
  label: string;
  name: string;
  type?: 'text' | 'email' | 'password' | 'tel' | 'url' | 'number' | 'textarea';
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
  inputClassName?: string;
  rows?: number;
  min?: number;
  max?: number;
  pattern?: string;
  success?: boolean;
  successMessage?: string;
}

export function AccessibleFormField({
  label,
  name,
  type = 'text',
  value,
  onChange,
  onBlur,
  error,
  hint,
  required = false,
  disabled = false,
  placeholder,
  autoComplete,
  className,
  inputClassName,
  rows = 4,
  min,
  max,
  pattern,
  success = false,
  successMessage,
}: AccessibleFormFieldProps) {
  const id = useId();
  const inputId = `${id}-${name}`;
  const errorId = `${id}-${name}-error`;
  const hintId = `${id}-${name}-hint`;
  const successId = `${id}-${name}-success`;

  const announce = useScreenReaderAnnounce();
  const prevError = useRef<string | undefined>(undefined);

  // Announce errors to screen readers when they appear
  useEffect(() => {
    if (error && error !== prevError.current) {
      announce(`Error: ${error}`, 'assertive');
    }
    prevError.current = error;
  }, [error, announce]);

  // Announce success when field becomes valid
  useEffect(() => {
    if (success && successMessage) {
      announce(successMessage, 'polite');
    }
  }, [success, successMessage, announce]);

  const describedBy = [
    hint && hintId,
    error && errorId,
    success && successMessage && successId,
  ]
    .filter(Boolean)
    .join(' ');

  const inputProps = {
    id: inputId,
    name,
    value,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => onChange(e.target.value),
    onBlur,
    disabled,
    placeholder,
    autoComplete,
    required,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined,
    'aria-required': required || undefined,
    className: cn(
      inputClassName,
      error && 'border-destructive focus-visible:ring-destructive',
      success && 'border-secondary focus-visible:ring-secondary'
    ),
  };

  const renderInput = () => {
    if (type === 'textarea') {
      return <Textarea {...inputProps} rows={rows} />;
    }

    return (
      <Input
        {...inputProps}
        type={type}
        min={min}
        max={max}
        pattern={pattern}
      />
    );
  };

  return (
    <div className={cn('space-y-2', className)}>
      <Label
        htmlFor={inputId}
        className={cn(
          'flex items-center gap-1',
          error && 'text-destructive',
          disabled && 'opacity-50'
        )}
      >
        {label}
        {required && (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only">(required)</span>}
      </Label>

      {hint && (
        <p
          id={hintId}
          className="text-sm text-muted-foreground"
        >
          <Info className="inline h-3 w-3 mr-1" aria-hidden="true" />
          {hint}
        </p>
      )}

      {renderInput()}

      {/* Error message with live region */}
      <div
        id={errorId}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className={cn(
          'text-sm flex items-center gap-1',
          error ? 'text-destructive' : 'sr-only'
        )}
      >
        {error && (
          <>
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <span>{error}</span>
          </>
        )}
      </div>

      {/* Success message */}
      {success && successMessage && (
        <p
          id={successId}
          className="text-sm text-secondary flex items-center gap-1"
          role="status"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <span>{successMessage}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Accessible form wrapper with summary of errors
 */
interface AccessibleFormProps {
  children: React.ReactNode;
  onSubmit: (e: React.FormEvent) => void;
  errors?: Record<string, string>;
  formLabel: string;
  className?: string;
}

export function AccessibleForm({
  children,
  onSubmit,
  errors = {},
  formLabel,
  className,
}: AccessibleFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const announce = useScreenReaderAnnounce();

  const errorEntries = Object.entries(errors).filter(([, error]) => error);
  const hasErrors = errorEntries.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (hasErrors) {
      // Focus the error summary on validation failure
      errorSummaryRef.current?.focus();
      announce(
        `Form has ${errorEntries.length} error${errorEntries.length === 1 ? '' : 's'}. Please correct them and try again.`,
        'assertive'
      );
    } else {
      onSubmit(e);
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      aria-label={formLabel}
      className={className}
      noValidate
    >
      {/* Error summary - shown when there are validation errors */}
      {hasErrors && (
        <div
          ref={errorSummaryRef}
          tabIndex={-1}
          role="alert"
          aria-labelledby="error-summary-heading"
          className="mb-6 p-4 bg-destructive/10 border border-destructive rounded-md"
        >
          <h2
            id="error-summary-heading"
            className="text-lg font-semibold text-destructive flex items-center gap-2"
          >
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
            Please correct the following errors:
          </h2>
          <ul className="mt-2 list-disc list-inside space-y-1">
            {errorEntries.map(([field, error]) => (
              <li key={field}>
                <a
                  href={`#${field}`}
                  className="text-destructive underline hover:no-underline"
                  onClick={(e) => {
                    e.preventDefault();
                    const element = document.getElementById(field);
                    element?.focus();
                  }}
                >
                  {error}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {children}
    </form>
  );
}

/**
 * Required field legend component
 */
export function RequiredFieldLegend() {
  return (
    <p className="text-sm text-muted-foreground mb-4">
      <span className="text-destructive" aria-hidden="true">
        *
      </span>{' '}
      indicates required field
    </p>
  );
}

/**
 * Form instructions component for complex forms
 */
interface FormInstructionsProps {
  children: React.ReactNode;
  id?: string;
}

export function FormInstructions({ children, id }: FormInstructionsProps) {
  return (
    <div
      id={id}
      className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-md mb-6"
      role="note"
    >
      <strong className="block mb-2">Instructions:</strong>
      {children}
    </div>
  );
}

/**
 * Fieldset with legend for grouping related form fields
 */
interface AccessibleFieldsetProps {
  legend: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}

export function AccessibleFieldset({
  legend,
  children,
  hint,
  className,
}: AccessibleFieldsetProps) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <fieldset
      className={cn('space-y-4', className)}
      aria-describedby={hint ? hintId : undefined}
    >
      <legend className="text-lg font-semibold">{legend}</legend>
      {hint && (
        <p id={hintId} className="text-sm text-muted-foreground -mt-2">
          {hint}
        </p>
      )}
      {children}
    </fieldset>
  );
}

export default AccessibleFormField;
