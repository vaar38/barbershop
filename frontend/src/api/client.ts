// Обёртка над fetch: подставляет токен, при 401 один раз обновляет его через refresh

const ACCESS_KEY = "fade_access";
const REFRESH_KEY = "fade_refresh";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  save(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

type Options = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | (string | number)[] | undefined>;
};

export function buildUrl(path: string, query?: Options["query"]) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)));
    else params.append(key, String(value));
  }
  const qs = params.toString();
  return "/api" + path + (qs ? "?" + qs : "");
}

// FastAPI отдаёт ошибку либо строкой, либо списком ошибок валидации
export function errorText(data: unknown, status: number): string {
  const detail = (data as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((d: { msg?: string }) => d.msg)
      .filter(Boolean)
      .join("; ");
  }
  return `Ошибка сервера (${status})`;
}

async function send(path: string, opts: Options, withToken: boolean) {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (withToken && tokens.access) headers["Authorization"] = "Bearer " + tokens.access;

  return fetch(buildUrl(path, opts.query), {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

async function tryRefresh() {
  if (!tokens.refresh) return false;
  const res = await send("/auth/refresh", { method: "POST", body: { refresh_token: tokens.refresh } }, false);
  if (!res.ok) {
    tokens.clear();
    return false;
  }
  const data = await res.json();
  tokens.save(data.access_token, data.refresh_token);
  return true;
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  let res = await send(path, opts, true);

  if (res.status === 401 && tokens.refresh && path !== "/auth/refresh") {
    if (await tryRefresh()) res = await send(path, opts, true);
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, errorText(data, res.status));
  return data as T;
}
