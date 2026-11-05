import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="smx-layout min-h-screen bg-[#f4f5f5]" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
