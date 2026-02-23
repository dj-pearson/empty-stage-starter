/**
 * Structured Application Logger
 *
 * Provides structured JSON logging with log levels and request ID correlation.
 *
 * - Development: Human-readable format, all levels shown
 * - Production: JSON format, debug suppressed
 *
 * Usage:
 * ```typescript
 * import { logger } from '@/lib/logger';
 *
 * logger.debug('Debug information', { data });
 * logger.info('User logged in', { userId: '123' });
 * logger.warn('Deprecated feature used');
 * logger.error('Database query failed', error);
 * logger.fatal('Application crashed', error);
 * ```
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  requestId?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

let currentRequestId: string | undefined;

/**
 * Set a request ID for correlation across log entries.
 */
export function setRequestId(id: string): void {
  currentRequestId = id;
}

/**
 * Generate a short random request ID.
 */
export function generateRequestId(): string {
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

class Logger {
  private isDev: boolean;
  private minLevel: LogLevel;

  constructor() {
    this.isDev = import.meta.env.DEV;
    this.minLevel = this.isDev ? 'debug' : 'info';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[this.minLevel];
  }

  private formatError(err: unknown): StructuredLogEntry['error'] | undefined {
    if (!err) return undefined;
    if (err instanceof Error) {
      return {
        name: err.name,
        message: err.message,
        stack: this.isDev ? err.stack : undefined,
      };
    }
    return { name: 'UnknownError', message: String(err) };
  }

  private createEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    err?: unknown,
  ): StructuredLogEntry {
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    if (currentRequestId) {
      entry.requestId = currentRequestId;
    }

    if (context && Object.keys(context).length > 0) {
      entry.context = context;
    }

    const errorInfo = this.formatError(err);
    if (errorInfo) {
      entry.error = errorInfo;
    }

    return entry;
  }

  private output(level: LogLevel, entry: StructuredLogEntry): void {
    if (this.isDev) {
      // Human-readable format in development
      const prefix = `[${entry.level.toUpperCase()}]`;
      const reqId = entry.requestId ? ` (${entry.requestId})` : '';
      const msg = `${prefix}${reqId} ${entry.message}`;

      const extras: unknown[] = [];
      if (entry.context) extras.push(entry.context);
      if (entry.error) extras.push(entry.error);

      switch (level) {
        case 'debug':
          console.debug(msg, ...extras);
          break;
        case 'info':
          console.info(msg, ...extras);
          break;
        case 'warn':
          console.warn(msg, ...extras);
          break;
        case 'error':
        case 'fatal':
          console.error(msg, ...extras);
          break;
      }
    } else {
      // Structured JSON in production
      const json = JSON.stringify(entry);
      switch (level) {
        case 'debug':
        case 'info':
          console.log(json);
          break;
        case 'warn':
          console.warn(json);
          break;
        case 'error':
        case 'fatal':
          console.error(json);
          break;
      }
    }
  }

  debug(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('debug')) return;
    const { context, err } = this.parseArgs(args);
    this.output('debug', this.createEntry('debug', message, context, err));
  }

  info(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('info')) return;
    const { context, err } = this.parseArgs(args);
    this.output('info', this.createEntry('info', message, context, err));
  }

  warn(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('warn')) return;
    const { context, err } = this.parseArgs(args);
    this.output('warn', this.createEntry('warn', message, context, err));
  }

  error(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('error')) return;
    const { context, err } = this.parseArgs(args);
    this.output('error', this.createEntry('error', message, context, err));
  }

  fatal(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('fatal')) return;
    const { context, err } = this.parseArgs(args);
    this.output('fatal', this.createEntry('fatal', message, context, err));
  }

  /** Parse variadic args into context and error for backward compatibility */
  private parseArgs(args: unknown[]): { context?: Record<string, unknown>; err?: unknown } {
    let context: Record<string, unknown> | undefined;
    let err: unknown;

    for (const arg of args) {
      if (arg instanceof Error) {
        err = arg;
      } else if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
        context = arg as Record<string, unknown>;
      } else if (arg !== undefined && arg !== null) {
        // Primitive values — wrap in context
        if (!context) context = {};
        context[`arg${Object.keys(context).length}`] = arg;
      }
    }

    return { context, err };
  }

  /**
   * Creates a child logger with a prefix for context.
   */
  withContext(prefix: string): ContextLogger {
    return new ContextLogger(this, prefix);
  }
}

class ContextLogger {
  constructor(
    private parent: Logger,
    private prefix: string,
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

  error(message: string, ...args: unknown[]): void {
    this.parent.error(`${this.prefix} | ${message}`, ...args);
  }

  fatal(message: string, ...args: unknown[]): void {
    this.parent.fatal(`${this.prefix} | ${message}`, ...args);
  }
}

// Export singleton instance
export const logger = new Logger();

export type { LogLevel, StructuredLogEntry };
