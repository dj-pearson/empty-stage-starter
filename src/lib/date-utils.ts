/**
 * Date and Time Utilities
 *
 * Helper functions for working with dates, times, and timezones.
 * Uses native Date API for simplicity and broad compatibility.
 */

/**
 * Format date to human-readable string
 *
 * Usage:
 * ```tsx
 * formatDate(new Date()); // "Jan 15, 2025"
 * formatDate(new Date(), 'long'); // "January 15, 2025"
 * formatDate(new Date(), 'short'); // "1/15/25"
 * ```
 */
export function formatDate(
  date: Date | string | number,
  format: 'short' | 'medium' | 'long' | 'full' = 'medium'
): string {
  const d = new Date(date);

  if (isNaN(d.getTime())) {
    return 'Invalid date';
  }

  const optionsMap: Record<string, Intl.DateTimeFormatOptions> = {
    short: { month: 'numeric', day: 'numeric', year: '2-digit' },
    medium: { month: 'short', day: 'numeric', year: 'numeric' },
    long: { month: 'long', day: 'numeric', year: 'numeric' },
    full: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
  };
  const options = optionsMap[format];

  return new Intl.DateTimeFormat('en-US', options).format(d);
}

/**
 * Format time to human-readable string
 *
 * Usage:
 * ```tsx
 * formatTime(new Date()); // "3:45 PM"
 * formatTime(new Date(), true); // "15:45:30"
 * ```
 */
export function formatTime(date: Date | string | number, use24Hour: boolean = false): string {
  const d = new Date(date);

  if (isNaN(d.getTime())) {
    return 'Invalid time';
  }

  if (use24Hour) {
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format date and time together
 */
export function formatDateTime(
  date: Date | string | number,
  format: 'short' | 'medium' | 'long' = 'medium'
): string {
  const d = new Date(date);

  if (isNaN(d.getTime())) {
    return 'Invalid date/time';
  }

  return `${formatDate(d, format)} at ${formatTime(d)}`;
}

/**
 * Format relative time (e.g., "2 hours ago", "in 3 days")
 *
 * Usage:
 * ```tsx
 * formatRelativeTime(new Date(Date.now() - 3600000)); // "1 hour ago"
 * formatRelativeTime(new Date(Date.now() + 86400000)); // "in 1 day"
 * ```
 */
export function formatRelativeTime(date: Date | string | number): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  const past = diffMs < 0;
  const abs = Math.abs;

  if (abs(diffSec) < 60) {
    return past ? 'just now' : 'in a moment';
  }

  if (abs(diffMin) < 60) {
    const min = abs(diffMin);
    return past ? `${min} minute${min !== 1 ? 's' : ''} ago` : `in ${min} minute${min !== 1 ? 's' : ''}`;
  }

  if (abs(diffHour) < 24) {
    const hour = abs(diffHour);
    return past ? `${hour} hour${hour !== 1 ? 's' : ''} ago` : `in ${hour} hour${hour !== 1 ? 's' : ''}`;
  }

  if (abs(diffDay) < 7) {
    const day = abs(diffDay);
    return past ? `${day} day${day !== 1 ? 's' : ''} ago` : `in ${day} day${day !== 1 ? 's' : ''}`;
  }

  if (abs(diffWeek) < 4) {
    const week = abs(diffWeek);
    return past ? `${week} week${week !== 1 ? 's' : ''} ago` : `in ${week} week${week !== 1 ? 's' : ''}`;
  }

  if (abs(diffMonth) < 12) {
    const month = abs(diffMonth);
    return past ? `${month} month${month !== 1 ? 's' : ''} ago` : `in ${month} month${month !== 1 ? 's' : ''}`;
  }

  const year = abs(diffYear);
  return past ? `${year} year${year !== 1 ? 's' : ''} ago` : `in ${year} year${year !== 1 ? 's' : ''}`;
}

/**
 * Get date in YYYY-MM-DD format (ISO date string)
 */
export function toISODate(date: Date | string | number): string {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

/**
 * Get start of day
 */
export function startOfDay(date: Date | string | number): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get end of day
 */
export function endOfDay(date: Date | string | number): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Get start of week (Sunday)
 */
export function startOfWeek(date: Date | string | number): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  return startOfDay(d);
}

/**
 * Get end of week (Saturday)
 */
export function endOfWeek(date: Date | string | number): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() + (6 - day);
  d.setDate(diff);
  return endOfDay(d);
}

/**
 * Get start of month
 */
export function startOfMonth(date: Date | string | number): Date {
  const d = new Date(date);
  d.setDate(1);
  return startOfDay(d);
}

/**
 * Get end of month
 */
export function endOfMonth(date: Date | string | number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1, 0);
  return endOfDay(d);
}

/**
 * Add days to date
 */
export function addDays(date: Date | string | number, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Add months to date
 */
export function addMonths(date: Date | string | number, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Add years to date
 */
export function addYears(date: Date | string | number, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

/**
 * Calculate difference between two dates
 */
export function dateDiff(
  date1: Date | string | number,
  date2: Date | string | number,
  unit: 'days' | 'hours' | 'minutes' | 'seconds' = 'days'
): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffMs = d2.getTime() - d1.getTime();

  const divisors = {
    seconds: 1000,
    minutes: 1000 * 60,
    hours: 1000 * 60 * 60,
    days: 1000 * 60 * 60 * 24,
  };

  return Math.floor(diffMs / divisors[unit]);
}

/**
 * Check if date is today
 */
export function isToday(date: Date | string | number): boolean {
  const d = new Date(date);
  const today = new Date();
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
}

/**
 * Check if date is yesterday
 */
export function isYesterday(date: Date | string | number): boolean {
  const d = new Date(date);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  );
}

/**
 * Check if date is tomorrow
 */
export function isTomorrow(date: Date | string | number): boolean {
  const d = new Date(date);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return (
    d.getDate() === tomorrow.getDate() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getFullYear() === tomorrow.getFullYear()
  );
}

/**
 * Check if date is in the past
 */
export function isPast(date: Date | string | number): boolean {
  const d = new Date(date);
  return d.getTime() < Date.now();
}

/**
 * Check if date is in the future
 */
export function isFuture(date: Date | string | number): boolean {
  const d = new Date(date);
  return d.getTime() > Date.now();
}

/**
 * Check if date is a weekend (Saturday or Sunday)
 */
export function isWeekend(date: Date | string | number): boolean {
  const d = new Date(date);
  const day = d.getDay();
  return day === 0 || day === 6;
}

/**
 * Get day name
 */
export function getDayName(
  date: Date | string | number,
  format: 'short' | 'long' = 'long'
): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { weekday: format });
}

/**
 * Get month name
 */
export function getMonthName(
  date: Date | string | number,
  format: 'short' | 'long' = 'long'
): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: format });
}

/**
 * Parse date from common formats
 */
export function parseDate(dateString: string): Date | null {
  // Try ISO format
  const isoDate = new Date(dateString);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Try MM/DD/YYYY
  const usMatch = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    return new Date(parseInt(usMatch[3]), parseInt(usMatch[1]) - 1, parseInt(usMatch[2]));
  }

  // Try YYYY-MM-DD
  const isoMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }

  return null;
}

/**
 * Get age from birthdate
 */
export function getAge(birthdate: Date | string | number): number {
  const birth = new Date(birthdate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

/**
 * Format duration in milliseconds to human-readable string
 *
 * Usage:
 * ```tsx
 * formatDuration(90000); // "1m 30s"
 * formatDuration(3665000); // "1h 1m 5s"
 * ```
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }

  return `${seconds}s`;
}

/**
 * Get timezone offset string
 */
export function getTimezoneOffset(): string {
  const offset = -new Date().getTimezoneOffset();
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  const sign = offset >= 0 ? '+' : '-';

  return `${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Get timezone name
 */
export function getTimezoneName(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
