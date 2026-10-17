import { z } from "zod";

const dateTimeStringSchema = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Timestamp must be a valid ISO date string.",
  });

export const approvalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "expired",
  "cancelled",
  "executing",
  "executed",
  "failed",
  "conflict",
]);

export const runStatusSchema = z.enum([
  "queued",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
  "blocked",
  "rejected",
]);

export const riskLevelSchema = z.enum(["low", "medium", "high", "critical"]);

export const evidenceSourceTypeSchema = z.enum([
  "log",
  "database",
  "api",
  "file",
  "snapshot",
  "message",
]);

export const apiScalarValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
]);

export const recordChangeSchema = z.object({
  field: z.string().min(1),
  label: z.string().min(1),
  before: apiScalarValueSchema.optional(),
  after: apiScalarValueSchema.optional(),
});

export const evidenceSchema = z.object({
  id: z.string().min(1),
  sourceType: evidenceSourceTypeSchema,
  sourceRef: z.string().min(1),
  title: z.string().min(1),
  excerpt: z.string().max(4000).optional(),
  observedAt: dateTimeStringSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const targetRecordSchema = z.object({
  entity: z.string().min(1),
  recordId: z.string().min(1),
  label: z.string().min(1),
  tenantId: z.string().optional(),
});

export const agentIdentitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  model: z.string().optional(),
});

export const pendingActionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  status: approvalStatusSchema,
  risk: riskLevelSchema,
  targetRecord: targetRecordSchema,
  recordVersion: z.number().int().nonnegative(),
  changes: z.array(recordChangeSchema).default([]),
  evidence: z.array(evidenceSchema).default([]),
  runId: z.string().optional(),
  agent: agentIdentitySchema.optional(),
  createdAt: dateTimeStringSchema,
  updatedAt: dateTimeStringSchema,
  decisionDeadline: dateTimeStringSchema.optional(),
});

export const agentRunSchema = z.object({
  id: z.string().min(1),
  status: runStatusSchema,
  summary: z.string().min(1),
  actionIds: z.array(z.string().min(1)).default([]),
  startedAt: dateTimeStringSchema,
  completedAt: dateTimeStringSchema.optional(),
  currentStep: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const auditEventSchema = z.object({
  id: z.string().min(1),
  actorType: z.enum(["user", "system", "agent"]),
  actorId: z.string().min(1),
  eventType: z.string().min(1),
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  outcome: z.enum(["success", "failure", "partial", "rejected", "pending"]),
  timestamp: dateTimeStringSchema,
  requestId: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  requestId: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const apiErrorResponseSchema = z.object({
  error: apiErrorSchema,
});

export const paginationSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().nonnegative(),
});

export const actionListResponseSchema = z.object({
  items: z.array(pendingActionSchema),
  pagination: paginationSchema,
});

export const actionDecisionRequestSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().max(2000).optional(),
  recordVersion: z.number().int().nonnegative(),
  actorId: z.string().min(1),
});

export const decisionResultSchema = z.object({
  actionId: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  status: approvalStatusSchema,
  recordVersion: z.number().int().nonnegative(),
  message: z.string().min(1),
});

export const bulkDecisionRequestSchema = z.object({
  decisions: z.array(
    z.object({
      actionId: z.string().min(1),
      decision: z.enum(["approve", "reject"]),
      reason: z.string().max(2000).optional(),
      recordVersion: z.number().int().nonnegative(),
    }),
  ),
  actorId: z.string().min(1),
});

export const bulkDecisionResultSchema = z.object({
  results: z.array(decisionResultSchema),
  acceptedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
});

export const auditEventListResponseSchema = z.object({
  items: z.array(auditEventSchema),
  pagination: paginationSchema,
});

export const runDetailResponseSchema = z.object({
  run: agentRunSchema,
});

export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;
export type RunStatus = z.infer<typeof runStatusSchema>;
export type RiskLevel = z.infer<typeof riskLevelSchema>;
export type EvidenceSourceType = z.infer<typeof evidenceSourceTypeSchema>;
export type ApiScalarValue = z.infer<typeof apiScalarValueSchema>;
export type RecordChange = z.infer<typeof recordChangeSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type TargetRecord = z.infer<typeof targetRecordSchema>;
export type AgentIdentity = z.infer<typeof agentIdentitySchema>;
export type PendingAction = z.infer<typeof pendingActionSchema>;
export type AgentRun = z.infer<typeof agentRunSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
export type ActionListResponse = z.infer<typeof actionListResponseSchema>;
export type ActionDecisionRequest = z.infer<typeof actionDecisionRequestSchema>;
export type DecisionResult = z.infer<typeof decisionResultSchema>;
export type BulkDecisionRequest = z.infer<typeof bulkDecisionRequestSchema>;
export type BulkDecisionResult = z.infer<typeof bulkDecisionResultSchema>;
export type AuditEventListResponse = z.infer<typeof auditEventListResponseSchema>;
export type RunDetailResponse = z.infer<typeof runDetailResponseSchema>;

export type ActionQuery = {
  page?: number;
  pageSize?: number;
  status?: ApprovalStatus;
  risk?: RiskLevel;
  search?: string;
};

export type AuditQuery = {
  page?: number;
  pageSize?: number;
  actorId?: string;
  eventType?: string;
  resourceType?: string;
  startDate?: string;
  endDate?: string;
};

export interface ApprovalApiContract {
  getActions(params?: ActionQuery): Promise<ActionListResponse>;
  getAction(actionId: string): Promise<PendingAction>;
  approveAction(actionId: string, payload: ActionDecisionRequest): Promise<DecisionResult>;
  rejectAction(actionId: string, payload: ActionDecisionRequest): Promise<DecisionResult>;
  bulkDecision(payload: BulkDecisionRequest): Promise<BulkDecisionResult>;
  getRun(runId: string): Promise<AgentRun>;
  getAuditEvents(params?: AuditQuery): Promise<AuditEventListResponse>;
}
