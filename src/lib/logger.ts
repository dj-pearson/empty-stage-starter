/**
 * Application Logger
 *
 * Provides consistent logging throughout the application with environment-aware behavior.
 * - Development: All log levels active
 * - Production: Only errors and warnings are logged
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
      logger.debug(`[DEBUG] ${message}`, ...args);
    }
  }

  /**
   * Info logging - only in development
   * Use for general informational messages
   */
  info(message: string, ...args: unknown[]): void {
    if (this.isDev) {
      logger.info(`[INFO] ${message}`, ...args);
    }
  }

  /**
   * Warning logging - all environments
   * Use for non-critical issues that should be investigated
   */
  warn(message: string, ...args: unknown[]): void {
    logger.warn(`[WARN] ${message}`, ...args);
  }

  /**
   * Error logging - all environments
   * Use for errors that need immediate attention
   */
  error(message: string, error?: unknown, ...args: unknown[]): void {
    logger.error(`[ERROR] ${message}`, error, ...args);
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
