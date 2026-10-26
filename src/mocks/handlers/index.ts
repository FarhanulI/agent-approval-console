import { actionDetailHandlers } from "./action-details";
import { actionsHandlers } from "./actions";

export const handlers = [...actionsHandlers, ...actionDetailHandlers];
