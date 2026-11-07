"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plan, getToken, listPlans, startCheckout } from "@/lib/api";

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    listPlans()
      .then(setPlans)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load plans"));
  }, []);

  async function onSelect(planId: string) {
    setError("");
    if (planId === "free") {
      window.location.href = "/register";
      return;
    }
    if (!getToken()) {
      window.location.href = `/login?next=/pricing`;
      return;
    }
    setBusy(planId);
    try {
      const session = await startCheckout(planId as "starter" | "pro");
      window.location.href = session.checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setBusy("");
    }
  }

  return (
    <div className="min-h-full flex-1 bg-sm-canvas text-sm-ink">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-sm-orange text-sm font-bold text-white">
            L
          </span>
          <span className="text-sm font-semibold tracking-tight">LeadRankPilot</span>
        </Link>
        <Link href="/billing" className="text-sm font-semibold text-sm-orange hover:underline">
          Account billing
        </Link>
      </header>
      <main className="mx-auto w-full max-w-5xl px-6 pb-20">
        <h1 className="text-3xl font-semibold tracking-tight">Plans</h1>
        <p className="mt-2 max-w-xl text-sm-muted">
          Usage caps scale with your plan. Paid tiers keep healthy margins after AI and crawl costs.
        </p>
        {error ? <p className="mt-4 text-sm text-sm-danger">{error}</p> : null}
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`lrp-card flex flex-col ${
                p.id === "starter" ? "border-sm-orange ring-1 ring-sm-orange" : ""
              }`}
            >
              {p.id === "starter" ? (
                <span className="lrp-badge lrp-badge-orange mb-3 w-fit">Popular</span>
              ) : null}
              <p className="lrp-panel-title">{p.name}</p>
              <p className="mt-3 text-3xl font-semibold">
                {p.price_usd_month === 0 ? "$0" : `$${p.price_usd_month}`}
                <span className="text-base font-normal text-sm-muted">/mo</span>
              </p>
              <p className="mt-3 flex-1 text-sm leading-6 text-sm-muted">{p.description}</p>
              <ul className="mt-5 space-y-1 text-sm text-sm-ink">
                <li>{p.blog_daily_quota} AI drafts / day</li>
                <li>{p.search_daily_quota} searches / day</li>
                <li>Up to {p.websites_max} sites</li>
              </ul>
              <button
                type="button"
                disabled={busy === p.id}
                onClick={() => onSelect(p.id)}
                className={`mt-6 w-full lrp-btn ${
                  p.id === "starter" ? "lrp-btn-primary" : "lrp-btn-secondary"
                }`}
              >
                {busy === p.id ? "Redirecting…" : p.id === "free" ? "Start free" : "Choose plan"}
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
