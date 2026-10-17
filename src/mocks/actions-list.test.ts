import { describe, expect, it } from "vitest";
import { pendingActionSchema } from "@/features/approvals/contracts";
import { queryActions } from "./actions-list";
import { actionFixtures } from "./fixtures/actions";

describe("action fixtures", () => {
  it("are valid against the domain schema with unique ids", () => {
    for (const action of actionFixtures) {
      expect(pendingActionSchema.safeParse(action).success).toBe(true);
    }
    expect(new Set(actionFixtures.map((a) => a.id)).size).toBe(actionFixtures.length);
  });

  it("cover several statuses and every risk level", () => {
    expect(new Set(actionFixtures.map((a) => a.status)).size).toBeGreaterThan(5);
    expect(new Set(actionFixtures.map((a) => a.risk))).toEqual(
      new Set(["low", "medium", "high", "critical"]),
    );
  });

  it("are deterministic", async () => {
    const again = (await import("./fixtures/actions")).actionFixtures;
    expect(again).toBe(actionFixtures);
    expect(actionFixtures[0].createdAt).toBe("2026-10-01T08:00:00.000Z");
  });
});

describe("queryActions", () => {
  it("paginates with a total that reflects the filtered set", () => {
    const first = queryActions(actionFixtures, { page: 1, pageSize: 10 });
    expect(first.items).toHaveLength(10);
    expect(first.pagination).toEqual({ page: 1, pageSize: 10, total: actionFixtures.length });

    const last = queryActions(actionFixtures, { page: 5, pageSize: 10 });
    expect(last.items).toHaveLength(actionFixtures.length - 40);
  });

  it("returns an empty page beyond the end but keeps the real total", () => {
    const result = queryActions(actionFixtures, { page: 99, pageSize: 10 });
    expect(result.items).toEqual([]);
    expect(result.pagination.total).toBe(actionFixtures.length);
  });

  it("defaults to newest first", () => {
    const { items } = queryActions(actionFixtures, { pageSize: 100 });
    const times = items.map((a) => Date.parse(a.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("sorts by createdAt ascending", () => {
    const { items } = queryActions(actionFixtures, {
      pageSize: 100,
      sortBy: "createdAt",
      sortDirection: "asc",
    });
    const times = items.map((a) => Date.parse(a.createdAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("sorts by risk severity, not alphabetically", () => {
    const { items } = queryActions(actionFixtures, {
      pageSize: 100,
      sortBy: "risk",
      sortDirection: "desc",
    });
    expect(items[0].risk).toBe("critical");
    expect(items.at(-1)?.risk).toBe("low");
  });

  it("filters by status and risk together", () => {
    const { items, pagination } = queryActions(actionFixtures, {
      pageSize: 100,
      status: "pending",
      risk: "high",
    });
    expect(items.length).toBe(pagination.total);
    expect(items.every((a) => a.status === "pending" && a.risk === "high")).toBe(true);
  });

  it("searches case-insensitively across title, target and agent", () => {
    const byTitle = queryActions(actionFixtures, { search: "CREDIT LIMIT", pageSize: 100 });
    expect(byTitle.items.length).toBeGreaterThan(0);
    expect(byTitle.items.every((a) => a.title.toLowerCase().includes("credit limit"))).toBe(true);

    const byAgent = queryActions(actionFixtures, { search: "inventory agent", pageSize: 100 });
    expect(byAgent.items.every((a) => a.agent?.name === "Inventory Agent")).toBe(true);
  });

  it("returns an empty result for a search with no matches", () => {
    expect(queryActions(actionFixtures, { search: "zzz-no-match" })).toEqual({
      items: [],
      pagination: { page: 1, pageSize: 10, total: 0 },
    });
  });
});
