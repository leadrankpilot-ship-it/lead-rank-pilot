function resolveApiUrl(): string {
  const fromPublic = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  if (fromPublic) return fromPublic;
  if (typeof window === "undefined") {
    const backend = (process.env.BACKEND_URL || "").replace(/\/$/, "");
    if (backend) return backend;
    return "http://localhost:8000";
  }
  return "";
}

const ADMIN_TOKEN_KEY = "lrp_admin_token";

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = getAdminToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${resolveApiUrl()}${path}`, { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type AdminUser = {
  id: number;
  email: string;
  role: string;
  status: string;
  plan_id: string;
  billing_status: string;
  plan_renews_at: string | null;
  created_at: string | null;
};

export type AdminStats = {
  users_total: number;
  users_active: number;
  users_inactive: number;
  plan_free: number;
  plan_starter: number;
  plan_pro: number;
  mrr_usd: number;
};

export type AdminPlan = {
  id: string;
  name: string;
  price_usd_month: number;
  blog_daily_quota: number;
  search_daily_quota: number;
  websites_max: number;
  description: string;
};

export type AdminStatsFilters = {
  year?: string;
  month?: string;
  date?: string;
  weekday?: string;
};

export async function adminLogin(email: string, password: string): Promise<void> {
  const tokenRes = await adminFetch<{ access_token: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setAdminToken(tokenRes.access_token);
  const me = await adminFetch<{ role: string }>("/api/auth/me");
  if ((me.role || "").toLowerCase() !== "admin") {
    clearAdminToken();
    throw new Error("This account is not an admin");
  }
}

export async function fetchAdminStats(filters: AdminStatsFilters = {}): Promise<AdminStats> {
  const params = new URLSearchParams();
  if (filters.year) params.set("year", filters.year);
  if (filters.month) params.set("month", filters.month);
  if (filters.date) params.set("date", filters.date);
  if (filters.weekday) params.set("weekday", filters.weekday);
  const qs = params.toString();
  return adminFetch(`/api/admin/stats${qs ? `?${qs}` : ""}`);
}

export async function fetchAdminFilterOptions(): Promise<{ years: number[] }> {
  return adminFetch("/api/admin/filter-options");
}

export async function fetchAdminUsers(q = ""): Promise<AdminUser[]> {
  const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return adminFetch(`/api/admin/users${qs}`);
}

export async function updateAdminUser(
  userId: number,
  patch: Partial<Pick<AdminUser, "plan_id" | "billing_status" | "status" | "role">>,
): Promise<AdminUser> {
  return adminFetch(`/api/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function fetchAdminPlans(): Promise<AdminPlan[]> {
  return adminFetch("/api/admin/plans");
}

export async function updateAdminPlan(
  planId: string,
  patch: Partial<Omit<AdminPlan, "id">>,
): Promise<AdminPlan> {
  return adminFetch(`/api/admin/plans/${encodeURIComponent(planId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
