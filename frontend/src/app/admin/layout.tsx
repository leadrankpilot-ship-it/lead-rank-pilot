import { Suspense, type ReactNode } from "react";
import { AdminLayoutClient } from "./AdminLayoutClient";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="smx-layout min-h-screen bg-[#f4f5f5]" />}>
      <AdminLayoutClient>{children}</AdminLayoutClient>
    </Suspense>
  );
}
