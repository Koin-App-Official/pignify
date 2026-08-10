/**
 * Structured terminal logger. Levels: debug < info < warn < error.
 * debug/info are dropped outside of __DEV__ so production terminals stay quiet.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const CONSOLE_METHOD: Record<LogLevel, 'log' | 'info' | 'warn' | 'error'> = {
  debug: 'log',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

function write(level: LogLevel, scope: string, message: string, ...args: unknown[]) {
  if (!__DEV__ && (level === 'debug' || level === 'info')) return;

  const prefix = `[${level.toUpperCase()}]${scope ? ` [${scope}]` : ''}`;
  // eslint-disable-next-line no-console
  console[CONSOLE_METHOD[level]](`${prefix} ${message}`, ...args);
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, ...args: unknown[]) => write('debug', scope, message, ...args),
    info: (message: string, ...args: unknown[]) => write('info', scope, message, ...args),
    warn: (message: string, ...args: unknown[]) => write('warn', scope, message, ...args),
    error: (message: string, ...args: unknown[]) => write('error', scope, message, ...args),
  };
}

export const logger = createLogger('');
