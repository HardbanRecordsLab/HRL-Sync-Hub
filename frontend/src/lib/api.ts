// Central API client — every call goes through the VPS backend.
const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

const TOKEN_KEY = "hrl_token";
let _token: string | null = null;

export function setToken(t: string | null) {
  _token = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode / storage disabled */
  }
}

export function getToken(): string | null {
  if (_token) return _token;
  try {
    _token = localStorage.getItem(TOKEN_KEY);
  } catch {
    _token = null;
  }
  return _token;
}

export function clearToken() {
  setToken(null);
}

/** Fired when the backend rejects our token — AuthContext listens and logs the user out. */
export const AUTH_EXPIRED_EVENT = "hrl:auth-expired";
function notifyAuthExpired() {
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

type FetchOpts = RequestInit & { params?: Record<string, string | number | boolean | undefined | null> };

export async function apiFetch<T = unknown>(path: string, options: FetchOpts = {}): Promise<T> {
  const { params, ...init } = options;
  const token = getToken();

  let url = `${BASE}${path}`;
  if (params) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    }
    if (q.toString()) url += `?${q}`;
  }

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401) {
    notifyAuthExpired();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const err = new Error(body.error || `HTTP ${res.status}`) as Error & { status?: number; code?: string };
    err.status = res.status;
    err.code = body.code;
    throw err;
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string, params?: FetchOpts["params"]) => apiFetch<T>(path, { method: "GET", params }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) => {
    const token = getToken();
    return fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: formData,
    }).then(async (res) => {
      if (res.status === 401) notifyAuthExpired();
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      return res.json() as Promise<T>;
    });
  },
};

/** URL for an <audio> element — carries the JWT as a query param (headers aren't possible on media elements). */
export function streamUrl(trackId: string) {
  const token = getToken() ?? "";
  return `${BASE}/api/tracks/stream/${trackId}?token=${encodeURIComponent(token)}`;
}

/** Stream URL for a shared playlist (no login — uses the share token). */
export function sharedStreamUrl(trackId: string, shareToken: string) {
  return `${BASE}/api/tracks/stream/${trackId}?shareToken=${encodeURIComponent(shareToken)}`;
}

/** Preview a Google Drive file directly (before importing it as a track). */
export function driveStreamUrl(fileId: string) {
  const token = getToken() ?? "";
  return `${BASE}/api/drive/stream/${fileId}?token=${encodeURIComponent(token)}`;
}
