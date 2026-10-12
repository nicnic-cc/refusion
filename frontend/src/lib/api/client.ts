const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

export class APIError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "APIError";
  }
}

// Callback for handling 401 errors
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedCallback(callback: () => void) {
  onUnauthorized = callback;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  silentUnauthorized = false,
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    // A 401 from /sessions is handled by its callers (the login form shows an
    // error toast, the route guard redirects); the global redirect here would
    // reload the page and destroy that feedback. silentUnauthorized leaves the
    // decision to a caller that runs alongside the session probe.
    if (
      response.status === 401 &&
      onUnauthorized &&
      endpoint !== "/sessions" &&
      !silentUnauthorized
    ) {
      onUnauthorized();
    }

    const error = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new APIError(
      response.status,
      error.error || `HTTP ${response.status}`,
    );
  }

  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return undefined as T;
  }

  const body = await response.text();
  if (!body) {
    return undefined as T;
  }

  return JSON.parse(body) as T;
}

async function get<T>(
  endpoint: string,
  silentUnauthorized = false,
): Promise<T> {
  return request<T>(endpoint, { method: "GET" }, silentUnauthorized);
}

async function post<T>(
  endpoint: string,
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return request<T>(endpoint, {
    method: "POST",
    body: data ? JSON.stringify(data) : undefined,
    signal,
  });
}

async function put<T>(endpoint: string, data?: unknown): Promise<T> {
  return request<T>(endpoint, {
    method: "PUT",
    body: data ? JSON.stringify(data) : undefined,
  });
}

async function patch<T>(endpoint: string, data?: unknown): Promise<T> {
  return request<T>(endpoint, {
    method: "PATCH",
    body: data ? JSON.stringify(data) : undefined,
  });
}

async function del<T>(endpoint: string): Promise<T> {
  return request<T>(endpoint, { method: "DELETE" });
}

export const api = {
  get,
  post,
  put,
  patch,
  delete: del,
};
