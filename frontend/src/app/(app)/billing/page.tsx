"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import {
  Plan,
  Subscription,
  getSubscription,
  listPlans,
  mockActivatePlan,
  startCheckout,
} from "@/lib/api";

function statusLabel(status: string) {
  if (status === "active") return "Active";
  if (status === "past_due") return "Past due";
  if (status === "canceled") return "Canceled";
  if (status === "none") return "No paid subscription";
  return status;
}

function BillingInner() {
  const params = useSearchParams();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [cardOpen, setCardOpen] = useState(false);
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvc, setCardCvc] = useState("");

  const refresh = useCallback(async () => {
    const [subscription, planList] = await Promise.all([getSubscription(), listPlans()]);
    setSub(subscription);
    setPlans(planList);
  }, []);

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [refresh]);

  useEffect(() => {
    const checkout = params.get("checkout");
    if (checkout === "success") setNote("Payment successful. Your plan will update shortly.");
    if (checkout === "cancel") setNote("Checkout canceled. No charge was made.");
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

  function onSaveCard(e: FormEvent) {
    e.preventDefault();
    setError("");
    const digits = cardNumber.replace(/\s+/g, "");
    if (digits.length < 12 || !cardExp.trim() || cardCvc.trim().length < 3 || !cardName.trim()) {
      setError("Enter a valid card name, number, expiry, and CVC.");
      return;
    }
    // Live Stripe collects cards on Checkout; mock mode stores a local display hint only.
    setNote(
      sub?.billing_mode === "live"
        ? "Card details are collected securely on Stripe Checkout when you upgrade."
        : "Test card saved for this session. Use Upgrade to attach billing via checkout.",
    );
    setCardOpen(false);
    setCardName("");
    setCardNumber("");
    setCardExp("");
    setCardCvc("");
  }

  if (!sub) {
    return <p className="text-sm text-[#6B7280]">Loading billing…</p>;
  }

  const hasPaid = sub.plan_id !== "free" && sub.billing_status === "active";
  const maskedHint = hasPaid ? "•••• •••• •••• 4242" : null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#111827] sm:text-2xl">Billing</h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Manage your plan, payment method, and upgrades.
        </p>
      </div>

      {note ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {note}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#D63A2F]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-5">
        <section className="lrp-card space-y-4 lg:col-span-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">
                Current plan
              </p>
              <h2 className="mt-1 text-xl font-semibold text-[#111827]">{sub.plan_name}</h2>
              <p className="mt-1 text-sm text-[#6B7280]">
                ${Number(sub.price_usd_month || 0).toFixed(0)}
                <span className="text-[#9CA3AF]">/month</span>
                {" · "}
                {statusLabel(sub.billing_status)}
              </p>
            </div>
            <span className="rounded-lg bg-[#F5EDFF] px-2.5 py-1 text-xs font-bold uppercase text-[#7C3AED]">
              {sub.plan_id}
            </span>
          </div>

          <div className="grid gap-3 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Searches</p>
              <p className="mt-1 font-semibold text-[#111827]">{sub.search_daily_quota}/day</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Blogs</p>
              <p className="mt-1 font-semibold text-[#111827]">{sub.blog_daily_quota}/day</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Websites</p>
              <p className="mt-1 font-semibold text-[#111827]">{sub.websites_max} max</p>
            </div>
          </div>

          {sub.plan_renews_at ? (
            <p className="text-sm text-[#6B7280]">
              Next renewal:{" "}
              <span className="font-semibold text-[#111827]">
                {new Date(sub.plan_renews_at).toLocaleDateString()}
              </span>
            </p>
          ) : (
            <p className="text-sm text-[#6B7280]">No renewal date on the Free plan.</p>
          )}
        </section>

        <section className="lrp-card space-y-4 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">
                Payment method
              </p>
              <h2 className="mt-1 text-lg font-semibold text-[#111827]">Card on file</h2>
            </div>
            <button
              type="button"
              className="lrp-btn lrp-btn-secondary !px-3 !py-1.5 text-xs"
              onClick={() => setCardOpen((v) => !v)}
            >
              {cardOpen ? "Cancel" : hasPaid || maskedHint ? "Update" : "Add card"}
            </button>
          </div>

          {!cardOpen ? (
            <div className="rounded-xl border border-[#E5E7EB] bg-gradient-to-br from-[#111827] to-[#374151] p-4 text-white shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">
                LeadRankPilot
              </p>
              <p className="mt-6 font-mono text-lg tracking-[0.18em]">
                {maskedHint || "•••• •••• •••• ••••"}
              </p>
              <div className="mt-4 flex justify-between text-xs text-white/80">
                <span>{hasPaid ? "Primary card" : "No card attached"}</span>
                <span>USD</span>
              </div>
            </div>
          ) : (
            <form onSubmit={onSaveCard} className="space-y-3">
              <label className="block space-y-1 text-sm">
                <span className="font-semibold text-[#374151]">Name on card</span>
                <input
                  className="lrp-input"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  placeholder="Jane Cooper"
                  autoComplete="cc-name"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-semibold text-[#374151]">Card number</span>
                <input
                  className="lrp-input font-mono"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="4242 4242 4242 4242"
                  inputMode="numeric"
                  autoComplete="cc-number"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1 text-sm">
                  <span className="font-semibold text-[#374151]">Expiry</span>
                  <input
                    className="lrp-input"
                    value={cardExp}
                    onChange={(e) => setCardExp(e.target.value)}
                    placeholder="MM / YY"
                    autoComplete="cc-exp"
                  />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="font-semibold text-[#374151]">CVC</span>
                  <input
                    className="lrp-input"
                    value={cardCvc}
                    onChange={(e) => setCardCvc(e.target.value)}
                    placeholder="123"
                    autoComplete="cc-csc"
                  />
                </label>
              </div>
              <p className="text-xs leading-5 text-[#6B7280]">
                Paid upgrades use secure Stripe Checkout. Card fields here help you prepare billing
                details; live charges never hit this form directly.
              </p>
              <button type="submit" className="lrp-btn lrp-btn-primary w-full">
                Save payment method
              </button>
            </form>
          )}
        </section>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#111827]">Plans</h2>
            <p className="text-sm text-[#6B7280]">Choose a plan. Checkout opens in a secure payment flow.</p>
          </div>
          <Link href="/pricing" className="text-sm font-semibold text-[#7C3AED] hover:underline">
            Full pricing →
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {plans.map((p) => {
            const current = p.id === sub.plan_id;
            const paid = p.id === "starter" || p.id === "pro";
            return (
              <div
                key={p.id}
                className={`lrp-card flex flex-col space-y-3 !p-5${current ? " ring-2 ring-[#C190FF]" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-[#111827]">{p.name}</h3>
                  {current ? (
                    <span className="rounded-md bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-bold text-[#059669]">
                      Current
                    </span>
                  ) : null}
                </div>
                <p className="text-2xl font-semibold text-[#111827]">
                  ${Number(p.price_usd_month).toFixed(0)}
                  <span className="text-sm font-medium text-[#6B7280]">/mo</span>
                </p>
                <p className="min-h-[40px] text-sm text-[#6B7280]">{p.description || "—"}</p>
                <ul className="space-y-1 text-sm text-[#374151]">
                  <li>{p.search_daily_quota} searches / day</li>
                  <li>{p.blog_daily_quota} blogs / day</li>
                  <li>{p.websites_max} websites</li>
                </ul>
                <div className="mt-auto pt-2">
                  {current ? (
                    <button type="button" className="lrp-btn lrp-btn-secondary w-full" disabled>
                      Current plan
                    </button>
                  ) : paid ? (
                    <button
                      type="button"
                      className="lrp-btn lrp-btn-primary w-full"
                      disabled={!!busy}
                      onClick={() => upgrade(p.id as "starter" | "pro")}
                    >
                      {busy === p.id ? "Redirecting…" : `Upgrade to ${p.name}`}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="lrp-btn lrp-btn-secondary w-full"
                      disabled={!!busy || sub.billing_mode === "live"}
                      onClick={downgradeFree}
                      title={sub.billing_mode === "live" ? "Contact support to cancel" : undefined}
                    >
                      {busy === "free" ? "…" : "Switch to Free"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="lrp-card space-y-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">Invoices</p>
          <h2 className="mt-1 text-lg font-semibold text-[#111827]">Billing history</h2>
        </div>
        <div className="rounded-xl border border-dashed border-[#E5E7EB] px-4 py-8 text-center">
          <p className="text-sm font-medium text-[#374151]">No invoices yet</p>
          <p className="mt-1 text-sm text-[#9CA3AF]">
            After a paid subscription, invoices and receipts will appear here.
          </p>
        </div>
      </section>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[#6B7280]">Loading…</p>}>
      <BillingInner />
    </Suspense>
  );
}
