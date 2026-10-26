import { z } from "zod";
import { auditEventTypeSchema, auditOutcomeSchema } from "./audit-event";

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
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date.");

/**
 * Wire-level query of `GET /api/audit-events` (proposed). Strict: unknown keys
 * such as `tenantId`, `actorId` or `role` are rejected, so the browser cannot
 * even attempt to steer tenant scope. Dates are UTC instants. Only `occurredAt`
 * is sortable. `search` matches the event summary and action id only.
 */
export const auditEventQuerySchema = z
  .strictObject({
    page: z.coerce.number().int().min(1).max(100_000).optional(),
    pageSize: z.coerce.number().int().min(1).max(MAX_AUDIT_PAGE_SIZE).optional(),
    sortBy: z.enum(["occurredAt"]).optional(),
    sortDirection: z.enum(AUDIT_SORT_DIRECTIONS).optional(),
    eventType: auditEventTypeSchema.optional(),
    outcome: auditOutcomeSchema.optional(),
    actionId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/)
      .optional(),
    from: utcDateTime.optional(),
    to: utcDateTime.optional(),
    search: z.string().max(MAX_AUDIT_SEARCH_LENGTH).optional(),
  })
  .refine((q) => !q.from || !q.to || Date.parse(q.from) <= Date.parse(q.to), {
    message: "`from` must not be after `to`.",
    path: ["from"],
  })
  .refine(
    (q) =>
      !q.from ||
      !q.to ||
      Date.parse(q.to) - Date.parse(q.from) <= MAX_AUDIT_RANGE_DAYS * 86_400_000,
    { message: "The date range is too large.", path: ["to"] },
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
