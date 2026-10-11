// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useMissingScopeRedirect } from "./use-missing-scope-redirect";

const selectTopLevelFilter = vi.fn();
let url = { selectedFeedId: null as number | null, selectedGroupId: null as number | null };
let feedsQuery = {} as Record<string, unknown>;
let groupsQuery = {} as Record<string, unknown>;

vi.mock("./use-url-state", () => ({
  useUrlState: () => ({ ...url, selectTopLevelFilter }),
}));
vi.mock("@/queries/feeds", () => ({ useFeeds: () => feedsQuery }));
vi.mock("@/queries/groups", () => ({ useGroups: () => groupsQuery }));

const loaded = (ids: number[]) => ({
  data: ids.map((id) => ({ id })),
  isSuccess: true,
  isFetching: false,
});
const loading = { data: undefined, isSuccess: false, isFetching: true };

afterEach(() => {
  cleanup();
  selectTopLevelFilter.mockClear();
  url = { selectedFeedId: null, selectedGroupId: null };
});

describe("useMissingScopeRedirect", () => {
  it("redirects to the default filter when the URL feed is not in the list", () => {
    url = { selectedFeedId: 999, selectedGroupId: null };
    feedsQuery = loaded([1, 2]);
    groupsQuery = loaded([1]);
    renderHook(() => useMissingScopeRedirect());
    expect(selectTopLevelFilter).toHaveBeenCalledWith("unread");
  });

  it("redirects when the URL group is not in the list", () => {
    url = { selectedFeedId: null, selectedGroupId: 999 };
    feedsQuery = loaded([1]);
    groupsQuery = loaded([1, 2]);
    renderHook(() => useMissingScopeRedirect());
    expect(selectTopLevelFilter).toHaveBeenCalledWith("unread");
  });

  it("waits while the list is loading", () => {
    url = { selectedFeedId: 999, selectedGroupId: null };
    feedsQuery = loading;
    groupsQuery = loaded([]);
    renderHook(() => useMissingScopeRedirect());
    expect(selectTopLevelFilter).not.toHaveBeenCalled();
  });

  it("stays put when the feed exists", () => {
    url = { selectedFeedId: 2, selectedGroupId: null };
    feedsQuery = loaded([1, 2]);
    groupsQuery = loaded([]);
    renderHook(() => useMissingScopeRedirect());
    expect(selectTopLevelFilter).not.toHaveBeenCalled();
  });

  it("does not act on a failed fetch", () => {
    url = { selectedFeedId: 999, selectedGroupId: null };
    feedsQuery = { data: undefined, isSuccess: false, isFetching: false };
    groupsQuery = loaded([]);
    renderHook(() => useMissingScopeRedirect());
    expect(selectTopLevelFilter).not.toHaveBeenCalled();
  });
});
