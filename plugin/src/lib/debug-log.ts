const MAX_LOG_LENGTH = 600;
const MAX_KEYS = 8;

// Credentials travel in URLs (ApiKey=...) and in the MediaBrowser
// Authorization header (Token="..."). Strip them from anything we log.
const SECRET_QUERY_PARAM = /([?&](?:api_key|apikey|api-key|x-emby-token)=)[^&\s"']+/gi;
const SECRET_TOKEN_FIELD = /((?:token|accesstoken|api_key)"?\s*[:=]\s*"?)[A-Za-z0-9._-]{8,}/gi;

export function redactSecrets(value: unknown): string {
  return String(value).replace(SECRET_QUERY_PARAM, "$1[redacted]").replace(SECRET_TOKEN_FIELD, "$1[redacted]");
}

function truncateText(value: string, maxLength: number = MAX_LOG_LENGTH): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}…[truncated ${value.length - maxLength} chars]`;
}

function serializeObject(value: unknown): string {
  if (!value || typeof value !== "object") {
    return String(value);
  }

  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ""}`;
  }

  if (Array.isArray(value)) {
    return `[Array(${value.length})]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  const picked = keys.slice(0, MAX_KEYS).reduce<Record<string, unknown>>((acc, key) => {
    const item = obj[key];
    if (item === null || item === undefined || typeof item === "number" || typeof item === "boolean") {
      acc[key] = item;
    } else if (typeof item === "string") {
      acc[key] = truncateText(item, 120);
    } else if (Array.isArray(item)) {
      acc[key] = `[Array(${item.length})]`;
    } else if (typeof item === "object") {
      acc[key] = "[Object]";
    } else {
      acc[key] = String(item);
    }
    return acc;
  }, {});

  if (keys.length > MAX_KEYS) {
    picked.__extraKeys = keys.length - MAX_KEYS;
  }

  return JSON.stringify(picked);
}

function serializeArg(arg: unknown): string {
  if (arg === null || arg === undefined) {
    return String(arg);
  }

  if (typeof arg === "string") {
    return truncateText(arg);
  }

  if (typeof arg === "number" || typeof arg === "boolean" || typeof arg === "bigint") {
    return String(arg);
  }

  return truncateText(serializeObject(arg));
}

function formatMessage(prefix: string, parts: unknown[]): string {
  const text = redactSecrets(parts.map(serializeArg).join(" | "));
  return `[iina-emby] ${prefix}: ${text}`;
}

export interface LoggerConsole {
  log: (msg: string) => void;
  error?: (msg: string) => void;
  warn?: (msg: string) => void;
}

export interface LoggerFileApi {
  handle?: (
    path: string,
    mode: string,
  ) => {
    seekToEnd: () => void;
    write: (data: string) => void;
  };
  write?: (path: string, content: string) => void;
}

export interface DebugLogger {
  (...parts: unknown[]): void;
  debug: (...parts: unknown[]) => void;
  error: (...parts: unknown[]) => void;
  warn: (...parts: unknown[]) => void;
}

const LOG_FILE_PATH = "/tmp/iina-emby.log";

function appendToFile(fileApi: LoggerFileApi | undefined, text: string) {
  if (!fileApi) return;
  try {
    const timestamp = new Date().toISOString().split("T")[1].slice(0, 8);
    const line = `[${timestamp}] ${text}\n`;
    if (typeof fileApi.handle === "function") {
      const h = fileApi.handle(LOG_FILE_PATH, "write");
      if (h) {
        h.seekToEnd();
        h.write(line);
        if (typeof (h as any).close === "function") {
          (h as any).close();
        }
      }
    }
  } catch {
    // Ignore file write errors
  }
}

export function createDebugLogger(
  preferences: { get?: (key: string) => unknown },
  loggerConsole: LoggerConsole,
  fileApi?: LoggerFileApi,
): DebugLogger {
  const isDebugEnabled = () => Boolean(preferences?.get?.("debug_logging"));

  const debug = (...parts: unknown[]) => {
    if (isDebugEnabled()) {
      const msg = formatMessage("DEBUG", parts);
      appendToFile(fileApi, msg);
      loggerConsole.log(msg);
    }
  };

  const error = (...parts: unknown[]) => {
    const msg = formatMessage("ERROR", parts);
    if (isDebugEnabled()) {
      appendToFile(fileApi, msg);
    }
    if (typeof loggerConsole.error === "function") {
      loggerConsole.error(msg);
    } else {
      loggerConsole.log(msg);
    }
  };

  const warn = (...parts: unknown[]) => {
    const msg = formatMessage("WARN", parts);
    if (isDebugEnabled()) {
      appendToFile(fileApi, msg);
    }
    if (typeof loggerConsole.warn === "function") {
      loggerConsole.warn(msg);
    } else {
      loggerConsole.log(msg);
    }
  };

  const logger = (...parts: unknown[]) => {
    debug(...parts);
  };

  logger.debug = debug;
  logger.error = error;
  logger.warn = warn;

  return logger as DebugLogger;
}
