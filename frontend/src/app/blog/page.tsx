"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PublicSiteHeader } from "@/components/PublicSiteHeader";
import { PlatformBlog, listPlatformBlogs } from "@/lib/api";

export default function BlogIndexPage() {
  const [posts, setPosts] = useState<PlatformBlog[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listPlatformBlogs()
      .then(setPosts)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load blogs"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-full flex-1 bg-sm-canvas text-sm-ink">
      <PublicSiteHeader variant="light" />
      <main className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6 sm:pb-20">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Blog</h1>
        <p className="mt-2 max-w-xl text-sm text-sm-muted">
          Product updates, lead-gen playbooks, and publishing tips from LeadRankPilot.
        </p>

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
        ) : error ? null : posts.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-[#E5E7EB] bg-white px-6 py-12 text-center">
            <p className="text-sm text-sm-muted">No published posts yet. Check back soon.</p>
          </div>
        ) : (
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {posts.map((post) => (
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
        )}
      </main>
    </div>
  );
}
