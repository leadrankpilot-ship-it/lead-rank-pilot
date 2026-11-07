"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useRef, useState } from "react";
import {
  AdminBlog,
  AdminRelatedLink,
  createAdminBlog,
  updateAdminBlog,
  uploadAdminBlogImage,
} from "@/lib/admin-api";

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "blog-post"
  );
}

function todayInput() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

type Props = {
  mode: "create" | "edit";
  initial?: AdminBlog | null;
  allBlogs?: AdminBlog[];
};

export function AdminBlogEditor({ mode, initial = null, allBlogs = [] }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(initial?.title || "");
  const [slug, setSlug] = useState(initial?.slug || "");
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));
  const [excerpt, setExcerpt] = useState(initial?.excerpt || "");
  const [body, setBody] = useState(initial?.body || "");
  const [coverUrl, setCoverUrl] = useState(initial?.cover_image_url || "");
  const [publishedOn, setPublishedOn] = useState(initial?.published_on?.slice(0, 10) || todayInput());
  const [readTime, setReadTime] = useState(initial?.read_time || "5 min");
  const [status, setStatus] = useState<"draft" | "published">(
    initial?.status === "published" ? "published" : "draft",
  );
  const [related, setRelated] = useState<AdminRelatedLink[]>(initial?.related_links || []);
  const [pickBlogId, setPickBlogId] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const publishedChoices = useMemo(
    () =>
      allBlogs.filter(
        (b) => b.status === "published" && (!initial || b.id !== initial.id) && !related.some((r) => r.related_post_id === b.id),
      ),
    [allBlogs, initial, related],
  );

  function onTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function onUpload(file: File | null) {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const saved = await uploadAdminBlogImage(file, slug || title);
      setCoverUrl(saved.url);
      setNote("Cover image uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function addExisting() {
    const id = Number(pickBlogId);
    const post = allBlogs.find((b) => b.id === id);
    if (!post) return;
    setRelated((prev) => [
      ...prev,
      { title: post.title, url: `/blog/${post.slug}`, related_post_id: post.id },
    ]);
    setPickBlogId("");
  }

  function addCustom() {
    const t = customTitle.trim();
    const u = customUrl.trim();
    if (!t || !u) {
      setError("Enter both link title and URL.");
      return;
    }
    setRelated((prev) => [...prev, { title: t, url: u }]);
    setCustomTitle("");
    setCustomUrl("");
    setError("");
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNote("");
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    const payload = {
      title: title.trim(),
      slug: slug.trim() || slugify(title),
      excerpt: excerpt.trim(),
      body,
      cover_image_url: coverUrl.trim(),
      published_on: publishedOn || null,
      read_time: readTime.trim() || "5 min",
      related_links: related,
      status,
    };
    try {
      if (mode === "create") {
        const created = await createAdminBlog(payload);
        setNote("Blog post saved.");
        router.replace(`/admin/blogs/${created.id}`);
      } else if (initial) {
        await updateAdminBlog(initial.id, payload);
        setNote("Blog post updated.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/blogs"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F9FAFB]"
          aria-label="Back to blogs"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <h1 className="smx-report-title !m-0">{mode === "create" ? "New Blog Post" : "Edit Blog Post"}</h1>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#D63A2F]">{error}</div>
      ) : null}
      {note ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{note}</div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="lrp-card space-y-4 !p-5">
          <label className="block space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">Title</span>
            <input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="e.g. Building AI Agents in Production"
              className="lrp-input"
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">
              Slug (auto-generated)
            </span>
            <input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              placeholder="auto-generated-from-title"
              className="lrp-input font-mono text-sm"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">
              Excerpt (short summary)
            </span>
            <input
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="One sentence summary shown on blog list"
              className="lrp-input"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">
              Content (full blog body)
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your full blog post here..."
              className="lrp-input min-h-[320px] resize-y font-normal leading-6"
            />
          </label>
        </section>

        <aside className="space-y-4">
          <section className="lrp-card space-y-3 !p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">Cover image</p>
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#D1D5DB] bg-[#F9FAFB] px-4 py-8 text-center transition hover:border-[#C190FF] hover:bg-[#F5EDFF] disabled:opacity-60"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="1.8" aria-hidden>
                <path d="M12 16V7" />
                <path d="m8.5 10.5 3.5-3.5 3.5 3.5" />
                <path d="M4 16.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5" />
              </svg>
              <span className="text-sm font-semibold text-[#111827]">
                {uploading ? "Uploading…" : "Upload Cover Image from PC"}
              </span>
              <span className="text-xs text-[#6B7280]">Select image file from your device</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => void onUpload(e.target.files?.[0] || null)}
            />
            <input
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="Or paste external image URL..."
              className="lrp-input text-sm"
            />
            {coverUrl ? (
              <img src={coverUrl} alt="Cover preview" className="mt-1 max-h-40 w-full rounded-lg object-cover" />
            ) : null}
          </section>

          <section className="lrp-card grid grid-cols-2 gap-3 !p-5">
            <label className="col-span-2 space-y-1.5 sm:col-span-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">Date</span>
              <input
                type="date"
                value={publishedOn}
                onChange={(e) => setPublishedOn(e.target.value)}
                className="lrp-input"
              />
            </label>
            <label className="col-span-2 space-y-1.5 sm:col-span-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">Read time</span>
              <input
                value={readTime}
                onChange={(e) => setReadTime(e.target.value)}
                placeholder="5 min"
                className="lrp-input"
              />
            </label>
            <label className="col-span-2 space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "draft" | "published")}
                className="lrp-input admin-filter-field"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </label>
            <div className="col-span-2 flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="lrp-btn lrp-btn-primary min-h-11 flex-1 cursor-pointer disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save Post"}
              </button>
              <Link
                href="/admin/blogs"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F9FAFB]"
                aria-label="Close"
              >
                ×
              </Link>
            </div>
          </section>
        </aside>
      </div>

      <section className="lrp-card space-y-4 !p-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">
            Related posts / internal links
          </p>
          <p className="mt-1 text-sm text-[#6B7280]">
            Link older blogs or paste any URL. These show at the bottom of the article.
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">
              Select existing blog
            </span>
            <select
              value={pickBlogId}
              onChange={(e) => setPickBlogId(e.target.value)}
              className="lrp-input admin-filter-field"
            >
              <option value="">Choose a published blog...</option>
              {publishedChoices.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={addExisting}
            disabled={!pickBlogId}
            className="lrp-btn lrp-btn-secondary self-end cursor-pointer disabled:opacity-40"
          >
            + Add
          </button>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">
            Or paste a custom link
          </p>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
            <input
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="Link title"
              className="lrp-input"
            />
            <input
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="https://... or /blog/slug"
              className="lrp-input"
            />
            <button type="button" onClick={addCustom} className="lrp-btn lrp-btn-secondary cursor-pointer">
              + Add
            </button>
          </div>
        </div>

        {related.length === 0 ? (
          <p className="text-sm text-[#9CA3AF]">No related links yet.</p>
        ) : (
          <ul className="divide-y divide-[#F3F4F6] rounded-xl border border-[#E5E7EB]">
            {related.map((link, idx) => (
              <li key={`${link.url}-${idx}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#111827]">{link.title}</p>
                  <p className="truncate font-mono text-xs text-[#6B7280]">{link.url}</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 cursor-pointer text-xs font-semibold text-[#D63A2F]"
                  onClick={() => setRelated((prev) => prev.filter((_, i) => i !== idx))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </form>
  );
}
