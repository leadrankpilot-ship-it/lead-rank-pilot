"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AdminBlog, deleteAdminBlog, fetchAdminBlogs } from "@/lib/admin-api";
import { SkeletonBones } from "@/components/ui";

function formatBlogDate(value: string | null) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function AdminBlogsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [blogs, setBlogs] = useState<AdminBlog[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showSaved, setShowSaved] = useState(false);

  const refresh = useCallback(async () => {
    setBlogs(await fetchAdminBlogs());
  }, []);

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load blogs"))
      .finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (searchParams.get("saved") !== "1") return;
    setShowSaved(true);
    router.replace("/admin/blogs", { scroll: false });
  }, [searchParams, router]);

  async function onDelete(id: number) {
    if (!window.confirm("Delete this blog post?")) return;
    setError("");
    setDeletingId(id);
    try {
      await deleteAdminBlog(id);
      setBlogs((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="smx-report-title !m-0">Blogs</h1>
          <p className="mt-1 text-sm text-[#6B7280]">Create and manage LeadRankPilot blog posts.</p>
        </div>
        <Link href="/admin/blogs/new" className="lrp-btn lrp-btn-primary cursor-pointer">
          New blog post
        </Link>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#D63A2F]">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden">
        {loading ? (
          <div className="lrp-card p-5">
            <SkeletonBones rows={4} />
          </div>
        ) : blogs.length === 0 ? (
          <div className="lrp-card px-5 py-10 text-center">
            <p className="text-sm text-[#9CA3AF]">No blog posts yet.</p>
            <Link href="/admin/blogs/new" className="mt-3 inline-flex text-sm font-semibold text-[#7C3AED] hover:underline">
              Write the first post
            </Link>
          </div>
        ) : (
          <div className="leads-scroll-panel admin-blogs-scroll overflow-auto !max-h-[calc(100vh-220px)]">
            <ul className="admin-blogs-cards">
              {blogs.map((b) => {
                const dateLabel = formatBlogDate(b.published_on);
                const meta = [dateLabel, b.read_time || null, b.status].filter(Boolean);
                return (
                  <li
                    key={b.id}
                    className={`admin-blog-card${deletingId === b.id ? " opacity-50" : ""}`}
                  >
                    <div className="admin-blog-card-thumb">
                      {b.cover_image_url ? (
                        <img src={b.cover_image_url} alt="" />
                      ) : (
                        <div className="admin-blog-card-thumb-fallback">LRP</div>
                      )}
                    </div>

                    <div className="admin-blog-card-body">
                      <Link href={`/admin/blogs/${b.id}`} className="admin-blog-card-title">
                        {b.title}
                      </Link>
                      <p className="admin-blog-card-excerpt">
                        {b.excerpt?.trim() || `/${b.slug}`}
                      </p>
                      <p className="admin-blog-card-meta">
                        {meta.map((part, i) => (
                          <span key={`${b.id}-meta-${i}`}>
                            {i > 0 ? <span className="admin-blog-card-dot">·</span> : null}
                            {part}
                          </span>
                        ))}
                      </p>
                    </div>

                    <div className="admin-blog-card-actions">
                      <Link
                        href={`/admin/blogs/${b.id}`}
                        className="admin-blog-icon-btn"
                        aria-label={`Edit ${b.title}`}
                        title="Edit"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </Link>
                      <button
                        type="button"
                        disabled={deletingId === b.id}
                        onClick={() => void onDelete(b.id)}
                        className="admin-blog-icon-btn admin-blog-icon-btn-danger"
                        aria-label={`Delete ${b.title}`}
                        title="Delete"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18" />
                          <path d="M8 6V4h8v2" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {showSaved ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal>
          <div className="w-full max-w-sm rounded-2xl border border-[#E5E7EB] bg-white p-6 text-center shadow-xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#ECFDF5] text-[#059669]">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-[#111827]">Blog saved</p>
            <p className="mt-1 text-sm text-[#6B7280]">Your post is on the list below.</p>
            <button
              type="button"
              className="lrp-btn lrp-btn-primary mt-5 w-full cursor-pointer"
              onClick={() => setShowSaved(false)}
            >
              OK
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminBlogsPage() {
  return (
    <Suspense
      fallback={
        <div className="lrp-card">
          <SkeletonBones rows={4} />
        </div>
      }
    >
      <AdminBlogsPageInner />
    </Suspense>
  );
}
