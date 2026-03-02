// Central API client — all calls go through VPS backend
const BASE = import.meta.env.VITE_API_URL ?? "";

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit & { params?: Record<string, string | number | undefined> } = {}
): Promise<T> {
  const token = getToken();
  const { params, ...init } = options;

  let url = `${BASE}${path}`;
  if (params) {
    const q = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    );
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

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const e: any = new Error(err.error || `HTTP ${res.status}`);
    e.status = res.status;
    e.code = err.code;
    throw e;
  }

  return res.json();
}

export const api = {
  get: <T>(path: string, params?: Record<string, any>) => apiFetch<T>(path, { method: "GET", params }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};

// Token helpers (stored in memory + localStorage)
let _token: string | null = null;

export function setToken(t: string | null) {
  _token = t;
  if (t) localStorage.setItem("hrl_token", t);
  else localStorage.removeItem("hrl_token");
}

export function getToken(): string | null {
  if (_token) return _token;
  _token = localStorage.getItem("hrl_token");
  return _token;
}

export function clearToken() { setToken(null); }

// Stream URL helper
export function streamUrl(trackId: string) {
  const token = getToken() || "";
  return `${BASE}/api/tracks/stream/${trackId}?token=${token}`;
}
