import type { Principal } from "@/lib/auth/principal";
import type { AuditEventRecord } from "../schemas/audit-event";
import type { AuditEventQuery } from "../schemas/audit-query";

export type AuditContext = {
  requestId: string;
  /** Trusted identity from the session; backends scope reads by its tenants. */
  principal: Principal;
};

/** Input for recording; the store assigns the id and the occurrence time. */
export type NewAuditEvent = Omit<AuditEventRecord, "id" | "occurredAt">;

export type AuditListResult = {
  items: AuditEventRecord[];
  pagination: { page: number; pageSize: number; total: number };
};

/**
 * Server-side port to audit storage. Reads are tenant-scoped through
 * `ctx.principal.tenantIds`; there is intentionally no update or delete.
 *
 * The `mock` implementation is in-memory: NOT durable, NOT immutable, and its
 * writes are NOT atomic with the decision state change. The `bridge`
 * implementation is unavailable until the `erp-mcp-bridge` audit contract
 * (endpoints, tenant scoping, durability, ordering, retention) is verified.
 */
export interface AuditBackend {
  readonly kind: "mock" | "bridge";
  record(ctx: AuditContext, event: NewAuditEvent): Promise<void>;
  list(ctx: AuditContext, query: AuditEventQuery): Promise<AuditListResult>;
  /** Must return undefined for events outside the principal's tenants. */
  get(ctx: AuditContext, eventId: string): Promise<AuditEventRecord | undefined>;
}
