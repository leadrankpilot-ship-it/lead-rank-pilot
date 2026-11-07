import { Suspense } from "react";
import { SkeletonBones } from "@/components/ui";
import { EditBlogClient } from "./EditBlogClient";

export const instant = false;

export default function AdminEditBlogPage() {
  return (
    <Suspense
      fallback={
        <div className="lrp-card">
          <SkeletonBones rows={6} />
        </div>
      }
    >
      <EditBlogClient />
    </Suspense>
  );
}
