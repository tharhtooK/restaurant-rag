type Level = "debug" | "info" | "warn" | "error";

type Fields = Record<string, string | number | boolean>;

const SEVERITY: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function configuredLevel(): Level {
  switch (process.env.LOG_LEVEL?.toLowerCase()) {
    case "debug":
      return "debug";
    case "info":
      return "info";
    case "warn":
      return "warn";
    case "error":
      return "error";
    default:
      return "info";
  }
}

let threshold: number | null = null;

function isEnabled(level: Level): boolean {
  if (threshold === null) threshold = SEVERITY[configuredLevel()];
  return SEVERITY[level] >= threshold;
}

function formatValue(value: string | number | boolean): string {
  if (typeof value !== "string") return String(value);
  if (/[\s"]/.test(value)) return JSON.stringify(value);
  return value;
}

function formatFields(fields: Fields): string {
  return Object.entries(fields)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(" ");
}

// stderr, not stdout: the eval runner and the seed scripts report on stdout, and
// interleaving log lines into that output would corrupt it.
function write(level: Level, moduleName: string, message: string, fields?: Fields): void {
  if (!isEnabled(level)) return;
  const suffix = fields ? ` ${formatFields(fields)}` : "";
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${moduleName} ${message}${suffix}\n`;
  process.stderr.write(line);
}

export type Logger = {
  debug(message: string, fields?: Fields): void;
  info(message: string, fields?: Fields): void;
  warn(message: string, fields?: Fields): void;
  error(message: string, fields?: Fields): void;
};

export function getLogger(moduleName: string): Logger {
  return {
    debug: (message, fields) => write("debug", moduleName, message, fields),
    info: (message, fields) => write("info", moduleName, message, fields),
    warn: (message, fields) => write("warn", moduleName, message, fields),
    error: (message, fields) => write("error", moduleName, message, fields),
  };
}
