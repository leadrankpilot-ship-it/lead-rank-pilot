"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PublicSiteHeader } from "@/components/PublicSiteHeader";
import { PlatformBlog, getPlatformBlog } from "@/lib/api";

export function PostClient() {
  const params = useParams();
  const slug = String(params.slug || "");
  const [post, setPost] = useState<PlatformBlog | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) {
      setError("Missing post");
      setLoading(false);
      return;
    }
    getPlatformBlog(slug)
      .then(setPost)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [slug]);

  return (
    <div className="min-h-full flex-1 bg-sm-canvas text-sm-ink">
      <PublicSiteHeader variant="light" />
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6 sm:pb-20">
        <Link href="/blog" className="text-sm font-semibold text-sm-orange hover:underline">
          ← Back to blog
        </Link>

        {loading ? <p className="mt-8 text-sm text-sm-muted">Loading…</p> : null}
        {error ? (
          <div className="mt-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#D63A2F]">
            {error}
          </div>
        ) : null}

        {post ? (
          <article className="mt-6">
            {post.cover_image_url ? (
              <img
                src={post.cover_image_url}
                alt=""
                className="mb-6 max-h-80 w-full rounded-xl object-cover"
              />
            ) : null}
            <div className="flex flex-wrap gap-2 text-xs font-semibold text-sm-muted">
              {post.published_on ? <span>{new Date(post.published_on).toLocaleDateString()}</span> : null}
              {post.read_time ? <span>· {post.read_time}</span> : null}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#111827]">{post.title}</h1>
            {post.excerpt ? <p className="mt-3 text-base leading-7 text-sm-muted">{post.excerpt}</p> : null}
            <div className="prose prose-neutral mt-8 max-w-none whitespace-pre-wrap text-[15px] leading-7 text-[#1F2937]">
              {post.body}
            </div>

            {post.related_links?.length ? (
              <section className="mt-12 border-t border-[#E5E7EB] pt-8">
                <h2 className="text-sm font-bold uppercase tracking-[0.06em] text-[#6B7280]">
                  Related posts / links
                </h2>
                <ul className="mt-4 space-y-2">
                  {post.related_links.map((link, idx) => (
                    <li key={`${link.url}-${idx}`}>
                      <a
                        href={link.url}
                        className="text-sm font-semibold text-[#7C3AED] hover:underline"
                        {...(link.url.startsWith("http")
                          ? { target: "_blank", rel: "noreferrer" }
                          : {})}
                      >
                        {link.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </article>
        ) : null}
      </main>
    </div>
  );
}
