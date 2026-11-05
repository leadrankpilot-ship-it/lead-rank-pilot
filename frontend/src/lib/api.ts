const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOKEN_KEY = "lrp_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
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

export async function fetchApiHealth(): Promise<{
  status: string;
  service: string;
  database?: string;
  billing_mode?: string;
}> {
  return apiFetch("/api/health");
}

export async function register(email: string, password: string): Promise<{ access_token: string }> {
  return apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function login(email: string, password: string): Promise<{ access_token: string }> {
  return apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  return apiFetch("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, password: string): Promise<{ message: string }> {
  return apiFetch("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

export async function fetchMe(): Promise<{
  id: number;
  email: string;
  role: string;
  status: string;
  plan_id?: string;
  billing_status?: string;
}> {
  return apiFetch("/api/auth/me");
}

export type Plan = {
  id: string;
  name: string;
  price_usd_month: number;
  blog_daily_quota: number;
  search_daily_quota: number;
  audit_daily_quota: number;
  websites_max: number;
  description: string;
  margin_usd?: number | null;
};

export type Subscription = {
  plan_id: string;
  plan_name: string;
  billing_status: string;
  billing_mode: string;
  price_usd_month: number;
  blog_daily_quota: number;
  search_daily_quota: number;
  audit_daily_quota: number;
  websites_max: number;
  plan_renews_at: string | null;
  stripe_customer_id: string | null;
};

export async function listPlans(): Promise<Plan[]> {
  return apiFetch("/api/billing/plans");
}

export async function getSubscription(): Promise<Subscription> {
  return apiFetch("/api/billing/subscription");
}

export async function startCheckout(plan_id: "starter" | "pro"): Promise<{
  mode: string;
  checkout_url: string;
  session_id: string;
  plan_id: string;
}> {
  return apiFetch("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ plan_id }),
  });
}

export async function mockActivatePlan(plan_id: "free" | "starter" | "pro", token = ""): Promise<Subscription> {
  return apiFetch("/api/billing/mock-activate", {
    method: "POST",
    body: JSON.stringify({ plan_id, token }),
  });
}

export type WebsiteProfile = {
  business_name?: string | null;
  tagline?: string | null;
  niche?: string | null;
  about_summary?: string | null;
  products_services?: string[];
  service_areas?: string[];
  audience?: string | null;
  brand_voice?: string | null;
  tone?: string | null;
  writing_style?: string | null;
  author_persona?: string | null;
  language?: string | null;
  content_mode?: "niche_blog" | "journal" | string | null;
  publish_category?: string | null;
  categories?: string[];
  site_categories?: Array<{ name: string; note?: string | null }>;
  content_pillars?: string[];
  primary_keywords?: string[];
  secondary_keywords?: string[];
  preferred_terms?: string[];
  words_to_avoid?: string[];
  banned_claims?: string[];
  unique_selling_points?: string[];
  cta_style?: string | null;
  preferred_cta?: string | null;
  existing_blog_titles?: string[];
  competitors_note?: string | null;
  extra_guidelines?: string | null;
  ai_writer_prompt?: string | null;
  source_pages?: Array<{ url: string; title?: string }>;
  notes_for_user?: string;
  limitations?: string[];
};

export type WebsiteProfilePayload = {
  business_name?: string;
  tagline?: string;
  niche?: string;
  about_summary?: string;
  products_services: string[];
  service_areas: string[];
  audience?: string;
  brand_voice?: string;
  tone?: string;
  writing_style?: string;
  author_persona?: string;
  language?: string;
  content_mode?: "niche_blog" | "journal";
  publish_category?: string;
  categories: string[];
  site_categories?: Array<{ name: string; note?: string | null }>;
  content_pillars: string[];
  primary_keywords: string[];
  secondary_keywords: string[];
  preferred_terms: string[];
  words_to_avoid: string[];
  banned_claims: string[];
  unique_selling_points: string[];
  cta_style?: string;
  preferred_cta?: string;
  existing_blog_titles: string[];
  competitors_note?: string;
  extra_guidelines?: string;
  confirm?: boolean;
};

export type Website = {
  id: number;
  base_url: string;
  normalized_domain: string;
  ownership_confirmed_at: string | null;
  profile_confirmed_at?: string | null;
  business_profile?: WebsiteProfile | null;
  created_at: string | null;
};

export type WriterPrompt = {
  website_id: number;
  system_prompt: string;
  profile_confirmed: boolean;
  profile?: WebsiteProfile | null;
};

export async function listWebsites(): Promise<Website[]> {
  return apiFetch("/api/websites");
}

export async function createWebsite(baseUrl: string, ownershipConfirmed = true): Promise<Website> {
  return apiFetch("/api/websites", {
    method: "POST",
    body: JSON.stringify({ base_url: baseUrl, ownership_confirmed: ownershipConfirmed }),
  });
}

export async function analyzeWebsiteProfile(websiteId: number): Promise<Website> {
  return apiFetch(`/api/websites/${websiteId}/analyze-profile`, { method: "POST" });
}

export async function confirmWebsiteProfile(
  websiteId: number,
  profile: WebsiteProfilePayload,
): Promise<Website> {
  return apiFetch(`/api/websites/${websiteId}/profile`, {
    method: "PUT",
    body: JSON.stringify({ ...profile, confirm: profile.confirm !== false }),
  });
}

export async function getWriterPrompt(websiteId: number): Promise<WriterPrompt> {
  return apiFetch(`/api/websites/${websiteId}/writer-prompt`);
}

export type BlogPost = {
  id: number;
  website_id: number;
  topic_id: number | null;
  title: string;
  slug: string;
  body: string;
  metadata: Record<string, unknown> | null;
  status: string;
  generated_at: string | null;
  approved_at: string | null;
  published_at?: string | null;
  remote_post_id?: string | null;
  remote_url?: string | null;
  created_at: string | null;
  error_code: string | null;
};

export async function getBlogQuota(): Promise<{ used: number; limit: number; remaining: number }> {
  return apiFetch("/api/blogs/quota");
}

export async function listBlogPosts(websiteId?: number): Promise<BlogPost[]> {
  const q = websiteId != null ? `?website_id=${websiteId}` : "";
  return apiFetch(`/api/blogs/posts${q}`);
}

export type BlogGenerateOptions = {
  category?: string;
  nlp_keywords?: string[];
  lsi_keywords?: string[];
  target_words?: number;
};

export async function generateBlog(
  websiteId: number,
  topic: string,
  options: BlogGenerateOptions = {},
): Promise<BlogPost> {
  return apiFetch("/api/blogs/generate", {
    method: "POST",
    body: JSON.stringify({
      website_id: websiteId,
      topic_or_keyword: topic,
      category: options.category || "",
      nlp_keywords: options.nlp_keywords || [],
      lsi_keywords: options.lsi_keywords || [],
      target_words: options.target_words ?? null,
    }),
  });
}

export async function updateBlogPost(
  postId: number,
  patch: {
    title?: string;
    slug?: string;
    body?: string;
    meta_description?: string;
    meta_title?: string;
    focus_keyword?: string;
    featured_image_url?: string;
  },
): Promise<BlogPost> {
  return apiFetch(`/api/blogs/posts/${postId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export type BlogImageUpload = {
  filename: string;
  path: string;
  url: string;
  original_name: string;
  content_type: string;
};

export async function uploadBlogImage(file: File, slugHint?: string): Promise<BlogImageUpload> {
  const form = new FormData();
  form.append("file", file);
  if (slugHint?.trim()) form.append("slug_hint", slugHint.trim());

  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}/api/blogs/images`, {
    method: "POST",
    headers,
    body: form,
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = `Upload failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<BlogImageUpload>;
}

export function mediaUrl(pathOrUrl: string): string {
  const value = (pathOrUrl || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${API_URL}${value}`;
  return value;
}

export async function approveBlogPost(postId: number): Promise<BlogPost> {
  return apiFetch(`/api/blogs/posts/${postId}/approve`, { method: "POST" });
}

export async function publishBlogPost(
  postId: number,
  status: "draft" | "publish" = "draft",
): Promise<BlogPost> {
  return apiFetch(`/api/blogs/posts/${postId}/publish`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

export type WebsiteConnection = {
  id: number;
  website_id: number;
  connector_type: string;
  site_url: string;
  username: string;
  connection_status: string;
  auto_publish: boolean;
  last_tested_at: string | null;
  last_error: string | null;
  created_at: string | null;
};

export async function listConnections(): Promise<WebsiteConnection[]> {
  return apiFetch("/api/connections");
}

export type WordPressCategory = {
  id: number;
  name: string;
  slug: string;
  count: number;
  source?: "category" | "page" | string;
};

export async function listConnectionCategories(
  connectionId: number,
): Promise<WordPressCategory[]> {
  const data = await apiFetch<{ categories: WordPressCategory[] }>(
    `/api/connections/${connectionId}/categories`,
  );
  return data.categories || [];
}

export async function syncWordPressSectionPages(connectionId: number): Promise<{
  ok: boolean;
  mode?: string;
  updated: Array<{ page: string; category: string; category_id: number; query_blocks: number }>;
  skipped: Array<{ page: string; reason: string }>;
}> {
  return apiFetch(`/api/connections/${connectionId}/sync-section-pages`, { method: "POST" });
}

export async function upsertConnection(input: {
  website_id: number;
  connector_type?: "wordpress" | "custom" | "export";
  site_url: string;
  username: string;
  application_password: string;
  auto_publish?: boolean;
}): Promise<WebsiteConnection> {
  return apiFetch("/api/connections", {
    method: "POST",
    body: JSON.stringify({ connector_type: "wordpress", ...input }),
  });
}

export async function downloadBlogExport(postId: number, format: "md" | "html"): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_URL}/api/blogs/posts/${postId}/export.${format}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `post_${postId}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function testConnection(connectionId: number): Promise<WebsiteConnection> {
  return apiFetch(`/api/connections/${connectionId}/test`, { method: "POST" });
}

export async function updateConnection(
  connectionId: number,
  patch: { auto_publish?: boolean },
): Promise<WebsiteConnection> {
  return apiFetch(`/api/connections/${connectionId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteConnection(connectionId: number): Promise<void> {
  return apiFetch(`/api/connections/${connectionId}`, { method: "DELETE" });
}

export type Job = {
  id: number;
  job_type: string;
  idempotency_key: string;
  status: string;
  attempts: number;
  error_summary: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string | null;
};

export async function listJobs(): Promise<Job[]> {
  return apiFetch("/api/jobs");
}

export async function createJob(jobType: string, idempotencyKey: string): Promise<Job> {
  return apiFetch("/api/jobs", {
    method: "POST",
    body: JSON.stringify({ job_type: jobType, idempotency_key: idempotencyKey }),
  });
}

export async function advanceJob(
  jobId: number,
  toStatus: "running" | "succeeded" | "failed",
  errorSummary?: string,
): Promise<Job> {
  return apiFetch(`/api/jobs/${jobId}/advance`, {
    method: "POST",
    body: JSON.stringify({ to_status: toStatus, error_summary: errorSummary ?? null }),
  });
}

export type SearchMode = "leads" | "contacts" | "manual_contacts";

export type SearchRun = {
  id: number;
  input_name: string;
  input_location: string;
  max_results?: number;
  mode?: SearchMode | string;
  status: string;
  progress_pct: number;
  progress_message: string | null;
  error_summary: string | null;
  result_count: number;
  input_url_count?: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
};

export type Lead = {
  id: number;
  search_run_id?: number | null;
  source_listing_url: string;
  business_name: string | null;
  location: string | null;
  category: string | null;
  website_url: string | null;
  website_status: string;
  phone: string | null;
  has_whatsapp?: boolean;
  email?: string | null;
  contact_page_url?: string | null;
  review_count?: number | null;
  rating?: number | null;
  rank?: number | null;
  score?: number | null;
  score_reasons?: { score?: number; reasons?: string[]; disclaimer?: string } | null;
  dedupe_key: string;
  last_checked_at: string | null;
  created_at: string | null;
};

export type LeadFilters = {
  category?: string;
  location?: string;
  website_status?: string;
  min_score?: number;
};

function toQuery(filters: LeadFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", filters.category);
  if (filters.location) params.set("location", filters.location);
  if (filters.website_status) params.set("website_status", filters.website_status);
  if (filters.min_score != null) params.set("min_score", String(filters.min_score));
  const q = params.toString();
  return q ? `?${q}` : "";
}

export async function listSearches(): Promise<SearchRun[]> {
  return apiFetch("/api/searches");
}

export async function createSearch(
  businessType: string,
  location: string,
  maxResults = 15,
  exclude?: { urls?: string[]; phones?: string[] },
  mode: SearchMode = "leads",
): Promise<SearchRun> {
  return apiFetch("/api/searches", {
    method: "POST",
    body: JSON.stringify({
      business_type: businessType,
      location,
      max_results: maxResults,
      mode,
      exclude_urls: exclude?.urls || [],
      exclude_phones: exclude?.phones || [],
    }),
  });
}

export async function createManualContactSearch(websites: string[]): Promise<SearchRun> {
  return apiFetch("/api/searches", {
    method: "POST",
    body: JSON.stringify({
      mode: "manual_contacts",
      websites,
      business_type: "",
      location: "",
    }),
  });
}

export async function fetchManualContactLimits(): Promise<{ max_urls: number; concurrency: number }> {
  return apiFetch("/api/searches/manual-limits");
}

export async function getSearch(searchId: number): Promise<SearchRun> {
  return apiFetch(`/api/searches/${searchId}`);
}

export async function listSearchLeads(searchId: number, filters: LeadFilters = {}): Promise<Lead[]> {
  return apiFetch(`/api/searches/${searchId}/leads${toQuery(filters)}`);
}

/** Pull ephemeral results into the client and wipe them from the server. */
export async function claimSearchLeads(searchId: number): Promise<Lead[]> {
  return apiFetch(`/api/searches/${searchId}/claim`, { method: "POST" });
}

export async function qualifySearchLeads(searchId: number, discoverContacts = true): Promise<Lead[]> {
  return apiFetch(`/api/searches/${searchId}/qualify`, {
    method: "POST",
    body: JSON.stringify({ discover_contacts: discoverContacts }),
  });
}

export function downloadLeadsCsvClient(leads: Lead[], filename = "leads_session.csv"): void {
  const cols = [
    "rank",
    "business_name",
    "phone",
    "email",
    "location",
    "category",
    "rating",
    "reviews",
    "website_status",
    "website_url",
    "maps_link",
    "dedupe_key",
  ] as const;
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [cols.join(",")];
  for (const lead of leads) {
    lines.push(
      [
        lead.rank != null ? String(lead.rank) : "",
        lead.business_name || "",
        lead.phone || "",
        lead.email || "",
        lead.location || "",
        lead.category || "",
        lead.rating != null ? String(lead.rating) : "",
        lead.review_count != null ? String(lead.review_count) : "",
        lead.website_status || "",
        lead.website_url || "",
        lead.source_listing_url || "",
        lead.dedupe_key || "",
      ]
        .map((x) => esc(x))
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function getSearchDuplicates(
  searchId: number,
): Promise<{ count: number; groups: Array<{ type: string; key: string; lead_ids: number[] }> }> {
  return apiFetch(`/api/searches/${searchId}/duplicates`);
}

export async function downloadSearchCsv(searchId: number, filters: LeadFilters = {}): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_URL}/api/searches/${searchId}/export.csv${toQuery(filters)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`CSV export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leads_search_${searchId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export type AuditReport = {
  id: number;
  website_id: number | null;
  lead_id: number | null;
  target_url: string;
  status_category: string;
  checks: Record<string, unknown>;
  score: { score?: number; reasons?: string[] } | null;
  limitations: string[] | null;
  checked_at: string | null;
  created_at: string | null;
};

export async function listAudits(): Promise<AuditReport[]> {
  return apiFetch("/api/audits");
}

export async function createAudit(url: string): Promise<AuditReport> {
  return apiFetch("/api/audits", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export type SavedSearch = {
  id: number;
  name: string;
  filters_json: string;
  schedule: string;
  enabled: boolean;
  last_run_at: string | null;
  created_at: string | null;
};

export async function listSavedSearches(): Promise<SavedSearch[]> {
  return apiFetch("/api/saved-searches");
}

export async function createSavedSearch(input: {
  name: string;
  business_type: string;
  location: string;
}): Promise<SavedSearch> {
  return apiFetch("/api/saved-searches", {
    method: "POST",
    body: JSON.stringify({ ...input, schedule: "manual", enabled: true }),
  });
}

export async function disableSavedSearch(id: number): Promise<SavedSearch> {
  return apiFetch(`/api/saved-searches/${id}/disable`, { method: "PATCH" });
}

export async function recheckSavedSearch(id: number): Promise<SearchRun> {
  return apiFetch(`/api/saved-searches/${id}/recheck`, { method: "POST" });
}

export { API_URL };
