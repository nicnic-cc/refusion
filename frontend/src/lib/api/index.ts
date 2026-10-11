import { api } from "./client";
import type {
  APIResponse,
  ListResponse,
  PaginatedListResponse,
  LoginRequest,
  Group,
  Feed,
  Item,
  FullContent,
  Bookmark,
  CreateGroupRequest,
  UpdateGroupRequest,
  ReorderGroupsRequest,
  ReorderFeedsRequest,
  CreateFeedRequest,
  UpdateFeedRequest,
  ValidateFeedRequest,
  ValidateFeedResponse,
  CreateBookmarkRequest,
  MarkItemsReadRequest,
  MarkScopeReadRequest,
  ListItemsParams,
  FeedFilter,
  FilterRule,
  FilterPreview,
  GlobalFilter,
  GlobalFilterSaved,
  GlobalPreview,
  SaveFeedFilterRequest,
  ListBookmarksParams,
  BatchCreateFeedsRequest,
  BatchCreateFeedsResponse,
  SearchResponse,
  OIDCStatusResponse,
  OIDCLoginResponse,
  AppInfoResponse,
  Settings,
  UpdateSettingsRequest,
} from "./types";

// Session APIs
export const sessionAPI = {
  login: (data: LoginRequest) =>
    api.post<APIResponse<{ message: string }>>("/sessions", data),

  status: () => api.get<void>("/sessions"),

  logout: () => api.delete<void>("/sessions"),
};

// OIDC APIs
export const oidcAPI = {
  status: () => api.get<APIResponse<OIDCStatusResponse>>("/oidc/enabled"),

  login: () => api.get<APIResponse<OIDCLoginResponse>>("/oidc/login"),
};

// Group APIs
export const groupAPI = {
  list: () => api.get<ListResponse<Group>>("/groups"),

  get: (id: number) => api.get<APIResponse<Group>>(`/groups/${id}`),

  create: (data: CreateGroupRequest) =>
    api.post<APIResponse<Group>>("/groups", data),

  update: (id: number, data: UpdateGroupRequest) =>
    api.patch<APIResponse<Group>>(`/groups/${id}`, data),

  delete: (id: number) => api.delete<void>(`/groups/${id}`),

  reorder: (ids: ReorderGroupsRequest["ids"]) =>
    api.put<void>("/groups/order", { ids } satisfies ReorderGroupsRequest),
};

// Feed APIs
export const feedAPI = {
  list: () => api.get<ListResponse<Feed>>("/feeds"),

  get: (id: number) => api.get<APIResponse<Feed>>(`/feeds/${id}`),

  create: (data: CreateFeedRequest) =>
    api.post<APIResponse<Feed>>("/feeds", data),

  update: (id: number, data: UpdateFeedRequest) =>
    api.patch<APIResponse<Feed>>(`/feeds/${id}`, data),

  delete: (id: number) => api.delete<void>(`/feeds/${id}`),

  reorder: (groupId: number, ids: number[]) =>
    api.put<void>("/feeds/order", {
      group_id: groupId,
      ids,
    } satisfies ReorderFeedsRequest),

  validate: (data: ValidateFeedRequest) =>
    api.post<APIResponse<ValidateFeedResponse>>("/feeds/validate", data),

  refresh: () => api.post<void>("/feeds/refresh"),

  batchCreate: (data: BatchCreateFeedsRequest) =>
    api.post<APIResponse<BatchCreateFeedsResponse>>("/feeds/batch", data),
};

// Feed filter APIs
export const feedFilterAPI = {
  list: () => api.get<ListResponse<FeedFilter>>("/feed-filters"),

  save: (feedId: number, data: SaveFeedFilterRequest) =>
    api.put<APIResponse<FeedFilter>>(`/feeds/${feedId}/filter`, data),

  setEnabled: (feedId: number, enabled: boolean) =>
    api.patch<APIResponse<FeedFilter>>(`/feeds/${feedId}/filter`, { enabled }),

  delete: (feedId: number) => api.delete<void>(`/feeds/${feedId}/filter`),

  preview: (feedId: number, rule: FilterRule, signal?: AbortSignal) =>
    api.post<APIResponse<FilterPreview>>(
      `/feeds/${feedId}/filter/preview`,
      rule,
      signal,
    ),
};

// Global filter APIs; get() answers data: null when none is set.
export const globalFilterAPI = {
  get: () => api.get<APIResponse<GlobalFilter | null>>("/global-filter"),

  save: (data: SaveFeedFilterRequest) =>
    api.put<APIResponse<GlobalFilterSaved>>("/global-filter", data),

  setEnabled: (enabled: boolean) =>
    api.patch<APIResponse<GlobalFilterSaved>>("/global-filter", { enabled }),

  delete: () => api.delete<void>("/global-filter"),

  preview: (rule: FilterRule, signal?: AbortSignal) =>
    api.post<APIResponse<GlobalPreview>>(
      "/global-filter/preview",
      rule,
      signal,
    ),
};

// Item APIs
export const itemAPI = {
  list: (params?: ListItemsParams) => {
    const query = new URLSearchParams();
    if (params?.feed_id) query.set("feed_id", params.feed_id.toString());
    if (params?.group_id) query.set("group_id", params.group_id.toString());
    if (params?.unread !== undefined)
      query.set("unread", params.unread.toString());
    if (params?.limit) query.set("limit", params.limit.toString());
    if (params?.before) query.set("before", params.before);
    if (params?.order_by) query.set("order_by", params.order_by);
    if (params?.include_filtered) query.set("include_filtered", "true");

    const queryString = query.toString();
    return api.get<PaginatedListResponse<Item>>(
      `/items${queryString ? `?${queryString}` : ""}`,
    );
  },

  get: (id: number) => api.get<APIResponse<Item>>(`/items/${id}`),

  getFullContent: (id: number) =>
    api.get<APIResponse<FullContent>>(`/items/${id}/full-content`),

  markRead: (data: MarkItemsReadRequest) =>
    api.patch<void>("/items/-/read", data),

  markUnread: (data: MarkItemsReadRequest) =>
    api.patch<void>("/items/-/unread", data),

  markScopeRead: (data: MarkScopeReadRequest) =>
    api.patch<void>("/items/-/read-all", data),
};

// Bookmark APIs
export const bookmarkAPI = {
  list: (params: ListBookmarksParams = {}) => {
    const query = new URLSearchParams();
    if (params.feed_id) query.set("feed_id", params.feed_id.toString());
    if (params.group_id) query.set("group_id", params.group_id.toString());
    query.set("limit", (params.limit ?? 50).toString());
    if (params.before) query.set("before", params.before);
    return api.get<PaginatedListResponse<Bookmark>>(`/bookmarks?${query}`);
  },

  get: (id: number) => api.get<APIResponse<Bookmark>>(`/bookmarks/${id}`),

  create: (data: CreateBookmarkRequest) =>
    api.post<APIResponse<Bookmark>>("/bookmarks", data),

  delete: (id: number) => api.delete<void>(`/bookmarks/${id}`),
};

// Settings APIs
export const settingsAPI = {
  get: () => api.get<APIResponse<Settings>>("/settings"),

  update: (data: UpdateSettingsRequest) =>
    api.patch<APIResponse<Settings>>("/settings", data),
};

// Search APIs
export const searchAPI = {
  search: (q: string, limit = 10) =>
    api.get<APIResponse<SearchResponse>>(
      `/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    ),
};

// App APIs
export const appAPI = {
  getInfo: () => api.get<APIResponse<AppInfoResponse>>("/app"),
};

export * from "./types";
export * from "./pull";
export { APIError, setUnauthorizedCallback } from "./client";
