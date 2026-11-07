"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PublicSiteHeader } from "@/components/PublicSiteHeader";
import { BLOG_CATEGORIES, blogCategoryLabel, normalizeBlogCategory } from "@/lib/blog-categories";
import { PlatformBlog, listPlatformBlogs } from "@/lib/api";

const PAGE_SIZE = 9;

export default function BlogIndexPage() {
  const [posts, setPosts] = useState<PlatformBlog[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    listPlatformBlogs()
      .then(setPosts)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load blogs"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (category === "all") return posts;
    return posts.filter((p) => normalizeBlogCategory(p.category) === category);
  }, [posts, category]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagePosts = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function pickCategory(next: string) {
    setCategory(next);
    setPage(1);
  }

  return (
    <div className="min-h-full flex-1 bg-sm-canvas text-sm-ink">
      <PublicSiteHeader variant="light" />
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Blog</h1>
        <p className="mt-2 max-w-xl text-sm text-sm-muted">
          Product updates, lead-gen playbooks, and publishing tips from LeadRankPilot.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => pickCategory("all")}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
              category === "all"
                ? "border-[#C190FF] bg-[#F5EDFF] text-[#7C3AED]"
                : "border-[#E5E7EB] bg-white text-[#6B7280] hover:border-[#C190FF] hover:text-[#7C3AED]"
            }`}
          >
            All
          </button>
          {BLOG_CATEGORIES.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => pickCategory(c.slug)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                category === c.slug
                  ? "border-[#C190FF] bg-[#F5EDFF] text-[#7C3AED]"
                  : "border-[#E5E7EB] bg-white text-[#6B7280] hover:border-[#C190FF] hover:text-[#7C3AED]"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#D63A2F]">
            {error}
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Usually means the API is still deploying or temporarily unavailable—not that posts are missing.
            </p>
          </div>
        ) : null}

        {loading ? (
          <p className="mt-10 text-sm text-sm-muted">Loading posts…</p>
        ) : error ? null : filtered.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-[#E5E7EB] bg-white px-6 py-12 text-center">
            <p className="text-sm text-sm-muted">
              {posts.length === 0
                ? "No published posts yet. Check back soon."
                : "No posts in this category yet."}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {pagePosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/blog/${post.slug}`}
                  className="lrp-card lrp-card-interactive block !p-0 overflow-hidden"
                >
                  {post.cover_image_url ? (
                    <img
                      src={post.cover_image_url}
                      alt=""
                      className="h-40 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-40 items-center justify-center bg-[#F5EDFF] text-sm font-semibold text-[#7C3AED]">
                      LeadRankPilot
                    </div>
                  )}
                  <div className="space-y-2 p-5">
                    <div className="flex flex-wrap gap-2 text-xs font-semibold text-sm-muted">
                      <span className="rounded-md bg-[#F5EDFF] px-2 py-0.5 text-[#7C3AED]">
                        {blogCategoryLabel(post.category)}
                      </span>
                      {post.published_on ? (
                        <span>{new Date(post.published_on).toLocaleDateString()}</span>
                      ) : null}
                      {post.read_time ? <span>· {post.read_time}</span> : null}
                    </div>
                    <h2 className="text-lg font-semibold tracking-tight text-[#111827]">{post.title}</h2>
                    <p className="line-clamp-3 text-sm leading-6 text-sm-muted">
                      {post.excerpt || "Read the full article."}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            {filtered.length > PAGE_SIZE ? (
              <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="lrp-btn lrp-btn-secondary cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <p className="text-sm font-semibold text-[#6B7280]">
                  Page {safePage} of {totalPages}
                </p>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="lrp-btn lrp-btn-secondary cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
