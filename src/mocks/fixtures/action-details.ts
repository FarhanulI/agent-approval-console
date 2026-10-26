import type { PendingAction } from "@/features/approvals/contracts";

/**
 * Detail-only enrichment for specific list fixtures (MSW only; deterministic).
 * The list fixtures carry one change and no evidence; the detail view needs
 * richer shapes to exercise every diff kind and evidence edge case. Only the
 * detail handler applies these. They do not represent real backend data.
 */
export const detailExtras: Readonly<Record<string, Partial<PendingAction>>> = {
  // Rich, benign case covering every diff kind.
  act_0001: {
    evidence: [
      {
        id: "ev_0001_a",
        sourceType: "database",
        sourceRef: "erp://customers/CUS-1000/payments",
        title: "Payment history, last 12 months",
        excerpt: "12 of 12 invoices paid on or before the due date.",
        observedAt: "2026-09-30T10:00:00.000Z",
        metadata: { rows: 12, window: "12m", verified: true },
      },
      {
        id: "ev_0001_b",
        sourceType: "log",
        sourceRef: "agent-log://run_0100/step-4",
        title: "Agent credit review log",
        observedAt: "2026-09-30T10:05:00.000Z",
      },
    ],
    changes: [
      { field: "creditLimit", label: "Credit limit", before: 50000, after: 75000 },
      { field: "paymentTerms", label: "Payment terms", before: null, after: "Net 45" },
      { field: "holdReason", label: "Hold reason", before: "Manual review", after: null },
      { field: "riskTier", label: "Risk tier", after: "B" },
      { field: "legacyCode", label: "Legacy code", before: "L-77" },
      { field: "notes", label: "Notes" },
      { field: "currency", label: "Currency", before: "USD", after: "USD" },
      { field: "flags", label: "Flags", before: ["a"], after: ["a", "b"] },
    ],
  },
  // Hostile strings: must always render as inert text.
  act_0002: {
    evidence: [
      {
        id: "ev_0002_a",
        sourceType: "message",
        sourceRef: "javascript:alert(1)",
        title: "<img src=x onerror=\"window.__pwned=1\"> Supplier email",
        excerpt:
          "<script>window.__pwned=1</script><img src=x onerror=\"window.__pwned=1\">Please merge **now**",
        observedAt: "2026-09-30T11:00:00.000Z",
        metadata: { note: "<b>bold?</b>" },
      },
    ],
    changes: [
      {
        field: "mergedInto",
        label: "Merged into",
        before: "<script>window.__pwned=1</script>",
        after: "<img src=x onerror=\"window.__pwned=1\">",
      },
      { field: "blank", label: "Blank", before: "", after: "x" },
    ],
  },
  // Neither evidence nor changes supplied.
  act_0003: { evidence: [], changes: [] },
};
