import type {
  AuditEventDto,
  AuditEventListResponseDto,
} from "./schemas/audit-event";
import type { AuditEventQuery } from "./schemas/audit-query";

export type AuditReadOptions = { signal?: AbortSignal };

/** The only audit dependency of the UI. Read-only by design: no write methods. */
export interface AuditService {
  listEvents(
    query: AuditEventQuery,
    options?: AuditReadOptions,
  ): Promise<AuditEventListResponseDto>;
  /** Rejects `not-found` on 404 (missing and cross-tenant look identical). */
  getEvent(eventId: string, options?: AuditReadOptions): Promise<AuditEventDto>;
}
