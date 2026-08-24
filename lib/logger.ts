type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  duration?: number;
  error?: string;
  [key: string]: unknown;
}

function log(entry: LogEntry): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry,
  });

  if (entry.level === "error" || entry.level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, meta?: Omit<LogEntry, "level" | "message">) =>
    log({ level: "debug", message, ...meta }),

  info: (message: string, meta?: Omit<LogEntry, "level" | "message">) =>
    log({ level: "info", message, ...meta }),

  warn: (message: string, meta?: Omit<LogEntry, "level" | "message">) =>
    log({ level: "warn", message, ...meta }),

  error: (message: string, meta?: Omit<LogEntry, "level" | "message">) =>
    log({ level: "error", message, ...meta }),

  request: (opts: {
    requestId: string;
    method: string;
    path: string;
    statusCode: number;
    duration: number;
  }) =>
    log({
      level: "debug",
      message: "incoming request",
      ...opts,
    }),
};
