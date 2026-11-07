"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getToken, mockActivatePlan } from "@/lib/api";

function MockConfirmInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login?next=/billing");
      return;
    }
    const plan = (params.get("plan") || "starter") as "starter" | "pro" | "free";
    const token = params.get("token") || "";
    mockActivatePlan(plan, token)
      .then(() => {
        setDone(true);
        router.replace("/billing?checkout=success");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Activation failed"));
  }, [params, router]);

  return (
    <main className="mx-auto max-w-lg px-4 py-10 text-sm sm:px-6 sm:py-16">
      {error ? (
        <>
          <p className="text-red-700">{error}</p>
          <Link href="/billing" className="mt-4 inline-block underline">
            Back to billing
          </Link>
        </>
      ) : (
        <p className="text-zinc-600">{done ? "Activated." : "Confirming mock checkout…"}</p>
      )}
    </main>
  );
}

export default function MockConfirmPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm">Loading…</p>}>
      <MockConfirmInner />
    </Suspense>
  );
}