export const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

export class APIError extends Error {
  status: number;
  // True only when `message` came from the server's JSON `error` field.
  hasServerMessage: boolean;

  constructor(status: number, message: string, hasServerMessage = false) {
    super(message);
    this.status = status;
    this.hasServerMessage = hasServerMessage;
    this.name = "APIError";
  }
}

// Server messages for 4xx (e.g. "feed link already exists") are written for
// users; anything else gets the caller's generic string.
export function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof APIError &&
    error.hasServerMessage &&
    error.status >= 400 &&
    error.status < 500
    ? error.message
    : fallback;
}

// Non-JSON bodies (e.g. a proxy's HTML page) and JSON without a string
// `error` yield no message.
async function serverErrorMessage(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body) {
      const message = body.error;
      if (typeof message === "string" && message !== "") return message;
    }
  } catch {
    // not JSON
  }
  return null;
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

    const serverMessage = await serverErrorMessage(response);
    throw new APIError(
      response.status,
      serverMessage ?? `HTTP ${response.status}`,
      serverMessage !== null,
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
