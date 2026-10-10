import { api } from "./client";
import type { APIResponse } from "./types";

export interface PullStatus {
  pending: number[];
  new_items: number;
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

  start: (data: StartPullRequest = {}) =>
    api.post<APIResponse<StartPullResponse>>("/pull", data),
};
