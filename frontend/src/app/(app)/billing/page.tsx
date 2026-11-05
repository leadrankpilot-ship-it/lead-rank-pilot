"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Subscription, getSubscription, mockActivatePlan, startCheckout } from "@/lib/api";

function BillingInner() {
  const params = useSearchParams();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");

  const refresh = useCallback(async () => {
    setSub(await getSubscription());
  }, []);

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [refresh]);

  useEffect(() => {
    const checkout = params.get("checkout");
    if (checkout === "success") setNote("Checkout completed. Plan refresh may take a moment.");
    if (checkout === "cancel") setNote("Checkout canceled.");
  }, [params]);

  async function upgrade(plan: "starter" | "pro") {
    setBusy(plan);
    setError("");
    try {
      const session = await startCheckout(plan);
      window.location.href = session.checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setBusy("");
    }
  }

  async function downgradeFree() {
    setBusy("free");
    setError("");
    try {
      const next = await mockActivatePlan("free");
      setSub(next);
      setNote("Moved to Free plan.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Downgrade failed");
    } finally {
      setBusy("");
    }
  }

  if (!sub) {
    return <p className="text-sm text-sm-muted">Loading billing…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {note ? <p className="text-sm font-medium text-sm-success">{note}</p> : null}
      {error ? <p className="text-sm text-sm-danger">{error}</p> : null}

      <section className="lrp-card space-y-3">
        <p className="lrp-panel-title">Current subscription</p>
        <h2 className="text-2xl font-semibold">
          {sub.plan_name}{" "}
          <span className="lrp-badge lrp-badge-orange align-middle">{sub.plan_id}</span>
        </h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-sm-muted">Status</dt>
            <dd className="font-medium">{sub.billing_status}</dd>
          </div>
          <div>
            <dt className="text-sm-muted">Mode</dt>
            <dd className="font-medium">{sub.billing_mode}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-sm-muted">Caps</dt>
            <dd className="font-medium">
              {sub.blog_daily_quota} blogs/day · {sub.search_daily_quota} searches/day ·{" "}
              {sub.websites_max} sites
            </dd>
          </div>
          {sub.plan_renews_at ? (
            <div className="sm:col-span-2">
              <dt className="text-sm-muted">Renews</dt>
              <dd className="font-medium">{new Date(sub.plan_renews_at).toLocaleString()}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="lrp-card space-y-4">
        <p className="lrp-panel-title">Change plan</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="lrp-btn lrp-btn-primary"
            disabled={!!busy}
            onClick={() => upgrade("starter")}
          >
            {busy === "starter" ? "…" : "Upgrade Starter"}
          </button>
          <button
            type="button"
            className="lrp-btn lrp-btn-primary"
            disabled={!!busy}
            onClick={() => upgrade("pro")}
          >
            {busy === "pro" ? "…" : "Upgrade Pro"}
          </button>
          {sub.billing_mode === "mock" ? (
            <button
              type="button"
              className="lrp-btn lrp-btn-secondary"
              disabled={!!busy}
              onClick={downgradeFree}
            >
              {busy === "free" ? "…" : "Downgrade Free (mock)"}
            </button>
          ) : null}
          <Link href="/pricing" className="lrp-btn lrp-btn-ghost">
            Compare plans
          </Link>
        </div>
      </section>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<p className="text-sm text-sm-muted">Loading…</p>}>
      <BillingInner />
    </Suspense>
  );
}
