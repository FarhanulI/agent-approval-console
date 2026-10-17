import type { ActionListQuery } from "../types";

/** Serialises a typed query into the wire format; stable key order, no empties. */
export function serializeActionListQuery(query: ActionListQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize));
  if (query.status) params.set("status", query.status);
  if (query.risk) params.set("risk", query.risk);
  const search = query.search?.trim();
  if (search) params.set("search", search);
  if (query.sortBy) params.set("sortBy", query.sortBy);
  if (query.sortDirection) params.set("sortDirection", query.sortDirection);
  return params;
}
