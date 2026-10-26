import { z } from "zod";

/**
 * PROPOSED frontend contract extension (not part of `contracts.ts`).
 *
 * Browser-facing decision DTO. It deliberately has NO `actorId`:
 * `ActionDecisionRequest` in `contracts.ts` requires one, but a value supplied
 * by the browser is not a trusted identity. The actor must be derived on the
 * server from an authenticated session and merged into the backend command by
 * a trusted boundary (Route Handler/BFF). That boundary does not exist yet, so
 * only the MSW handler (which stands in for it, with an isolated test identity)
 * accepts this DTO. See `docs/modules-spec/module-05-action-detail.md`.
 *
 * Strict on purpose: a body that smuggles in `actorId` (or any other unknown
 * key) fails validation instead of being silently ignored.
 *
 * `recordVersion` is the version the reviewer was shown. The server is
 * expected to compare it with the current version atomically; that guarantee
 * is NOT verified for `erp-mcp-bridge`.
 */
export const browserDecisionRequestSchema = z.strictObject({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().max(2000).optional(),
  recordVersion: z.number().int().nonnegative(),
});

export type BrowserDecisionRequest = z.infer<typeof browserDecisionRequestSchema>;

/**
 * PROPOSED (MSW-only) error codes for HTTP 409 on decision endpoints. They are
 * not confirmed `erp-mcp-bridge` codes. A 409 with any other (or no) code is
 * NOT interpreted as a conflict by the adapter.
 */
export const PROPOSED_CONFLICT_CODES = [
  "version_conflict",
  "invalid_transition",
] as const;

export type ProposedConflictCode = (typeof PROPOSED_CONFLICT_CODES)[number];

export function isProposedConflictCode(
  code: string | undefined,
): code is ProposedConflictCode {
  return PROPOSED_CONFLICT_CODES.some((known) => known === code);
}
