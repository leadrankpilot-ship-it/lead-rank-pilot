"use client";

import { useEffect, useState } from "react";
import { fetchMe } from "@/lib/api";

export default function ProfilePage() {
  const [email, setEmail] = useState("");
  const [planId, setPlanId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMe()
      .then((me) => {
        setEmail(me.email);
        setPlanId(me.plan_id || "free");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load profile"));
  }, []);

  return (
    <div className="space-y-6">
      <section className="lrp-card space-y-4">
        <h2 className="text-lg font-bold text-[#111827]">Profile</h2>
        <p className="text-sm text-[#6B7280]">
          Your account details. Blog writer profile will connect here later.
        </p>
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-[#D63A2F]">{error}</p>
        ) : null}
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">Email</dt>
            <dd className="mt-1 text-sm font-semibold text-[#111827]">{email || "…"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">Plan</dt>
            <dd className="mt-1 text-sm font-semibold capitalize text-[#111827]">{planId || "…"}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
