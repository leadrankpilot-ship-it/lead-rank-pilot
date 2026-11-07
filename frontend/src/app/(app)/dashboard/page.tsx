"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SkeletonBones } from "@/components/ui";
import {
  BlogPost,
  SearchRun,
  Subscription,
  Website,
  fetchMe,
  getBlogQuota,
  getSubscription,
  listBlogPosts,
  listSearches,
  listWebsites,
} from "@/lib/api";

type BlogQuota = { used: number; limit: number; remaining: number };

function billingLabel(status: string | undefined) {
  const s = (status || "none").toLowerCase();
  if (s === "active") return "Active";
  if (s === "past_due") return "Past due";
  if (s === "canceled") return "Canceled";
  return "Free access";
}

function Meter({ used, max, label }: { used: number; max: number; label: string }) {
  const safeMax = Math.max(max, 1);
  const pct = Math.min(100, Math.round((used / safeMax) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">{label}</p>
        <p className="text-xs font-semibold text-[#111827]">
          {used}
          <span className="font-normal text-[#9CA3AF]"> / {max}</span>
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E5E7EB]">
        <div className="h-full rounded-full bg-[#111827] transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [email, setEmail] = useState("");
  const [sub, setSub] = useState<Subscription | null>(null);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [searches, setSearches] = useState<SearchRun[]>([]);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [blogQuota, setBlogQuota] = useState<BlogQuota>({ used: 0, limit: 0, remaining: 0 });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [me, subscription, sites, runs, blogPosts, quota] = await Promise.all([
      fetchMe().catch(() => null),
      getSubscription().catch(() => null),
      listWebsites().catch(() => [] as Website[]),
      listSearches().catch(() => [] as SearchRun[]),
      listBlogPosts().catch(() => [] as BlogPost[]),
      getBlogQuota().catch(() => ({ used: 0, limit: 0, remaining: 0 })),
    ]);
    setEmail(me?.email || "");
    setSub(subscription);
    setWebsites(sites);
    setSearches(runs);
    setPosts(blogPosts);
    setBlogQuota(quota);
  }, []);

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [refresh]);

  const stats = useMemo(() => {
    const leadResults = searches
      .filter((s) => (s.mode || "leads") === "leads")
      .reduce((n, s) => n + (s.result_count || 0), 0);
    const contactResults = searches
      .filter((s) => {
        const m = s.mode || "";
        return m === "contacts" || m === "manual_contacts";
      })
      .reduce((n, s) => n + (s.result_count || 0), 0);
    const published = posts.filter((p) => (p.status || "").toLowerCase() === "published").length;
    const drafts = posts.length - published;
    const confirmedSites = websites.filter((w) => w.ownership_confirmed_at || w.profile_confirmed_at).length;
    return {
      leadResults,
      contactResults,
      published,
      drafts,
      totalPosts: posts.length,
      sitesMax: sub?.websites_max ?? 1,
      confirmedSites,
      searchQuota: sub?.search_daily_quota ?? 0,
      blogDaily: sub?.blog_daily_quota ?? 0,
    };
  }, [searches, posts, websites, sub]);

  if (loading) {
    return (
      <div className="space-y-6 pt-2">
        <div className="lrp-card !p-5">
          <SkeletonBones rows={3} />
        </div>
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

  const firstName = email.includes("@") ? email.split("@")[0] : email || "there";
  const planName = sub?.plan_name || "Free";
  const price = Number(sub?.price_usd_month || 0);
  const renewText = sub?.plan_renews_at
    ? `Renews ${new Date(sub.plan_renews_at).toLocaleDateString()}`
    : price > 0
      ? `$${price.toFixed(0)}/month`
      : "No renewal on Free";

  const cards = [
    {
      label: "Leads found",
      value: stats.leadResults,
      hint: "Businesses from Maps lead search",
      href: "/leads",
    },
    {
      label: "Contacts found",
      value: stats.contactResults,
      hint: "Emails & phones from contact finder",
      href: "/contacts",
    },
    {
      label: "Connected sites",
      value: websites.length,
      hint: `${stats.confirmedSites} ready · ${websites.length} of ${stats.sitesMax} allowed`,
      href: "/blogs",
    },
    {
      label: "AI blog posts",
      value: stats.totalPosts,
      hint:
        blogQuota.limit > 0
          ? `${blogQuota.remaining} generations left today`
          : stats.drafts > 0
            ? `${stats.drafts} still in draft`
            : "Generate from a connected site",
      href: "/blogs",
    },
    {
      label: "Published blogs",
      value: stats.published,
      hint: stats.published ? "Live on your connected sites" : "Approve & publish from AI blogs",
      href: "/blogs",
    },
  ];

  return (
    <div className="pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#111827]">
            Welcome back, {firstName}
          </h1>
        </div>
        <Link
          href="/billing"
          className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-semibold text-[#111827] hover:bg-[#F9FAFB]"
        >
          Manage billing
        </Link>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#D63A2F]">
          {error}
        </div>
      ) : null}

      <section className="lrp-card mt-6 !p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">
              Current plan
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-[#111827]">{planName}</h2>
              <span className="rounded-md bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#374151]">
                {billingLabel(sub?.billing_status)}
              </span>
            </div>
            <p className="mt-1 text-sm text-[#6B7280]">
              {price > 0 ? `$${price.toFixed(0)}/month` : "Free plan"}
              {" · "}
              {renewText}
            </p>
          </div>
          <div className="grid min-w-[220px] flex-1 gap-4 sm:grid-cols-3 sm:max-w-xl">
            <Meter used={websites.length} max={stats.sitesMax} label="Sites" />
            <Meter
              used={blogQuota.used}
              max={blogQuota.limit || sub?.blog_daily_quota || 1}
              label="Blogs today"
            />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                Daily limits
              </p>
              <p className="mt-2 text-sm font-semibold text-[#111827]">
                {stats.searchQuota} searches
              </p>
              <p className="text-xs text-[#9CA3AF]">{stats.blogDaily} blogs / day</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((m) => (
          <Link key={m.label} href={m.href} className="lrp-card lrp-card-interactive !p-4 !py-5 block">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">{m.label}</p>
            <p className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-[#111827]">{m.value}</p>
            <p className="mt-1 text-sm text-[#9CA3AF]">{m.hint}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
