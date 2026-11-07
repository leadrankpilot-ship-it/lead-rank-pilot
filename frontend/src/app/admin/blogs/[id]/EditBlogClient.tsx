"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminBlogEditor } from "@/components/AdminBlogEditor";
import { AdminBlog, fetchAdminBlog, fetchAdminBlogs } from "@/lib/admin-api";
import { SkeletonBones } from "@/components/ui";

export function EditBlogClient() {
  const params = useParams();
  const id = Number(params.id);
  const [blog, setBlog] = useState<AdminBlog | null>(null);
  const [blogs, setBlogs] = useState<AdminBlog[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setError("Invalid blog id");
      setLoading(false);
      return;
    }
    Promise.all([fetchAdminBlog(id), fetchAdminBlogs()])
      .then(([row, list]) => {
        setBlog(row);
        setBlogs(list);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="lrp-card">
        <SkeletonBones rows={6} />
      </div>
    );
  }
  if (error || !blog) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#D63A2F]">
        {error || "Blog not found"}
      </div>
    );
  }

  return <AdminBlogEditor mode="edit" initial={blog} allBlogs={blogs} />;
}
