// Core data models (matching backend/internal/model/model.go)
export interface Group {
  id: number;
  name: string;
  created_at: number;
  updated_at: number;
}

export interface Feed {
  id: number;
  group_id: number;
  name: string;
  link: string;
  site_url?: string;
  suspended: boolean;
  proxy?: string;
  refresh_interval_seconds?: number | null;
  full_content: boolean;
  created_at: number;
  updated_at: number;
  fetch_state: FeedFetchState;
  unread_count: number;
  item_count: number;
}

export interface FeedFetchState {
  etag?: string;
  last_modified?: string;
  cache_control?: string;
  expires_at: number;
  last_checked_at: number;
  next_check_at: number;
  last_http_status: number;
  retry_after_until: number;
  last_success_at: number;
  last_error_at: number;
  last_error?: string;
  consecutive_failures: number;
}

export interface Item {
  id: number;
  feed_id: number;
  guid: string;
  title: string;
  link: string;
  content: string;
  pub_date: number;
  unread: boolean;
  filtered: boolean;
  // Hidden by the global filter and not by the feed's own; implies filtered.
  filtered_global: boolean;
  created_at: number;
}

export interface FullContent {
  title: string;
  content: string;
}

export interface Bookmark {
  id: number;
  item_id: number | null;
  link: string;
  title: string;
  content: string;
  pub_date: number;
  feed_name: string;
  feed_id: number | null;
  unread: boolean;
  created_at: number;
}

// User preferences synced via the backend. A null field means the user has
// never explicitly chosen a value; clients fall back to their own defaults.
export interface Settings {
  locale: string | null;
  article_page_size: number | null;
  theme: string | null;
  auto_mark_read: string | null;
  updated_at: number;
}

// Only the fields being changed are sent; a missing field leaves the stored
// value unchanged (indistinguishable from an explicit null on the wire).
export interface UpdateSettingsRequest {
  locale?: string;
  article_page_size?: number;
  theme?: string;
  auto_mark_read?: string;
}

// API response wrappers
export interface APIResponse<T> {
  data?: T;
  error?: string;
}

// Group and feed lists: small, fully returned in one response
export interface ListResponse<T> {
  data: T[];
  total: number;
}

// Item and bookmark lists: cursor-paginated (see docs/api-conventions.md)
export interface PaginatedListResponse<T> {
  data: T[];
  total: number;
  next_cursor: string | null;
}

// Request types
export interface LoginRequest {
  password: string;
}

export interface CreateGroupRequest {
  name: string;
}

export interface UpdateGroupRequest {
  name: string;
}

export interface ReorderGroupsRequest {
  ids: number[];
}

export interface ReorderFeedsRequest {
  group_id: number;
  ids: number[];
}

export interface CreateFeedRequest {
  group_id: number;
  name: string;
  link: string;
  site_url?: string;
  proxy?: string;
  refresh_interval_seconds?: number | null;
  full_content?: boolean;
}

export interface UpdateFeedRequest {
  group_id?: number;
  name?: string;
  link?: string;
  site_url?: string;
  suspended?: boolean;
  proxy?: string;
  refresh_interval_seconds?: number | null;
  full_content?: boolean;
}

export interface ValidateFeedRequest {
  url: string;
  proxy?: string;
}

export interface DiscoveredFeed {
  title: string;
  link: string;
}

export interface ValidateFeedResponse {
  feeds: DiscoveredFeed[];
}

// Two mutually exclusive modes: either reference an item by id (the backend
// snapshots all fields from it and ignores everything else — preferred), or
// provide a full snapshot for bookmarks without a backing item.
export type CreateBookmarkRequest =
  | { item_id: number }
  | {
      link: string;
      title: string;
      content: string;
      feed_name: string;
      pub_date?: number;
    };

export interface MarkItemsReadRequest {
  ids: number[];
}

export interface MarkScopeReadRequest {
  max_id: number;
  feed_id?: number;
  group_id?: number;
}

export interface ListItemsParams {
  feed_id?: number;
  group_id?: number;
  unread?: boolean;
  limit?: number;
  before?: string;
  order_by?: "pub_date" | "created_at";
  // Only valid together with feed_id.
  include_filtered?: boolean;
}

export type FilterAction = "remove" | "keep";
export type FilterJoin = "and" | "or";
export type FilterTextTrigger =
  | "title"
  | "content"
  | "title_or_content"
  | "url"
  | "url_path";
export type FilterMediaTrigger =
  | "has_pictures"
  | "no_pictures"
  | "has_video"
  | "no_video";
export type FilterTrigger = FilterTextTrigger | FilterMediaTrigger;
export type FilterOperator =
  | "contains"
  | "not_contains"
  | "is"
  | "is_not"
  | "begins_with"
  | "ends_with"
  | "regex"
  | "not_regex";

// operator and value are unused by the picture and video triggers.
export interface FilterCondition {
  trigger: FilterTrigger;
  operator?: FilterOperator;
  value?: string;
}

export interface FilterRule {
  action: FilterAction;
  join: FilterJoin;
  whole_words: boolean;
  conditions: FilterCondition[];
}

export interface FeedFilter extends FilterRule {
  feed_id: number;
  enabled: boolean;
  updated_at: number;
}

// GET /filters/hidden-counts, keyed by feed id; only feeds hiding something.
// feed: hidden by the feed's own filter; global: by the global filter alone.
export interface HiddenCounts {
  feed: number;
  global: number;
}

// PUT /feeds/:id/filter; enabled defaults to true.
export interface SaveFeedFilterRequest extends FilterRule {
  enabled?: boolean;
}

export interface FilterPreviewItem {
  id: number;
  title: string;
  pub_date: number;
  hidden: boolean;
  // Already hidden by the saved global filter.
  global_hidden: boolean;
}

export interface FilterPreview {
  checked: number;
  hidden: number;
  // Articles the saved global filter hides, apart from the draft's `hidden`.
  global_hidden: number;
  items: FilterPreviewItem[];
}

// The one filter for all feeds; Remove only, so action is always "remove".
export interface GlobalFilter extends FilterRule {
  enabled: boolean;
  updated_at: number;
}

// PUT and PATCH /global-filter; hidden_total counts every article hidden by
// any filter after the re-check.
export interface GlobalFilterSaved extends GlobalFilter {
  hidden_total: number;
}

export interface GlobalPreviewItem {
  id: number;
  feed_id: number;
  feed_name: string;
  title: string;
  pub_date: number;
  hidden: boolean;
}

// Runs over the latest articles of all feeds only, so `hidden` is a sample.
export interface GlobalPreview {
  checked: number;
  hidden: number;
  items: GlobalPreviewItem[];
}

export interface ListBookmarksParams {
  feed_id?: number;
  group_id?: number;
  limit?: number;
  before?: string;
}

export interface BatchCreateFeedsRequest {
  feeds: Array<{
    group_id: number;
    name: string;
    link: string;
    site_url?: string;
  }>;
}

export interface SearchFeed {
  id: number;
  name: string;
  link: string;
  site_url: string;
}

export interface TextPart {
  text: string;
  hit: boolean;
}

export interface SearchItem {
  id: number;
  feed_id: number;
  title: string;
  title_parts: TextPart[];
  excerpt_parts: TextPart[];
  pub_date: number;
}

export interface SearchResponse {
  feeds: SearchFeed[];
  items: SearchItem[];
}

export interface BatchCreateFeedsResponse {
  created: number;
  failed: number;
  // Always present on the wire; null when every feed was created.
  errors: string[] | null;
}

export interface AppInfoResponse {
  pull_interval: number;
  allowed_refresh_intervals: number[];
}

// OIDC
export interface OIDCStatusResponse {
  enabled: boolean;
}

export interface OIDCLoginResponse {
  auth_url: string;
}
