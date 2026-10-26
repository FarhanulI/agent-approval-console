import { createHttpAuditService } from "./audit-service";

export { createHttpAuditService } from "./audit-service";

/** Default service used by the app. Swap the implementation here, not in UI. */
export const auditService = createHttpAuditService();
