import { describe, expect, it } from "vitest";
import type { QueueState } from "../types";
import { serializeActionListQuery } from "./action-list-query";
import {
  DEFAULT_SORT,
  PAGE_SIZE,
  clearFilters,
  hasActiveFilters,
  lastPage,
  parseQueueState,
  serializeQueueState,
  sortToSortingState,
  sortingStateToSort,
  toActionListQuery,
} from "./queue-state";

const params = (query: string) => new URLSearchParams(query);

describe("parseQueueState", () => {
  it("returns defaults for an empty URL", () => {
    expect(parseQueueState(params(""))).toEqual({
      search: "",
      status: undefined,
      risk: undefined,
      sort: DEFAULT_SORT,
      page: 1,
    });
  });

  it("reads valid filters, sort and page", () => {
    expect(
      parseQueueState(params("q=%20credit%20&status=pending&risk=high&sort=risk&page=3")),
    ).toEqual({
      search: "credit",
      status: "pending",
      risk: "high",
      sort: { field: "risk", direction: "asc" },
      page: 3,
    });
  });

  it("parses a descending sort prefix", () => {
    expect(parseQueueState(params("sort=-risk")).sort).toEqual({
      field: "risk",
      direction: "desc",
    });
  });

  it("drops invalid values instead of throwing", () => {
    const state = parseQueueState(
      params("status=bogus&risk=extreme&sort=owner&page=-2"),
    );
    expect(state.status).toBeUndefined();
    expect(state.risk).toBeUndefined();
    expect(state.sort).toEqual(DEFAULT_SORT);
    expect(state.page).toBe(1);
    expect(parseQueueState(params("page=abc")).page).toBe(1);
  });

  it("caps the search length", () => {
    expect(parseQueueState(params(`q=${"a".repeat(500)}`)).search).toHaveLength(200);
  });
});

describe("serializeQueueState", () => {
  it("omits defaults so the canonical URL is empty", () => {
    expect(serializeQueueState(parseQueueState(params(""))).toString()).toBe("");
  });

  it("round-trips non-default state", () => {
    const state: QueueState = {
      search: "tax code",
      status: "failed",
      risk: "critical",
      sort: { field: "risk", direction: "desc" },
      page: 2,
    };
    expect(parseQueueState(serializeQueueState(state))).toEqual(state);
  });
});

describe("toActionListQuery", () => {
  it("maps UI state to the API query", () => {
    const query = toActionListQuery({
      search: "  invoice ",
      status: "pending",
      risk: undefined,
      sort: { field: "createdAt", direction: "asc" },
      page: 2,
    });
    expect(query).toEqual({
      page: 2,
      pageSize: PAGE_SIZE,
      status: "pending",
      risk: undefined,
      search: "invoice",
      sortBy: "createdAt",
      sortDirection: "asc",
    });
  });

  it("serialises only meaningful parameters", () => {
    const query = toActionListQuery(parseQueueState(params("q=abc&risk=low")));
    expect(serializeActionListQuery(query).toString()).toBe(
      "page=1&pageSize=10&risk=low&search=abc&sortBy=createdAt&sortDirection=desc",
    );
  });
});

describe("sorting mapping", () => {
  it("converts between UI sort and TanStack sorting state", () => {
    const sort = { field: "risk", direction: "desc" } as const;
    expect(sortToSortingState(sort)).toEqual([{ id: "risk", desc: true }]);
    expect(sortingStateToSort([{ id: "risk", desc: true }])).toEqual(sort);
    expect(sortingStateToSort([{ id: "createdAt", desc: false }])).toEqual({
      field: "createdAt",
      direction: "asc",
    });
  });

  it("rejects columns the server cannot sort by", () => {
    expect(sortingStateToSort([{ id: "status", desc: false }])).toBeNull();
    expect(sortingStateToSort([])).toBeNull();
  });
});

describe("filters and pagination helpers", () => {
  it("detects and clears active filters but keeps sort", () => {
    const state: QueueState = {
      search: "x",
      status: "pending",
      risk: "low",
      sort: { field: "risk", direction: "asc" },
      page: 4,
    };
    expect(hasActiveFilters(state)).toBe(true);
    const cleared = clearFilters(state);
    expect(hasActiveFilters(cleared)).toBe(false);
    expect(cleared.page).toBe(1);
    expect(cleared.sort).toEqual(state.sort);
  });

  it("computes the last page, never below 1", () => {
    expect(lastPage(0, 10)).toBe(1);
    expect(lastPage(10, 10)).toBe(1);
    expect(lastPage(11, 10)).toBe(2);
    expect(lastPage(47, 10)).toBe(5);
  });
});
