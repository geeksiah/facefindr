/**
 * Production Logger
 * 
 * Controlled logging that can be disabled in production.
 * Use this instead of console.log/error/warn throughout the app.
 */

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || (IS_PRODUCTION ? 'error' : 'debug');

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL as LogLevel];
}

function formatMessage(level: LogLevel, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  const prefix = '[' + timestamp + '] [' + level.toUpperCase() + ']';
  
  if (data !== undefined) {
    try {
      const dataStr = typeof data === 'object' ? JSON.stringify(data) : String(data);
      return prefix + ' ' + message + ' ' + dataStr;
    } catch {
      return prefix + ' ' + message + ' [circular or non-serializable data]';
    }
  }
  
  return prefix + ' ' + message;
}

export const logger = {
  debug(message: string, data?: unknown): void {
    if (shouldLog('debug')) {
      console.log(formatMessage('debug', message, data));
    }
  },

  info(message: string, data?: unknown): void {
    if (shouldLog('info')) {
      console.info(formatMessage('info', message, data));
    }
  },

  warn(message: string, data?: unknown): void {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message, data));
    }
  },

  error(message: string, error?: unknown): void {
    if (shouldLog('error')) {
      if (error instanceof Error) {
        console.error(formatMessage('error', message, {
          name: error.name,
          message: error.message,
          stack: IS_PRODUCTION ? undefined : error.stack,
        }));
      } else {
        console.error(formatMessage('error', message, error));
      }
    }
  },

  api(method: string, path: string, status: number, duration?: number): void {
    if (!IS_PRODUCTION) {
      const durationStr = duration ? ' (' + duration + 'ms)' : '';
      console.log('[API] ' + method + ' ' + path + ' -> ' + status + durationStr);
    }
  },
};

export function suppressConsoleLogs(): void {
  if (IS_PRODUCTION) {
    console.log = () => {};
    console.debug = () => {};
  }
}
