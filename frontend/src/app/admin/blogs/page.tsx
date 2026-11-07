"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminBlog, deleteAdminBlog, fetchAdminBlogs } from "@/lib/admin-api";
import { SkeletonBones } from "@/components/ui";

export default function AdminBlogsPage() {
  const [blogs, setBlogs] = useState<AdminBlog[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setBlogs(await fetchAdminBlogs());
  }, []);

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load blogs"))
      .finally(() => setLoading(false));
  }, [refresh]);

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

      <section className="lrp-card !p-0 overflow-hidden">
        {loading ? (
          <div className="p-5">
            <SkeletonBones rows={4} />
          </div>
        ) : blogs.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-[#9CA3AF]">No blog posts yet.</p>
            <Link href="/admin/blogs/new" className="mt-3 inline-flex text-sm font-semibold text-[#7C3AED] hover:underline">
              Write the first post
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="lrp-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Read time</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {blogs.map((b) => (
                  <tr key={b.id} className={`lrp-row-in${deletingId === b.id ? " opacity-50" : ""}`}>
                    <td>
                      <Link href={`/admin/blogs/${b.id}`} className="font-semibold text-[#111827] hover:underline">
                        {b.title}
                      </Link>
                      <p className="mt-0.5 font-mono text-xs text-[#9CA3AF]">/{b.slug}</p>
                    </td>
                    <td>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase ${
                          b.status === "published"
                            ? "bg-[#ECFDF5] text-[#059669]"
                            : "bg-[#F3F4F6] text-[#6B7280]"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="text-sm text-[#6B7280]">
                      {b.published_on ? new Date(b.published_on).toLocaleDateString() : "—"}
                    </td>
                    <td className="text-sm text-[#6B7280]">{b.read_time || "—"}</td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link
                          href={`/admin/blogs/${b.id}`}
                          className="lrp-btn lrp-btn-secondary !px-2.5 !py-1.5 text-xs"
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          disabled={deletingId === b.id}
                          onClick={() => void onDelete(b.id)}
                          className="lrp-btn lrp-btn-secondary !px-2.5 !py-1.5 text-xs text-[#D63A2F] cursor-pointer disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
