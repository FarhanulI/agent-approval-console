import { z } from "zod";
import { approvalStatusSchema, riskLevelSchema } from "../contracts";
import { ACTION_SORT_FIELDS, SORT_DIRECTIONS } from "../types";

export const MAX_PAGE_SIZE = 100;
export const MAX_SEARCH_LENGTH = 200;

/** Validates the wire-level query string of `GET /api/actions`. */
export const actionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  status: approvalStatusSchema.optional(),
  risk: riskLevelSchema.optional(),
  search: z.string().max(MAX_SEARCH_LENGTH).optional(),
  sortBy: z.enum(ACTION_SORT_FIELDS).optional(),
  sortDirection: z.enum(SORT_DIRECTIONS).optional(),
});

const QUERY_KEYS = [
  "page",
  "pageSize",
  "status",
  "risk",
  "search",
  "sortBy",
  "sortDirection",
] as const;

export function parseActionListQuery(params: URLSearchParams) {
  const raw: Record<string, string> = {};
  for (const key of QUERY_KEYS) {
    const value = params.get(key);
    // An empty value means "not provided", e.g. `?status=`.
    if (value) raw[key] = value;
  }
  return actionListQuerySchema.safeParse(raw);
}
