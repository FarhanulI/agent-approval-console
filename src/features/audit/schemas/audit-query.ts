import { z } from "zod";
import {
  auditActorTypeSchema,
  auditEventTypeSchema,
  auditOutcomeSchema,
  auditRunIdSchema,
} from "./audit-event";

export const MAX_AUDIT_PAGE_SIZE = 100;
export const MAX_AUDIT_SEARCH_LENGTH = 200;
/** Longest allowed `from`–`to` window. */
export const MAX_AUDIT_RANGE_DAYS = 366;

export const AUDIT_SORT_DIRECTIONS = ["asc", "desc"] as const;
export type AuditSortDirection = (typeof AUDIT_SORT_DIRECTIONS)[number];

const utcDateTime = z
  .string()
  .max(40)
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/, "Use an ISO 8601 UTC timestamp ending in Z.")
  .refine((value) => {
    const match =
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?Z$/.exec(value);
    if (!match) return false;
    const [, year, month, day, hour, minute, second = "0"] = match;
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) return false;
    const parsed = new Date(timestamp);
    return (
      parsed.getUTCFullYear() === Number(year) &&
      parsed.getUTCMonth() + 1 === Number(month) &&
      parsed.getUTCDate() === Number(day) &&
      parsed.getUTCHours() === Number(hour) &&
      parsed.getUTCMinutes() === Number(minute) &&
      parsed.getUTCSeconds() === Number(second)
    );
  }, "Invalid date.");

export const auditIdentifierSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value.trim() === value, "Identifiers cannot have surrounding whitespace.");

const auditEventQueryInputSchema = z
  .strictObject({
    page: z.coerce.number().int().min(1).max(100_000).optional(),
    pageSize: z.coerce.number().int().min(1).max(MAX_AUDIT_PAGE_SIZE).optional(),
    sortBy: z.enum(["occurredAt"]).optional(),
    sortDirection: z.enum(AUDIT_SORT_DIRECTIONS).optional(),
    actorId: auditIdentifierSchema.optional(),
    actorType: auditActorTypeSchema.optional(),
    userId: auditIdentifierSchema.optional(),
    systemId: auditIdentifierSchema.optional(),
    agentId: auditIdentifierSchema.optional(),
    eventType: auditEventTypeSchema.optional(),
    outcome: auditOutcomeSchema.optional(),
    actionId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/)
      .optional(),
    runId: auditRunIdSchema.optional(),
    startDate: utcDateTime.optional(),
    endDate: utcDateTime.optional(),
    /** Backward-compatible aliases for the existing audit URL/API contract. */
    from: utcDateTime.optional(),
    to: utcDateTime.optional(),
    search: z.string().max(MAX_AUDIT_SEARCH_LENGTH).optional(),
  })
  .superRefine((query, context) => {
    if (query.startDate && query.from) {
      context.addIssue({ code: "custom", message: "Use either `startDate` or `from`, not both.", path: ["startDate"] });
    }
    if (query.endDate && query.to) {
      context.addIssue({ code: "custom", message: "Use either `endDate` or `to`, not both.", path: ["endDate"] });
    }

    const startDate = query.startDate ?? query.from;
    const endDate = query.endDate ?? query.to;
    if (!startDate || !endDate) return;
    if (Date.parse(startDate) > Date.parse(endDate)) {
      context.addIssue({ code: "custom", message: "`startDate` must not be after `endDate`.", path: ["startDate"] });
      return;
    }
    if (Date.parse(endDate) - Date.parse(startDate) > MAX_AUDIT_RANGE_DAYS * 86_400_000) {
      context.addIssue({ code: "custom", message: "The date range is too large.", path: ["endDate"] });
    }
  });

/**
 * Internal BFF query. Actor identifiers are filters only, never authorization
 * claims; tenant scope always comes from the authenticated server principal.
 * Legacy `from`/`to` inputs are normalized to the UTC `startDate`/`endDate`.
 * Only `occurredAt` is sortable; search matches summary and action ID.
 */
export const auditEventQuerySchema = auditEventQueryInputSchema.transform(
  ({ from, to, startDate, endDate, ...query }) => ({
    ...query,
    ...(startDate ?? from ? { startDate: startDate ?? from } : {}),
    ...(endDate ?? to ? { endDate: endDate ?? to } : {}),
  }),
);

export type AuditEventQuery = z.infer<typeof auditEventQuerySchema>;

/** Collects every key (known or not) so the strict schema can reject unknown ones. */
export function parseAuditEventQuery(params: URLSearchParams) {
  const raw: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    // An empty value means "not provided", e.g. `?outcome=`.
    if (value) raw[key] = value;
  }
  return auditEventQuerySchema.safeParse(raw);
}

export function serializeAuditEventQuery(query: AuditEventQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params;
}
