import { Suspense } from "react";
import { PostClient } from "./PostClient";

export const instant = false;

export default function BlogPostPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-sm-muted">Loading…</p>}>
      <PostClient />
    </Suspense>
  );
}
