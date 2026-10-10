import { api } from "./client";
import type { APIResponse } from "./types";

export interface PullStatus {
  pending: number[];
  new_items: number;
  // Highest item id on the server; 0 when there are no items.
  last_item_id: number;
}

export interface NewCountParams {
  after_id: number;
  feed_id?: number;
  group_id?: number;
}

export interface StartPullRequest {
  feed_id?: number;
  group_id?: number;
}

export interface StartPullResponse {
  queued: number;
}

export const pullAPI = {
  status: () => api.get<APIResponse<PullStatus>>("/pull/status"),

  newCount: (params: NewCountParams) => {
    const q = new URLSearchParams({ after_id: String(params.after_id) });
    if (params.feed_id) q.set("feed_id", String(params.feed_id));
    if (params.group_id) q.set("group_id", String(params.group_id));
    return api.get<APIResponse<{ count: number }>>(`/pull/new-count?${q}`);
  },

  start: (data: StartPullRequest = {}) =>
    api.post<APIResponse<StartPullResponse>>("/pull", data),
};
