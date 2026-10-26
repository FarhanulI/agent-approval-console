/**
 * - `network`: a read could not reach the server.
 * - `http`: the server answered with an error status that has no more specific
 *   meaning here (validation, authorization, ...). Inspect `status`/`code`.
 * - `malformed`: a read returned a body that is not valid JSON or fails schema
 *   validation.
 * - `not-found`: HTTP 404 on the detail or decision endpoints (proposed
 *   contract; not verified against `erp-mcp-bridge`).
 * - `conflict`: HTTP 409 carrying a proposed conflict code
 *   (`version_conflict` / `invalid_transition`); see `decision-request.ts`.
 * - `unknown-outcome`: a decision request may or may not have been committed
 *   (connection failure/timeout, 5xx, or an unreadable 2xx response). Callers
 *   must reconcile via a fresh read and must not resubmit automatically.
 * - `unavailable`: decisions are disabled in this environment; no request was
 *   sent.
 */
export type ActionsServiceErrorKind =
  | "network"
  | "http"
  | "malformed"
  | "not-found"
  | "conflict"
  | "unknown-outcome"
  | "unavailable";

/** Transport-neutral error: components read `kind`, never raw Response objects. */
export class ActionsServiceError extends Error {
  readonly kind: ActionsServiceErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: ActionsServiceErrorKind,
    message: string,
    details: { status?: number; code?: string; requestId?: string } = {},
  ) {
    super(message);
    this.name = "ActionsServiceError";
    this.kind = kind;
    this.status = details.status;
    this.code = details.code;
    this.requestId = details.requestId;
  }
}
