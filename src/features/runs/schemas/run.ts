import { z } from "zod";
import {
  agentIdentitySchema,
  runStatusSchema,
} from "@/features/approvals/contracts";

const timestampSchema = z.string().min(1).refine(
  (value) => !Number.isNaN(Date.parse(value)),
  { message: "Timestamp must be a valid ISO date string." },
);

export const runStepStatusSchema = z.enum([
  "queued",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
]);

export const runEventTypeSchema = z.enum([
  "run.started",
  "step.started",
  "step.completed",
  "step.failed",
  "approval.required",
  "approval.resolved",
  "run.completed",
  "run.failed",
  "run.cancelled",
]);

export const runEventPayloadSchema = z.strictObject({
  actionId: z.string().min(1).optional(),
  decision: z.enum(["approved", "rejected"]).optional(),
  message: z.string().max(500).optional(),
});

export const runEventSchema = z.strictObject({
  id: z.string().min(1).max(128),
  runId: z.string().min(1).max(64),
  sequence: z.number().int().positive(),
  type: runEventTypeSchema,
  timestamp: timestampSchema,
  stepId: z.string().min(1).max(64).optional(),
  payload: runEventPayloadSchema.optional(),
});

export const runStepSchema = z.strictObject({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  status: runStepStatusSchema,
  startedAt: timestampSchema.optional(),
  completedAt: timestampSchema.optional(),
  durationMs: z.number().int().nonnegative().optional(),
  actionId: z.string().min(1).max(64).optional(),
  errorSummary: z.string().min(1).max(500).optional(),
});

export const runSummarySchema = z.strictObject({
  id: z.string().min(1).max(64),
  status: runStatusSchema,
  summary: z.string().min(1).max(500),
  actionIds: z.array(z.string().min(1).max(64)),
  startedAt: timestampSchema,
  completedAt: timestampSchema.optional(),
  currentStep: z.string().max(120).optional(),
  agent: agentIdentitySchema,
});

export const runDetailSchema = runSummarySchema.extend({
  steps: z.array(runStepSchema),
  events: z.array(runEventSchema),
  resultSummary: z.string().max(500).optional(),
  errorSummary: z.string().max(500).optional(),
});

export const runListResponseSchema = z.strictObject({
  items: z.array(runSummarySchema),
});

export const runDetailResponseSchema = z.strictObject({
  run: runDetailSchema,
});

export type RunStepStatus = z.infer<typeof runStepStatusSchema>;
export type RunEventType = z.infer<typeof runEventTypeSchema>;
export type RunEventPayload = z.infer<typeof runEventPayloadSchema>;
export type RunEvent = z.infer<typeof runEventSchema>;
export type RunStep = z.infer<typeof runStepSchema>;
export type RunSummary = z.infer<typeof runSummarySchema>;
export type RunDetail = z.infer<typeof runDetailSchema>;
export type RunListResponse = z.infer<typeof runListResponseSchema>;
