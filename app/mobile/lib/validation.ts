/**
 * Mobile input validation utilities
 * Matches web app validation rules for consistency
 */

export interface PasswordRequirements {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

export function checkPasswordRequirements(password: string): PasswordRequirements {
  return {
    minLength: password.length >= 12,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };
}

export function isPasswordValid(password: string): boolean {
  const reqs = checkPasswordRequirements(password);
  return reqs.minLength && reqs.hasUppercase && reqs.hasLowercase && reqs.hasNumber && reqs.hasSpecial;
}

export function isEmailValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function sanitizeTextInput(input: string, maxLength: number = 200): string {
  return input
    .replace(/<[^>]*>/g, '') // Strip HTML tags
    .trim()
    .slice(0, maxLength);
}

/**
 * Standard length caps for the mobile forms (mirrors web validation).
 * Use these constants instead of magic numbers so call sites stay consistent.
 */
export const INPUT_LIMITS = {
  foodName: 200,
  groceryName: 200,
  recipeName: 200,
  kidName: 100,
  notes: 1000,
} as const;

/**
 * Validate a numeric form input. Accepts strings (TextInput.text) and numbers,
 * returns the clamped numeric value or `null` when the input is malformed.
 *
 * Sane ranges per kind:
 *  - 'quantity': 0..99999 (e.g. servings, units in pantry/grocery)
 *  - 'calories': 0..50000 (per serving — anything more is a data entry error)
 *  - 'servings': 1..200 (recipe yield)
 *  - 'percentage': 0..100
 */
export function validateNumericInput(
  input: string | number | null | undefined,
  kind: 'quantity' | 'calories' | 'servings' | 'percentage' = 'quantity'
): number | null {
  if (input == null) return null;
  const raw = typeof input === 'number' ? input : parseFloat(String(input).trim());
  if (!Number.isFinite(raw)) return null;

  const ranges = {
    quantity: { min: 0, max: 99_999 },
    calories: { min: 0, max: 50_000 },
    servings: { min: 1, max: 200 },
    percentage: { min: 0, max: 100 },
  } as const;

  const { min, max } = ranges[kind];
  if (raw < min || raw > max) return null;
  return raw;
}

/**
 * Rate limiter for login attempts
 * Stores attempts in memory (resets on app restart - acceptable for mobile)
 */
const loginAttempts: { timestamps: number[] } = { timestamps: [] };
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function checkLoginRateLimit(): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  loginAttempts.timestamps = loginAttempts.timestamps.filter(
    (ts) => now - ts < WINDOW_MS
  );

  if (loginAttempts.timestamps.length >= MAX_ATTEMPTS) {
    const oldestInWindow = loginAttempts.timestamps[0];
    const retryAfterMs = WINDOW_MS - (now - oldestInWindow);
    return { allowed: false, retryAfterMs };
  }

  return { allowed: true, retryAfterMs: 0 };
}

export function recordLoginAttempt(): void {
  loginAttempts.timestamps.push(Date.now());
}

export function clearLoginAttempts(): void {
  loginAttempts.timestamps = [];
}

export function formatRetryAfter(ms: number): string {
  const minutes = Math.ceil(ms / 60000);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}
