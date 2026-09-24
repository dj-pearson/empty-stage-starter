import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  // US-549: use a real UUID so ids are collision-resistant even for bulk
  // inserts within the same millisecond (the old `${Date.now()}-${rand}` shared
  // the ms). Fall back to an RFC4122-v4-shaped string where crypto.randomUUID
  // is unavailable, so the result is always UUID-shaped.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Debounce function to limit how often a function can be called
 * @param func - Function to debounce
 * @param wait - Milliseconds to wait before calling function
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function debounced(...args: Parameters<T>) {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func(...args);
      timeout = null;
    }, wait);
  };
}

/**
 * Parse a date of birth. A bare 'yyyy-MM-dd' string is a calendar date, so it
 * is built as a local date: `new Date('2020-05-10')` is UTC midnight, which is
 * the evening of May 9 anywhere west of Greenwich and made a child a year
 * older the day before their birthday. Returns null for anything unparseable.
 */
function parseDateOfBirth(dateOfBirth: string | Date): Date | null {
  if (dateOfBirth instanceof Date) {
    return Number.isNaN(dateOfBirth.getTime()) ? null : dateOfBirth;
  }
  const trimmed = dateOfBirth.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const date = new Date(y, mo - 1, d);
    // Reject rollovers like 2020-02-31.
    if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
    return date;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Whole months between a birth date and today, or null when out of range. */
function monthsSinceBirth(dateOfBirth: string | Date): number | null {
  const birthDate = parseDateOfBirth(dateOfBirth);
  if (!birthDate) return null;
  const today = new Date();
  // Validate date is not in the future
  if (birthDate > today) return null;
  // Validate date is reasonable (not before 1900)
  if (birthDate < new Date(1900, 0, 1)) return null;

  let months = (today.getFullYear() - birthDate.getFullYear()) * 12 + (today.getMonth() - birthDate.getMonth());
  // Subtract 1 if this month's day-of-birth hasn't arrived yet
  if (today.getDate() < birthDate.getDate()) months--;
  return Math.max(0, months);
}

/**
 * Calculate age in years from a date of birth
 * @param dateOfBirth - ISO date string (YYYY-MM-DD, read as a local date) or Date object
 * @returns Age in years, or null if invalid/missing date
 */
export function calculateAge(dateOfBirth: string | Date | null | undefined): number | null {
  if (!dateOfBirth) return null;
  const months = monthsSinceBirth(dateOfBirth);
  return months === null ? null : Math.floor(months / 12);
}

/**
 * A child's age as whole years plus leftover months, for "18 months" or
 * "2 years 4 months". Uses the date of birth when there is one; otherwise
 * falls back to the stored `age` in years. Null when neither is usable,
 * including a date of birth that does not parse.
 */
export function kidAgeParts(
  dateOfBirth: string | Date | null | undefined,
  fallbackAge?: number | null,
): { years: number; months: number } | null {
  if (dateOfBirth) {
    const months = monthsSinceBirth(dateOfBirth);
    if (months === null) return null;
    return { years: Math.floor(months / 12), months: months % 12 };
  }
  if (typeof fallbackAge === 'number' && Number.isFinite(fallbackAge) && fallbackAge >= 0) {
    return { years: Math.floor(fallbackAge), months: 0 };
  }
  return null;
}
