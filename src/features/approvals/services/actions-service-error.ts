export type ActionsServiceErrorKind = "network" | "http" | "malformed";

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
