"use client";

import { useEffect, useState } from "react";
import { AdminBlogEditor } from "@/components/AdminBlogEditor";
import { AdminBlog, fetchAdminBlogs } from "@/lib/admin-api";

export default function AdminNewBlogPage() {
  const [blogs, setBlogs] = useState<AdminBlog[]>([]);

  useEffect(() => {
    fetchAdminBlogs()
      .then(setBlogs)
      .catch(() => setBlogs([]));
  }, []);

  return <AdminBlogEditor mode="create" allBlogs={blogs} />;
}
