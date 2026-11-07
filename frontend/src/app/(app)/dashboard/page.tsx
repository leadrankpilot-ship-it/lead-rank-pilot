"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SkeletonBones } from "@/components/ui";
import { SearchRun, Website, getSubscription, listSearches, listWebsites } from "@/lib/api";

export default function DashboardPage() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [searches, setSearches] = useState<SearchRun[]>([]);
  const [sitesMax, setSitesMax] = useState(1);
  const [searchQuota, setSearchQuota] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [subscription, sites, runs] = await Promise.all([
      getSubscription().catch(() => null),
      listWebsites().catch(() => [] as Website[]),
      listSearches().catch(() => [] as SearchRun[]),
    ]);
    setWebsites(sites);
    setSearches(runs);
    setSitesMax(subscription?.websites_max ?? 1);
    setSearchQuota(subscription?.search_daily_quota ?? 0);
  }, []);

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [refresh]);

  const stats = useMemo(() => {
    const leadRuns = searches.filter((s) => (s.mode || "leads") === "leads");
    const contactRuns = searches.filter((s) => {
      const m = s.mode || "";
      return m === "contacts" || m === "manual_contacts";
    });
    const running = searches.filter((s) => s.status === "queued" || s.status === "running").length;
    const leadResults = leadRuns.reduce((n, s) => n + (s.result_count || 0), 0);
    const contactResults = contactRuns.reduce((n, s) => n + (s.result_count || 0), 0);
    // Placeholder until deal/revenue tracking exists; keeps a real earnings card on the dashboard.
    const totalEarnings = 0;
    return {
      leadRuns: leadRuns.length,
      contactRuns: contactRuns.length,
      leadResults,
      contactResults,
      running,
      totalEarnings,
    };
  }, [searches]);

  if (loading) {
    return (
      <div className="space-y-6 pt-2">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="lrp-card !p-4">
              <SkeletonBones rows={2} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const cards = [
    {
      label: "Total earnings",
      value: `$${stats.totalEarnings.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })}`,
      hint: "Deal revenue tracking coming soon",
    },
    {
      label: "Lead searches",
      value: stats.leadRuns,
      hint: stats.leadResults ? `${stats.leadResults} leads found` : "No-website Maps leads",
    },
    {
      label: "Contact scrapes",
      value: stats.contactRuns,
      hint: stats.contactResults ? `${stats.contactResults} contacts found` : "Email & phone pulls",
    },
    {
      label: "Connected sites",
      value: websites.length,
      hint: sitesMax ? `${websites.length} of ${sitesMax} allowed` : "For AI blogs",
    },
    {
      label: "Jobs running",
      value: stats.running,
      hint: searchQuota > 0 ? `Search quota ${searchQuota}/day` : "Background scrapes",
    },
  ];

  return (
    <div className="space-y-6 pt-2">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#111827]">Dashboard</h1>
        <p className="mt-1 text-sm text-[#6B7280]">Key stats for your workspace.</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#D63A2F]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((m) => (
          <div key={m.label} className="lrp-card !p-4 !py-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">{m.label}</p>
            <p className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-[#111827]">{m.value}</p>
            <p className="mt-1 text-sm text-[#9CA3AF]">{m.hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
