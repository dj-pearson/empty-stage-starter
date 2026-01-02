/**
 * Application Logger
 *
 * Provides consistent logging throughout the application with environment-aware behavior.
 * - Development: All log levels active with full details
 * - Production: Errors and warnings are sanitized, sensitive data is filtered
 *
 * Usage:
 * ```typescript
 * import { logger } from '@/lib/logger';
 *
 * logger.debug('Debug information', { data });
 * logger.info('Info message');
 * logger.warn('Warning message');
 * logger.error('Error occurred', error);
 * ```
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  prefix?: string;
  context?: Record<string, unknown>;
}

class Logger {
  private isDev: boolean;

  constructor() {
    this.isDev = import.meta.env.DEV;
  }

  /**
   * Debug logging - only in development
   * Use for detailed debugging information
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.isDev) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }

  /**
   * Info logging - only in development
   * Use for general informational messages
   */
  info(message: string, ...args: unknown[]): void {
    if (this.isDev) {
      console.info(`[INFO] ${message}`, ...args);
    }
  }

  /**
   * Warning logging - development only for console, production uses Sentry
   * Use for non-critical issues that should be investigated
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.isDev) {
      console.warn(`[WARN] ${message}`, ...args);
    }
    // In production, warnings should be captured by Sentry if needed
  }

  /**
   * Error logging - sanitized in production
   * Use for errors that need immediate attention
   * In production: Only logs a generic message, detailed errors go to Sentry
   */
  error(message: string, error?: unknown, ...args: unknown[]): void {
    if (this.isDev) {
      // Full error details in development
      console.error(`[ERROR] ${message}`, error, ...args);
    } else {
      // Sanitized output in production - no stack traces or sensitive data
      console.error(`[ERROR] ${message}`);
      // Sentry captures the full error via logError() in sentry.tsx
    }
  }

  /**
   * Creates a child logger with a prefix for context
   */
  withContext(prefix: string): ContextLogger {
    return new ContextLogger(this, prefix);
  }
}

class ContextLogger {
  constructor(
    private parent: Logger,
    private prefix: string
  ) {}

  debug(message: string, ...args: unknown[]): void {
    this.parent.debug(`${this.prefix} | ${message}`, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.parent.info(`${this.prefix} | ${message}`, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.parent.warn(`${this.prefix} | ${message}`, ...args);
  }

  error(message: string, error?: unknown, ...args: unknown[]): void {
    this.parent.error(`${this.prefix} | ${message}`, error, ...args);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export for creating context loggers
export type { LoggerOptions };
