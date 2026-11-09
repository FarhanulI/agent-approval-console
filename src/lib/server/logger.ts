export type LogLevel = "debug" | "info" | "warn" | "error";

export type SafeLogContext = {
  requestId?: string;
  route?: string;
  errorCode?: string;
  userId?: string;
  resourceId?: string;
  reason?: string;
  decision?: "approve" | "reject";
};

const SAFE_VALUE = /^[A-Za-z0-9._:/-]{1,128}$/;
const CONTEXT_FIELDS = [
  "requestId",
  "route",
  "errorCode",
  "userId",
  "resourceId",
  "reason",
  "decision",
] as const;

/** Emits allow-listed JSON fields only; exception messages, bodies and secrets are excluded. */
export function logServerEvent(
  level: LogLevel,
  scope: string,
  event: string,
  context: SafeLogContext = {},
): void {
  if (process.env.NODE_ENV === "test") return;

  const record: Record<string, string> = {
    timestamp: new Date().toISOString(),
    level,
    environment: process.env.NODE_ENV ?? "unknown",
    scope,
    event,
  };
  for (const key of CONTEXT_FIELDS) {
    const value = context[key];
    if (typeof value === "string" && SAFE_VALUE.test(value)) {
      record[key] = value;
    }
  }

  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug") console.debug(line);
  else console.info(line);
}
