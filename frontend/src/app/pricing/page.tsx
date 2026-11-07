"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PublicSiteHeader } from "@/components/PublicSiteHeader";
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
      <PublicSiteHeader variant="light" />
      <main className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6 sm:pb-20">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Plans</h1>
        <p className="mt-2 max-w-xl text-sm text-sm-muted sm:text-[15px]">
          Usage caps scale with your plan. Paid tiers keep healthy margins after AI and crawl costs.
        </p>
        {error ? <p className="mt-4 text-sm text-sm-danger">{error}</p> : null}
        <div className="mt-8 grid gap-4 sm:mt-10 sm:gap-6 md:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`lrp-card flex flex-col !p-5 sm:!p-6 ${
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
                className={`mt-6 w-full lrp-btn min-h-11 ${
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
