import { createHttpActionsService } from "./actions-service";

export { ActionsServiceError } from "./actions-service-error";
export { createHttpActionsService } from "./actions-service";

/** Default service used by the app. Swap the implementation here, not in UI. */
export const actionsService = createHttpActionsService();
