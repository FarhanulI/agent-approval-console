import { z } from "zod";
import { approvalStatusSchema } from "../contracts";

export const MAX_BULK_DECISIONS = 25;

const ACTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export const bulkDecisionItemRequestSchema = z.strictObject({
  actionId: z.string().regex(ACTION_ID_PATTERN),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().max(2000).optional(),
  recordVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().regex(IDEMPOTENCY_KEY_PATTERN),
});

export const bulkDecisionRequestSchema = z
  .strictObject({
    decisions: z
      .array(bulkDecisionItemRequestSchema)
      .min(1)
      .max(MAX_BULK_DECISIONS),
  })
  .superRefine(({ decisions }, context) => {
    const actionIds = new Set<string>();
    const idempotencyKeys = new Set<string>();

    decisions.forEach((item, index) => {
      if (actionIds.has(item.actionId)) {
        context.addIssue({
          code: "custom",
          path: ["decisions", index, "actionId"],
          message: "Each action may appear only once in a bulk request.",
        });
      }
      if (idempotencyKeys.has(item.idempotencyKey)) {
        context.addIssue({
          code: "custom",
          path: ["decisions", index, "idempotencyKey"],
          message: "Each decision must use a distinct idempotency key.",
        });
      }
      actionIds.add(item.actionId);
      idempotencyKeys.add(item.idempotencyKey);
    });
  });

export const bulkDecisionOutcomeSchema = z.enum([
  "approved",
  "rejected",
  "conflict",
  "forbidden",
  "failed",
  "outcome_unknown",
]);

export const bulkDecisionItemResultSchema = z
  .strictObject({
    actionId: z.string().regex(ACTION_ID_PATTERN),
    decision: z.enum(["approve", "reject"]),
    outcome: bulkDecisionOutcomeSchema,
    status: approvalStatusSchema.optional(),
    recordVersion: z.number().int().nonnegative().optional(),
    message: z.string().min(1).max(300),
  })
  .superRefine((item, context) => {
    const expectedStatus =
      item.outcome === "approved"
        ? "approved"
        : item.outcome === "rejected"
          ? "rejected"
          : undefined;

    if (expectedStatus && item.status !== expectedStatus) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "A confirmed decision must include its resulting status.",
      });
    }
    if (
      (item.outcome === "approved" && item.decision !== "approve") ||
      (item.outcome === "rejected" && item.decision !== "reject")
    ) {
      context.addIssue({
        code: "custom",
        path: ["outcome"],
        message: "The confirmed outcome must match the requested decision.",
      });
    }
    if (expectedStatus && item.recordVersion === undefined) {
      context.addIssue({
        code: "custom",
        path: ["recordVersion"],
        message: "A confirmed decision must include its resulting record version.",
      });
    }
    if (!expectedStatus && item.status !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Only a confirmed decision may include a resulting status.",
      });
    }
  });

export const bulkDecisionResultSchema = z
  .strictObject({
    results: z
      .array(bulkDecisionItemResultSchema)
      .min(1)
      .max(MAX_BULK_DECISIONS),
  })
  .superRefine(({ results }, context) => {
    const actionIds = new Set<string>();
    results.forEach((item, index) => {
      if (actionIds.has(item.actionId)) {
        context.addIssue({
          code: "custom",
          path: ["results", index, "actionId"],
          message: "Each action may have only one result.",
        });
      }
      actionIds.add(item.actionId);
    });
  });

export type BulkDecisionItemRequest = z.infer<
  typeof bulkDecisionItemRequestSchema
>;
export type BulkDecisionRequest = z.infer<typeof bulkDecisionRequestSchema>;
export type BulkDecisionOutcome = z.infer<typeof bulkDecisionOutcomeSchema>;
export type BulkDecisionItemResult = z.infer<
  typeof bulkDecisionItemResultSchema
>;
export type BulkDecisionResult = z.infer<typeof bulkDecisionResultSchema>;
