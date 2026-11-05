"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BlogRichEditor } from "@/components/BlogRichEditor";
import {
  BlogPost,
  Website,
  confirmWebsiteProfile,
  createWebsite,
  generateBlog,
  getBlogQuota,
  listBlogPosts,
  listConnectionCategories,
  listConnections,
  listWebsites,
  mediaUrl,
  publishBlogPost,
  syncWordPressSectionPages,
  testConnection,
  updateBlogPost,
  uploadBlogImage,
  upsertConnection,
} from "@/lib/api";
import type { WebsiteConnection } from "@/lib/api";

function metaStr(post: BlogPost | null, key: string): string {
  if (!post?.metadata) return "";
  const value = post.metadata[key];
  return value == null ? "" : String(value);
}

function slugOk(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim());
}

type PageTab = "writer" | "drafts" | "published" | "site";
type CategoryRow = { name: string; note: string };

function emptyCategory(): CategoryRow {
  return { name: "", note: "" };
}

function rowsFromProfile(site: Website | null): CategoryRow[] {
  const bp = site?.business_profile;
  const stored = bp?.site_categories || [];
  if (stored.length) {
    return stored
      .map((row) => ({ name: row.name || "", note: row.note || "" }))
      .filter((row) => row.name.trim());
  }
  const names = bp?.categories?.length
    ? bp.categories
    : bp?.publish_category
      ? [bp.publish_category]
      : [];
  const rows = names.map((name) => ({ name, note: "" })).filter((row) => row.name.trim());
  return rows.length ? rows : [emptyCategory()];
}

const SITE_LIMIT = 3;

function splitList(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeSiteUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, "");
  return `https://${raw.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function IconLink() {
  return (
    <svg className="leads-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function IconKey() {
  return (
    <svg className="leads-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="8" cy="15" r="4" />
      <path d="m11.5 12.5 7-7" />
      <path d="M16 8l2 2" />
    </svg>
  );
}

function IconSpark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    </svg>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function statusBadge(status: string) {
  if (status === "published") return "lrp-badge lrp-badge-success";
  if (status === "approved") return "lrp-badge lrp-badge-orange";
  if (status === "failed") return "lrp-badge lrp-badge-danger";
  return "lrp-badge";
}

export default function BlogsPage() {
  const [sites, setSites] = useState<Website[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addingSite, setAddingSite] = useState(false);
  const [siteUrl, setSiteUrl] = useState("");
  const [description, setDescription] = useState("");
  const [contentMode, setContentMode] = useState<"niche_blog" | "journal">("niche_blog");
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([emptyCategory()]);
  const [categoriesOpen, setCategoriesOpen] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [nlpText, setNlpText] = useState("");
  const [lsiText, setLsiText] = useState("");
  const [targetWords, setTargetWords] = useState("1200");
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [active, setActive] = useState<BlogPost | null>(null);
  const [tab, setTab] = useState<PageTab>("writer");
  const [viewMode, setViewMode] = useState<"preview" | "edit">("preview");
  const [quota, setQuota] = useState({ used: 0, limit: 3, remaining: 3 });
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<WebsiteConnection | null>(null);
  const [customUrl, setCustomUrl] = useState("");
  const [customToken, setCustomToken] = useState("");
  const [wpUrl, setWpUrl] = useState("");
  const [wpUser, setWpUser] = useState("");
  const [wpPass, setWpPass] = useState("");
  const [publishTab, setPublishTab] = useState<"custom" | "wordpress">("custom");
  const [busy, setBusy] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const selected = addingSite ? null : sites.find((s) => s.id === selectedId) || null;
  const profileReady = Boolean(selected?.profile_confirmed_at);
  const categories = useMemo(() => {
    if (!profileReady) return [];
    return rowsFromProfile(selected)
      .map((row) => row.name.trim())
      .filter(Boolean);
  }, [profileReady, selected]);

  const hydrateSetup = useCallback((site: Website | null) => {
    const bp = site?.business_profile;
    const confirmed = Boolean(site?.profile_confirmed_at);
    if (!bp || !confirmed) {
      setDescription("");
      setCategoryRows([emptyCategory()]);
      setContentMode("niche_blog");
      setCategory("");
      return;
    }
    const rows = rowsFromProfile(site);
    setDescription(bp.about_summary || "");
    setContentMode(bp.content_mode === "journal" ? "journal" : "niche_blog");
    setCategoryRows(rows);
    setCategory((current) => (rows.some((row) => row.name === current) ? current : rows[0]?.name || ""));
  }, []);

  const refresh = useCallback(async () => {
    const [w, q, p, c] = await Promise.all([
      listWebsites(),
      getBlogQuota(),
      listBlogPosts(),
      listConnections(),
    ]);
    setSites(w);
    setQuota(q);
    setPosts(p);
    const mine = selectedId ? c.find((row) => row.website_id === selectedId) : c[0];
    if (mine) setConnection(mine);
    if (!selectedId && !addingSite && w[0]) setSelectedId(w[0].id);
  }, [selectedId, addingSite]);

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [refresh]);

  useEffect(() => {
    if (!selected) return;
    hydrateSetup(selected);
    setWpUrl((current) => current || selected.base_url);
    if (selectedId) {
      listBlogPosts(selectedId)
        .then(setPosts)
        .catch(() => undefined);
    }
  }, [selected, selectedId, hydrateSetup]);

  const filteredPosts = useMemo(() => {
    if (tab !== "drafts" && tab !== "published") return [];
    const mine = selectedId ? posts.filter((p) => p.website_id === selectedId) : posts;
    if (tab === "published") return mine.filter((p) => p.status === "published");
    return mine.filter(
      (p) =>
        p.status === "draft" ||
        p.status === "approved" ||
        p.status === "failed" ||
        p.status === "generating",
    );
  }, [posts, selectedId, tab]);

  useEffect(() => {
    if (tab !== "drafts" && tab !== "published") return;
    if (!filteredPosts.length) {
      if (active) setActive(null);
      return;
    }
    if (!active || !filteredPosts.some((p) => p.id === active.id)) {
      setActive(filteredPosts[0]);
      setViewMode("preview");
    }
  }, [filteredPosts, active, tab]);

  async function onConnect(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (sites.length >= SITE_LIMIT) {
      setError(`You can add up to ${SITE_LIMIT} sites`);
      return;
    }
    setBusy("Adding site…");
    try {
      const url = normalizeSiteUrl(siteUrl);
      setSiteUrl(url);
      const site = await createWebsite(url, true);
      setDescription("");
      setCategoryRows([emptyCategory()]);
      setContentMode("niche_blog");
      setSites((prev) => [site, ...prev]);
      setAddingSite(false);
      setSelectedId(site.id);
      setTab("site");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add site");
    } finally {
      setBusy("");
    }
  }

  function startAddSite() {
    if (sites.length >= SITE_LIMIT) {
      setError(`You can add up to ${SITE_LIMIT} sites`);
      return;
    }
    setError("");
    setAddingSite(true);
    setSelectedId(null);
    setSiteUrl("");
    setDescription("");
    setCategoryRows([emptyCategory()]);
    setContentMode("niche_blog");
    setCategory("");
    setConnection(null);
    setCustomUrl("");
    setCustomToken("");
    setWpUrl("");
    setWpUser("");
    setWpPass("");
    setTab("site");
  }

  async function onSaveWriter(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError("");
    setBusy("Saving writer…");
    try {
      const bp = selected.business_profile || {};
      const siteCategories = categoryRows
        .map((row) => ({ name: row.name.trim(), note: row.note.trim() || undefined }))
        .filter((row) => row.name);
      if (!description.trim()) {
        setError("Add a site description");
        setBusy("");
        return;
      }
      if (!siteCategories.length) {
        setError("Add at least one category");
        setBusy("");
        return;
      }
      const saved = await confirmWebsiteProfile(selected.id, {
        business_name: bp.business_name || selected.normalized_domain,
        tagline: bp.tagline || undefined,
        niche: bp.niche || description.trim().slice(0, 160),
        about_summary: description.trim(),
        products_services: bp.products_services || [],
        service_areas: bp.service_areas || [],
        audience: bp.audience || undefined,
        brand_voice: bp.brand_voice || "clear, expert, trustworthy",
        tone: bp.tone || "professional yet approachable",
        writing_style: bp.writing_style || "short paragraphs, scannable H2/H3s, practical examples",
        author_persona: bp.author_persona || undefined,
        language: bp.language || "en",
        content_mode: contentMode,
        publish_category: siteCategories[0].name,
        categories: siteCategories.map((row) => row.name),
        site_categories: siteCategories,
        content_pillars: bp.content_pillars || [],
        primary_keywords: bp.primary_keywords || [],
        secondary_keywords: bp.secondary_keywords || [],
        preferred_terms: bp.preferred_terms || [],
        words_to_avoid: bp.words_to_avoid || ["guaranteed ranking", "guaranteed traffic"],
        banned_claims: bp.banned_claims || ["guaranteed results", "instant ranking"],
        unique_selling_points: bp.unique_selling_points || [],
        cta_style: bp.cta_style || "soft, helpful",
        preferred_cta: bp.preferred_cta || undefined,
        existing_blog_titles: bp.existing_blog_titles || [],
        competitors_note: bp.competitors_note || undefined,
        extra_guidelines: bp.extra_guidelines || undefined,
        confirm: true,
      });
      setSites((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
      setCategory(siteCategories[0].name);
      setTab("writer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save writer");
    } finally {
      setBusy("");
    }
  }

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    if (!selected || !profileReady) {
      setError("Save the site writer first");
      setTab("site");
      return;
    }
    if (!category.trim()) {
      setError("Select a category");
      return;
    }
    if (!keyword.trim()) {
      setError("Add a focus keyword");
      return;
    }
    const words = Number(targetWords);
    if (!Number.isFinite(words) || words < 400 || words > 2500) {
      setError("Article length must be between 400 and 2500 words");
      return;
    }
    setError("");
    setBusy("Writing article…");
    try {
      const post = await generateBlog(selected.id, keyword.trim(), {
        category: category.trim(),
        nlp_keywords: splitList(nlpText),
        lsi_keywords: splitList(lsiText),
        target_words: words,
      });
      setPosts((prev) => [post, ...prev.filter((p) => p.id !== post.id)]);
      setActive(post);
      setViewMode("preview");
      setTab("drafts");
      const q = await getBlogQuota();
      setQuota(q);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy("");
    }
  }

  async function onPublish() {
    if (!active) return;
    setBusy("Publishing…");
    try {
      const post = await publishBlogPost(active.id, "publish");
      setActive(post);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
      setTab("published");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setBusy("");
    }
  }

  async function onSaveEdits() {
    if (!active) return;
    if (active.title.trim().length < 15) {
      setError("Title is too short. Use at least 15 characters.");
      return;
    }
    if (!slugOk(active.slug)) {
      setError("URL slug must be lowercase letters, numbers, and hyphens only.");
      return;
    }
    setError("");
    setBusy("Saving draft…");
    try {
      const post = await updateBlogPost(active.id, {
        title: active.title,
        slug: active.slug,
        body: active.body,
        meta_description: metaStr(active, "meta_description"),
        meta_title: metaStr(active, "meta_title") || active.title,
        focus_keyword:
          metaStr(active, "focus_keyword") ||
          (Array.isArray(active.metadata?.keywords) && active.metadata.keywords[0]
            ? String(active.metadata.keywords[0])
            : "") ||
          metaStr(active, "topic") ||
          keyword,
        featured_image_url: metaStr(active, "featured_image_url"),
      });
      setActive(post);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy("");
    }
  }

  function patchMeta(key: string, value: string) {
    if (!active) return;
    setActive({
      ...active,
      metadata: { ...(active.metadata || {}), [key]: value },
    });
  }

  const titleLen = active?.title.trim().length || 0;
  const metaTitle = metaStr(active, "meta_title") || active?.title || "";
  const metaDesc = metaStr(active, "meta_description");
  const focusKw =
    metaStr(active, "focus_keyword") ||
    (Array.isArray(active?.metadata?.keywords) && active.metadata.keywords[0]
      ? String(active.metadata.keywords[0])
      : "") ||
    metaStr(active, "topic") ||
    "";
  const featuredImage = metaStr(active, "featured_image_url");
  const publishHost = selected?.normalized_domain || "yoursite.com";
  const editing = viewMode === "edit" && Boolean(active);

  const pageTabs: Array<{ id: PageTab; label: string }> = [
    { id: "writer", label: "AI writer" },
    { id: "drafts", label: "Drafts" },
    { id: "published", label: "Published" },
    { id: "site", label: "Add site" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="AI blogs">
          {pageTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`smx-pill ${tab === item.id ? "is-accent" : ""}`}
              onClick={() => {
                setViewMode("preview");
                if (item.id === "site" && !selected) startAddSite();
                else setTab(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="lrp-badge">
            {quota.remaining}/{quota.limit} left today
          </span>
          {sites.length > 0 ? (
            <label className="leads-field leads-field--select !min-w-[160px]">
              <select
                value={selected ? String(selected.id) : ""}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  if (!Number.isFinite(id)) return;
                  setAddingSite(false);
                  setSelectedId(id);
                }}
                aria-label="Website"
              >
                {addingSite ? (
                  <option value="" disabled>
                    New site…
                  </option>
                ) : null}
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.normalized_domain}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>

      {tab === "site" ? (
      <>
      <section className="lrp-card space-y-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">
              {selected ? selected.normalized_domain : "Step 1"}
            </p>
            <h2 className="mt-1 text-base font-bold text-[#111827]">
              {selected ? "Tell the writer about this site" : "Connect your website"}
            </h2>
            <p className="mt-1 text-sm text-[#6B7280]">
              {selected
                ? "Three things, then save. After that you can write one article at a time."
                : "Paste the site address. You describe the site yourself — nothing is read from the pages."}
            </p>
          </div>
          <form onSubmit={selected ? onSaveWriter : onConnect} className="space-y-5">
            {!selected ? (
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-[#6B7280]">Website address</span>
                <span className="leads-field !rounded-xl">
                  <IconLink />
                  <input
                    required
                    value={siteUrl}
                    onChange={(e) => setSiteUrl(e.target.value)}
                    placeholder="yoursite.com"
                    aria-label="Site URL"
                  />
                </span>
              </label>
            ) : null}

            {selected ? (
              <>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-[#111827]">1. What is this site?</span>
                  <span className="block text-xs text-[#6B7280]">
                    Who it is for, what it covers, and what it must never claim. The writer treats this as fact.
                  </span>
                  <textarea
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#111827] outline-none focus:border-[var(--brand-500)] focus:shadow-[0_0_0_3px_rgba(193,144,255,0.2)]"
                    placeholder="Example: A health site for adults. Explains conditions in plain language. Does not diagnose or prescribe."
                  />
                </label>

                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-[#111827]">2. How should articles stay on topic?</p>
                    <p className="mt-0.5 text-xs text-[#6B7280]">Pick one. This applies to the whole site, not each article.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      className={`rounded-xl border px-4 py-3 text-left ${
                        contentMode === "niche_blog"
                          ? "border-[var(--brand-500)] bg-[#F5EDFF]"
                          : "border-[#E5E7EB] bg-white"
                      }`}
                      onClick={() => setContentMode("niche_blog")}
                    >
                      <span className="block text-sm font-semibold text-[#111827]">One niche</span>
                      <span className="mt-1 block text-xs leading-5 text-[#6B7280]">
                        Health, finance, legal, or a local business. Every article stays inside that subject.
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`rounded-xl border px-4 py-3 text-left ${
                        contentMode === "journal"
                          ? "border-[var(--brand-500)] bg-[#F5EDFF]"
                          : "border-[#E5E7EB] bg-white"
                      }`}
                      onClick={() => setContentMode("journal")}
                    >
                      <span className="block text-sm font-semibold text-[#111827]">Magazine</span>
                      <span className="mt-1 block text-xs leading-5 text-[#6B7280]">
                        Several topics are fine. Each article still stays inside the category you pick later.
                      </span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-left hover:border-[var(--brand-500)]"
                    aria-expanded={categoriesOpen}
                    onClick={() => setCategoriesOpen((open) => !open)}
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-[#111827]">3. Categories</span>
                      <span className="mt-0.5 block text-xs text-[#6B7280]">
                        {categoriesOpen
                          ? "These are the sections of the site. When you write, you choose one. Add at least one name."
                          : categoryRows
                              .map((row) => row.name.trim())
                              .filter(Boolean)
                              .join(", ") || "No categories yet — expand to add."}
                      </span>
                    </span>
                    <IconChevron open={categoriesOpen} />
                  </button>
                  {categoriesOpen ? (
                    <>
                      {categoryRows.map((row, index) => (
                        <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                          <input
                            value={row.name}
                            onChange={(e) =>
                              setCategoryRows((prev) =>
                                prev.map((item, i) => (i === index ? { ...item, name: e.target.value } : item)),
                              )
                            }
                            className="w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand-500)]"
                            placeholder={index === 0 ? "Diabetes" : "Category name"}
                            aria-label={`Category ${index + 1} name`}
                          />
                          <input
                            value={row.note}
                            onChange={(e) =>
                              setCategoryRows((prev) =>
                                prev.map((item, i) => (i === index ? { ...item, note: e.target.value } : item)),
                              )
                            }
                            className="w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--brand-500)]"
                            placeholder="Optional: what belongs in this section"
                            aria-label={`Category ${index + 1} note`}
                          />
                          {categoryRows.length > 1 ? (
                            <button
                              type="button"
                              className="lrp-btn lrp-btn-ghost !min-h-11 !px-3 !text-xs"
                              onClick={() => setCategoryRows((prev) => prev.filter((_, i) => i !== index))}
                            >
                              Remove
                            </button>
                          ) : (
                            <span className="hidden sm:block" />
                          )}
                        </div>
                      ))}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="lrp-btn lrp-btn-secondary !min-h-9 !text-xs"
                          onClick={() => setCategoryRows((prev) => [...prev, emptyCategory()])}
                        >
                          Add another category
                        </button>
                        {connection?.connector_type === "wordpress" &&
                        connection.connection_status === "ok" ? (
                          <button
                            type="button"
                            className="lrp-btn lrp-btn-ghost !min-h-9 !text-xs"
                            disabled={Boolean(busy)}
                            onClick={async () => {
                              setBusy("Importing categories…");
                              setError("");
                              try {
                                const rows = await listConnectionCategories(connection.id);
                                const imported = rows
                                  .map((row) => ({ name: row.name.trim(), note: "" }))
                                  .filter((row) => row.name && row.name.toLowerCase() !== "uncategorized");
                                if (!imported.length) {
                                  setError("No WordPress categories found to import");
                                  return;
                                }
                                setCategoryRows((prev) => {
                                  const seen = new Set(
                                    prev.map((row) => row.name.trim().toLowerCase()).filter(Boolean),
                                  );
                                  const merged = [...prev.filter((row) => row.name.trim())];
                                  for (const row of imported) {
                                    const key = row.name.toLowerCase();
                                    if (seen.has(key)) continue;
                                    seen.add(key);
                                    merged.push(row);
                                  }
                                  return merged.length ? merged : [emptyCategory()];
                                });
                                setCategoriesOpen(true);
                              } catch (err) {
                                setError(
                                  err instanceof Error ? err.message : "Could not import WordPress categories",
                                );
                              } finally {
                                setBusy("");
                              }
                            }}
                          >
                            Import header / WP categories
                          </button>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              </>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-[#E5E7EB] pt-4">
              {!selected ? (
                <button type="submit" disabled={Boolean(busy)} className="leads-start-btn">
                  {busy ? (
                    <>
                      <span className="lrp-spinner !border-white/40 !border-t-white" />
                      {busy}
                    </>
                  ) : (
                    <>
                      <IconSpark />
                      Add site
                    </>
                  )}
                </button>
              ) : (
                <>
                  <button type="submit" disabled={Boolean(busy)} className="leads-start-btn">
                    {busy ? (
                      <>
                        <span className="lrp-spinner !border-white/40 !border-t-white" />
                        {busy}
                      </>
                    ) : (
                      <>
                        <IconSpark />
                        Save and start writing
                      </>
                    )}
                  </button>
                  {sites.length < SITE_LIMIT ? (
                    <button type="button" className="lrp-btn lrp-btn-ghost" onClick={startAddSite}>
                      Connect a different site
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </form>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-[#D63A2F]">{error}</p>
        ) : null}
      </section>

      <section className="lrp-card overflow-hidden !p-0">
        <div className="grid md:grid-cols-[220px_minmax(0,1fr)]">
          <div
            className="flex flex-row gap-2 border-b border-[#E5E7EB] bg-[#FAFAFB] p-3 md:flex-col md:border-b-0 md:border-r"
            role="tablist"
            aria-label="Publish connection"
          >
            <button
              type="button"
              role="tab"
              aria-selected={publishTab === "custom"}
              className={`rounded-xl border px-3 py-3 text-left ${
                publishTab === "custom"
                  ? "border-[var(--brand-500)] bg-[#F5EDFF]"
                  : "border-transparent bg-white md:bg-transparent"
              }`}
              onClick={() => setPublishTab("custom")}
            >
              <span className="block text-sm font-semibold text-[#111827]">Custom site</span>
              <span className="mt-0.5 block text-xs text-[#6B7280]">Your own API endpoint</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={publishTab === "wordpress"}
              className={`rounded-xl border px-3 py-3 text-left ${
                publishTab === "wordpress"
                  ? "border-[var(--brand-500)] bg-[#F5EDFF]"
                  : "border-transparent bg-white md:bg-transparent"
              }`}
              onClick={() => setPublishTab("wordpress")}
            >
              <span className="block text-sm font-semibold text-[#111827]">WordPress plugin</span>
              <span className="mt-0.5 block text-xs text-[#6B7280]">Install and connect</span>
            </button>
          </div>

          <div className="space-y-4 p-5">
            {publishTab === "custom" ? (
              <>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">Custom site API</p>
                  <h2 className="mt-1 text-base font-bold text-[#111827]">Publish into your own endpoint</h2>
                  <p className="mt-1 text-sm text-[#6B7280]">
                    Add one POST URL on your site. LeadRankPilot sends the article there when you click Publish article.
                  </p>
                </div>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-[#6B7280]">Endpoint URL</span>
                  <input
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder="https://yoursite.com/api/leadrankpilot/posts"
                    className="lrp-input"
                    disabled={!selected || Boolean(busy)}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-[#6B7280]">Bearer token</span>
                  <input
                    type="password"
                    value={customToken}
                    onChange={(e) => setCustomToken(e.target.value)}
                    placeholder="At least 8 characters"
                    className="lrp-input"
                    disabled={!selected || Boolean(busy)}
                  />
                </label>
                <button
                  type="button"
                  className="lrp-btn lrp-btn-primary"
                  disabled={!selected || Boolean(busy)}
                  onClick={async () => {
                    if (!selected) return;
                    setBusy("Connecting…");
                    setError("");
                    try {
                      const saved = await upsertConnection({
                        website_id: selected.id,
                        connector_type: "custom",
                        site_url: customUrl.trim(),
                        username: "api",
                        application_password: customToken,
                        auto_publish: true,
                      });
                      const tested = await testConnection(saved.id);
                      setConnection(tested);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Custom endpoint failed");
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  {busy === "Connecting…" ? "Testing…" : "Save & test endpoint"}
                </button>
                {connection?.connector_type === "custom" ? (
                  <p className="text-sm text-[#374151]">Status: {connection.connection_status}</p>
                ) : null}
                <pre className="overflow-auto rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4 text-xs leading-5 text-[#374151]">{`POST {your endpoint}
Authorization: Bearer {token}
Content-Type: application/json
Idempotency-Key: {key}

{
  "title": "...",
  "slug": "...",
  "content_html": "<h1>...</h1>",
  "excerpt": "...",
  "meta_description": "...",
  "status": "publish",
  "idempotency_key": "...",
  "remote_post_id": null
}

Reply: { "success": true, "post_id": "123", "url": "https://yoursite.com/post" }`}</pre>
              </>
            ) : (
              <>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">WordPress</p>
                  <h2 className="mt-1 text-base font-bold text-[#111827]">Plugin and REST connection</h2>
                </div>
                <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-[#374151]">
                  <li>
                    Copy the LeadRankPilot plugin into{" "}
                    <span className="font-mono text-xs">wp-content/plugins/</span> and activate it.
                  </li>
                  <li>
                    In WordPress open Settings → LeadRankPilot and confirm health at{" "}
                    <span className="font-mono text-xs">/wp-json/leadrankpilot/v1/health</span>.
                  </li>
                  <li>
                    Create an Application Password under Users → Profile. Paste the site URL, login username, and that
                    password below.
                  </li>
                  <li>
                    Username must be the WordPress login (often your email), not the password name like LeadRankPilot.
                  </li>
                  <li>
                    Save and test. Publish article then uses the WordPress REST API (
                    <span className="font-mono text-xs">/wp-json/wp/v2</span>).
                  </li>
                </ol>
                <div className="grid gap-2 sm:grid-cols-3">
                  <input
                    value={wpUrl}
                    onChange={(e) => setWpUrl(e.target.value)}
                    placeholder="https://yoursite.com"
                    className="lrp-input"
                    disabled={!selected || Boolean(busy)}
                    aria-label="WordPress site URL"
                  />
                  <input
                    value={wpUser}
                    onChange={(e) => setWpUser(e.target.value)}
                    placeholder="WP login (often email)"
                    className="lrp-input"
                    disabled={!selected || Boolean(busy)}
                    aria-label="WordPress username"
                  />
                  <input
                    type="password"
                    value={wpPass}
                    onChange={(e) => setWpPass(e.target.value)}
                    placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                    className="lrp-input"
                    disabled={!selected || Boolean(busy)}
                    aria-label="WordPress application password"
                    autoComplete="off"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="lrp-btn lrp-btn-secondary"
                    disabled={!selected || Boolean(busy)}
                    onClick={async () => {
                      if (!selected) return;
                      setBusy("Connecting…");
                      setError("");
                      try {
                        const saved = await upsertConnection({
                          website_id: selected.id,
                          connector_type: "wordpress",
                          site_url: (wpUrl || selected.base_url).trim(),
                          username: wpUser.trim(),
                          application_password: wpPass.replace(/\s+/g, ""),
                          auto_publish: true,
                        });
                        const tested = await testConnection(saved.id);
                        setConnection(tested);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "WordPress connection failed");
                      } finally {
                        setBusy("");
                      }
                    }}
                  >
                    {busy === "Connecting…" ? "Testing…" : "Save & test WordPress"}
                  </button>
                  {connection?.connector_type === "wordpress" && connection.connection_status === "ok" ? (
                    <button
                      type="button"
                      className="lrp-btn lrp-btn-primary"
                      disabled={Boolean(busy)}
                      onClick={async () => {
                        setBusy("Fixing section pages…");
                        setError("");
                        try {
                          const result = await syncWordPressSectionPages(connection.id);
                          const n = result.updated?.length || 0;
                          if (!n) {
                            setError(
                              "No section pages were updated. Open a header page in WordPress and confirm it uses a Query Loop.",
                            );
                          } else {
                            setError("");
                            window.alert(
                              `Updated ${n} section page(s) so each shows only its own category.\n` +
                                result.updated.map((row) => `• ${row.page} → ${row.category}`).join("\n"),
                            );
                          }
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Could not sync section pages");
                        } finally {
                          setBusy("");
                        }
                      }}
                    >
                      {busy === "Fixing section pages…" ? "Fixing…" : "Fix header pages (one category each)"}
                    </button>
                  ) : null}
                </div>
                {connection?.connector_type === "wordpress" ? (
                  <p className="text-sm text-[#374151]">
                    Status: {connection.connection_status}
                    {connection.auto_publish ? " · live publish on" : ""}
                  </p>
                ) : null}
                <p className="text-xs leading-5 text-[#6B7280]">
                  Header pages like Health / Medicines currently list every post. Use{" "}
                  <strong>Fix header pages</strong> so each page query shows only that category. New publishes still
                  need the matching category selected in AI writer.
                </p>
              </>
            )}
          </div>
        </div>
      </section>
      </>
      ) : null}

      {tab === "writer" ? (
      <section className="lrp-card space-y-5">
        <form
          onSubmit={onGenerate}
          className={`leads-toolbar${busy === "Writing article…" ? " is-busy" : ""}`}
        >
          <label className="leads-field">
            <IconKey />
            <input
              required
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Focus keyword"
              aria-label="Focus keyword"
              disabled={!profileReady || Boolean(busy)}
            />
          </label>
          <label className="leads-field leads-field--select !min-w-[150px]">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Category"
              required
              disabled={!profileReady || Boolean(busy)}
            >
              {categories.length === 0 ? <option value="">Category</option> : null}
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="leads-field !min-w-[110px] !max-w-[140px]">
            <input
              value={targetWords}
              onChange={(e) => setTargetWords(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="Words"
              aria-label="Article words"
              disabled={!profileReady || Boolean(busy)}
            />
          </label>
          <button
            type="submit"
            disabled={!profileReady || !category.trim() || !keyword.trim() || Boolean(busy)}
            className="leads-start-btn"
          >
            {busy === "Writing article…" ? (
              <>
                <span className="lrp-spinner !border-white/40 !border-t-white" />
                Writing…
              </>
            ) : (
              <>
                <IconSpark />
                Write article
              </>
            )}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-3 px-1">
          <label className="leads-field !flex-1 !rounded-xl">
            <input
              value={nlpText}
              onChange={(e) => setNlpText(e.target.value)}
              placeholder="NLP terms (optional, comma-separated)"
              aria-label="NLP keywords"
              disabled={!profileReady || Boolean(busy)}
            />
          </label>
          <label className="leads-field !flex-1 !rounded-xl">
            <input
              value={lsiText}
              onChange={(e) => setLsiText(e.target.value)}
              placeholder="LSI phrases (optional, comma-separated)"
              aria-label="LSI keywords"
              disabled={!profileReady || Boolean(busy)}
            />
          </label>
        </div>

        {!profileReady ? (
          <p className="text-sm text-[#6B7280]">Open Add site, save the writer, then write with a keyword and category.</p>
        ) : null}
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-[#D63A2F]">{error}</p>
        ) : null}
      </section>
      ) : null}

      {tab === "drafts" || tab === "published" ? (
      <section className="lrp-card space-y-5">
        {filteredPosts.length > 1 && !editing ? (
          <div className="flex flex-wrap gap-2">
            {filteredPosts.map((post) => (
              <button
                key={post.id}
                type="button"
                className={`smx-pill ${active?.id === post.id ? "is-accent" : ""}`}
                onClick={() => {
                  setActive(post);
                  setViewMode("preview");
                }}
              >
                {post.title}
              </button>
            ))}
          </div>
        ) : null}
        {editing ? (
          <div className="flex justify-end">
            <button type="button" className="lrp-btn lrp-btn-secondary" onClick={() => setViewMode("preview")}>
              Back to preview
            </button>
          </div>
        ) : null}

        {editing && error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-[#D63A2F]">{error}</p>
        ) : null}

        {filteredPosts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#E5E7EB] bg-[#F9FAFB] px-4 py-10 text-center">
            <p className="font-semibold text-[#111827]">No articles yet</p>
            <p className="mt-1 text-sm text-[#6B7280]">Write an article above to see drafts here.</p>
          </div>
        ) : active ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={statusBadge(active.status)}>{active.status}</span>
                <div className="flex gap-1 rounded-full bg-[#F3F4F6] p-1">
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${viewMode === "preview" ? "bg-white text-[#111827] shadow-sm" : "text-[#6B7280]"}`}
                    onClick={() => setViewMode("preview")}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${viewMode === "edit" ? "bg-white text-[#111827] shadow-sm" : "text-[#6B7280]"}`}
                    onClick={() => setViewMode("edit")}
                  >
                    Edit
                  </button>
                </div>
              </div>
              {active.status !== "published" ? (
                <button
                  type="button"
                  className="lrp-btn lrp-btn-primary !min-h-9 !px-4 !text-xs"
                  onClick={onPublish}
                  disabled={Boolean(busy)}
                >
                  {busy === "Publishing…" ? "Publishing…" : "Publish article"}
                </button>
              ) : null}
            </div>

            {viewMode === "preview" ? (
              <article className="blog-preview">
                <div
                  className="blog-preview__body"
                  dangerouslySetInnerHTML={{ __html: active.body || "<p>No content yet.</p>" }}
                />
                {metaDesc ? (
                  <p className="blog-preview__meta">
                    <span>Meta</span> {metaDesc}
                  </p>
                ) : null}
                {active.remote_url ? (
                  <a href={active.remote_url} target="_blank" rel="noreferrer" className="text-sm text-[var(--brand-600)] underline">
                    Open published URL
                  </a>
                ) : null}
              </article>
            ) : (
              <div className="blog-cms space-y-4 pb-20">
                <section className="blog-cms__card">
                  <h3>Title</h3>
                  {metaStr(active, "category") ? (
                    <p className="blog-cms__note">Category: {metaStr(active, "category")}</p>
                  ) : null}
                  <label className="blog-cms__field">
                    <span>Post title</span>
                    <input
                      value={active.title}
                      onChange={(e) => setActive({ ...active, title: e.target.value })}
                      placeholder="Post title"
                    />
                    {titleLen > 0 && titleLen < 15 ? (
                      <em className="blog-cms__warn">Title is too short. Use at least 15 characters.</em>
                    ) : (
                      <em className="blog-cms__hint">{titleLen}/15+ characters</em>
                    )}
                  </label>
                  <label className="blog-cms__field">
                    <span>URL slug</span>
                    <input
                      value={active.slug}
                      onChange={(e) => setActive({ ...active, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
                      placeholder="my-article-slug"
                    />
                    {!active.slug || slugOk(active.slug) ? (
                      <em className="blog-cms__hint">https://{publishHost}/blogs/{active.slug || "my-article"}</em>
                    ) : (
                      <em className="blog-cms__warn">URL slug must be lowercase letters, numbers, and hyphens only.</em>
                    )}
                  </label>
                </section>

                <section className="blog-cms__card">
                  <h3>Editor</h3>
                  <p className="blog-cms__note">Use headings and lists for a clear published layout.</p>
                  <BlogRichEditor
                    value={active.body}
                    onChange={(html) => setActive({ ...active, body: html })}
                    disabled={Boolean(busy)}
                    siteHost={publishHost}
                    internalPosts={posts
                      .filter((p) => p.website_id === selectedId && p.id !== active.id && p.slug)
                      .map((p) => ({ id: p.id, title: p.title, slug: p.slug }))}
                  />
                </section>

                <section className="blog-cms__card">
                  <h3>Featured image</h3>
                  <div className="blog-cms__image-actions">
                    <label className="lrp-btn lrp-btn-secondary blog-cms__upload-btn">
                      {uploadingImage ? "Uploading…" : "Upload image"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
                        hidden
                        disabled={Boolean(busy) || uploadingImage}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file || !active) return;
                          setUploadingImage(true);
                          setError("");
                          try {
                            const slugHint = (active.slug || active.title || "image").trim();
                            const uploaded = await uploadBlogImage(file, slugHint);
                            patchMeta("featured_image_url", uploaded.url);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Image upload failed");
                          } finally {
                            setUploadingImage(false);
                          }
                        }}
                      />
                    </label>
                    {featuredImage ? (
                      <button
                        type="button"
                        className="lrp-btn lrp-btn-ghost"
                        disabled={Boolean(busy) || uploadingImage}
                        onClick={() => patchMeta("featured_image_url", "")}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <label className="blog-cms__field">
                    <span>Or image URL</span>
                    <input
                      value={featuredImage}
                      onChange={(e) => patchMeta("featured_image_url", e.target.value)}
                      placeholder="https://…/cover.jpg"
                      disabled={uploadingImage}
                    />
                  </label>
                  {featuredImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaUrl(featuredImage)} alt="" className="blog-cms__cover" />
                  ) : (
                    <p className="blog-cms__note">
                      Upload a cover image. The file is saved with a slugified name from the article slug.
                    </p>
                  )}
                </section>

                <section className="blog-cms__card">
                  <h3>SEO Meta</h3>
                  <label className="blog-cms__field">
                    <span>Focus keyword</span>
                    <input
                      value={focusKw}
                      onChange={(e) => patchMeta("focus_keyword", e.target.value)}
                      placeholder="Primary keyword"
                      maxLength={80}
                    />
                    <em className="blog-cms__hint">{focusKw.length}/80</em>
                  </label>
                  <label className="blog-cms__field">
                    <span>Meta title</span>
                    <input
                      value={metaTitle}
                      onChange={(e) => patchMeta("meta_title", e.target.value)}
                      placeholder="SEO title"
                      maxLength={60}
                    />
                    {metaTitle.trim().length > 0 && metaTitle.trim().length < 30 ? (
                      <em className="blog-cms__warn">Meta title is too short.</em>
                    ) : (
                      <em className="blog-cms__hint">{metaTitle.length}/60</em>
                    )}
                  </label>
                  <label className="blog-cms__field">
                    <span>Meta description</span>
                    <textarea
                      value={metaDesc}
                      onChange={(e) => patchMeta("meta_description", e.target.value)}
                      rows={3}
                      maxLength={155}
                      placeholder="Search snippet for this article"
                    />
                    {metaDesc.trim().length > 0 && metaDesc.trim().length < 50 ? (
                      <em className="blog-cms__warn">Meta description should be at least 50 characters.</em>
                    ) : (
                      <em className="blog-cms__hint">{metaDesc.length}/155</em>
                    )}
                  </label>
                </section>

                <div className="blog-cms__sticky">
                  <p className="blog-cms__sticky-note">
                    {titleLen < 15 || !slugOk(active.slug)
                      ? "Fix title/slug before publishing. Drafts can still be saved after fixes."
                      : "Ready to save or publish."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="lrp-btn lrp-btn-secondary" onClick={onSaveEdits} disabled={Boolean(busy)}>
                      Save draft
                    </button>
                    <button type="button" className="lrp-btn lrp-btn-primary" onClick={onPublish} disabled={Boolean(busy)}>
                      Publish article
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-16 text-center text-sm text-[#6B7280]">Write an article to preview it here.</div>
        )}
      </section>
      ) : null}
    </div>
  );
}
