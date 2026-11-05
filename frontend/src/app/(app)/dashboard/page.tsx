"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { SkeletonBones } from "@/components/ui";
import {
  SearchRun,
  Subscription,
  Website,
  createWebsite,
  getBlogQuota,
  getSubscription,
  listSearches,
  listWebsites,
} from "@/lib/api";

function modeLabel(mode?: string) {
  if (mode === "contacts") return "Contact finder";
  if (mode === "manual_contacts") return "Manual scraper";
  return "Lead search";
}

function statusTone(status: string) {
  if (status === "completed") return "text-[#059669] bg-[#ECFDF5]";
  if (status === "failed") return "text-[#D63A2F] bg-[#FEF2F2]";
  if (status === "running" || status === "queued") return "text-[#7C3AED] bg-[#F5EDFF]";
  return "text-[#6B7280] bg-[#F3F4F6]";
}

function statusLabel(status: string) {
  if (status === "completed") return "Completed";
  if (status === "running") return "Running";
  if (status === "queued") return "Queued";
  if (status === "failed") return "Failed";
  return status;
}

export default function DashboardPage() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [searches, setSearches] = useState<SearchRun[]>([]);
  const [blogQuota, setBlogQuota] = useState({ used: 0, limit: 0, remaining: 0 });
  const [siteUrl, setSiteUrl] = useState("");
  const [addingSite, setAddingSite] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [subscription, sites, runs, quota] = await Promise.all([
      getSubscription().catch(() => null),
      listWebsites().catch(() => [] as Website[]),
      listSearches().catch(() => [] as SearchRun[]),
      getBlogQuota().catch(() => ({ used: 0, limit: 0, remaining: 0 })),
    ]);
    setSub(subscription);
    setWebsites(sites);
    setSearches(runs);
    setBlogQuota(quota);
  }, []);

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load workspace"))
      .finally(() => setLoading(false));
  }, [refresh]);

  const recent = useMemo(() => searches.slice(0, 30), [searches]);

  const stats = useMemo(() => {
    const leadRuns = searches.filter((s) => (s.mode || "leads") === "leads");
    const contactRuns = searches.filter((s) => {
      const m = s.mode || "";
      return m === "contacts" || m === "manual_contacts";
    });
    const running = searches.filter((s) => s.status === "queued" || s.status === "running").length;
    const leadResults = leadRuns.reduce((n, s) => n + (s.result_count || 0), 0);
    const contactResults = contactRuns.reduce((n, s) => n + (s.result_count || 0), 0);
    return {
      leadRuns: leadRuns.length,
      contactRuns: contactRuns.length,
      leadResults,
      contactResults,
      running,
    };
  }, [searches]);

  async function onAddSite(e: FormEvent) {
    e.preventDefault();
    const url = siteUrl.trim();
    if (!url) return;
    setError("");
    const limit = sub?.websites_max ?? 1;
    if (limit > 0 && websites.length >= limit) {
      setError(`You can add up to ${limit} sites`);
      return;
    }
    setAddingSite(true);
    try {
      await createWebsite(url, true);
      setSiteUrl("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add website");
    } finally {
      setAddingSite(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-8 pt-2">
        <div className="grid gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="lrp-card">
              <SkeletonBones rows={2} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const sitesMax = sub?.websites_max ?? 1;
  const searchQuota = sub?.search_daily_quota ?? 0;

  return (
    <div className="space-y-8 pt-2">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#D63A2F]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {[
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
            hint:
              searchQuota > 0
                ? `Search quota ${searchQuota}/day`
                : blogQuota.limit
                  ? `Blog quota ${blogQuota.used}/${blogQuota.limit}`
                  : "Background scrapes",
          },
        ].map((m) => (
          <div key={m.label} className="lrp-card !py-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">{m.label}</p>
            <p className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-[#111827]">{m.value}</p>
            <p className="mt-1 text-sm text-[#9CA3AF]">{m.hint}</p>
          </div>
        ))}
      </div>

      <section className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-[0.06em] text-[#6B7280]">Launch tools</h3>
        <div className="grid gap-5 md:grid-cols-3">
          {[
            {
              href: "/leads",
              title: "Lead search",
              body: "Search Google Maps for businesses without a website, then export CSV.",
              cta: "Start lead search",
            },
            {
              href: "/contacts",
              title: "Contact finder",
              body: "Pull public email and phone from Maps listings or a manual website list.",
              cta: "Start contact finder",
            },
            {
              href: "/blogs",
              title: "AI blogs",
              body: "Connect your site, generate drafts, approve, and publish.",
              cta: "Open AI blogs",
            },
          ].map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="lrp-card lrp-card-interactive block cursor-pointer !p-5 transition hover:-translate-y-0.5"
            >
              <p className="text-[17px] font-semibold text-[#111827]">{card.title}</p>
              <p className="mt-2 text-sm leading-6 text-[#6B7280]">{card.body}</p>
              <p className="mt-4 text-sm font-semibold text-[#7C3AED]">{card.cta} →</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="lrp-card space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">AI blogs</p>
              <h3 className="mt-1 text-lg font-semibold text-[#111827]">Connected websites</h3>
              <p className="mt-1 text-sm text-[#6B7280]">
                Add the site you want AI blogs written for. Profile setup continues in AI blogs.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-[#F3F4F6] px-2.5 py-1 text-[11px] font-bold text-[#6B7280]">
              {websites.length}/{sitesMax}
            </span>
          </div>

          <form onSubmit={onAddSite} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="url"
              required
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              disabled={addingSite || (sitesMax > 0 && websites.length >= sitesMax)}
              className="lrp-input flex-1"
              placeholder="https://yourbusiness.com"
            />
            <button
              type="submit"
              disabled={addingSite || (sitesMax > 0 && websites.length >= sitesMax)}
              className="lrp-btn lrp-btn-primary cursor-pointer disabled:cursor-not-allowed"
            >
              {addingSite ? "Adding…" : "Add website"}
            </button>
          </form>

          <ul className="divide-y divide-[#E5E7EB] text-sm">
            {websites.length === 0 ? (
              <li className="py-3 text-[#9CA3AF]">No website connected yet.</li>
            ) : (
              websites.map((site) => (
                <li key={site.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#111827]">{site.base_url}</p>
                    <p className="text-xs text-[#9CA3AF]">
                      {site.profile_confirmed_at ? "Profile ready" : "Profile setup pending"}
                      {" · "}
                      {site.normalized_domain}
                    </p>
                  </div>
                  <Link href="/blogs" className="lrp-btn lrp-btn-ghost cursor-pointer !text-xs">
                    Manage
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="lrp-card space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">Activity</p>
              <h3 className="mt-1 text-lg font-semibold text-[#111827]">Recent scrapes</h3>
              <p className="mt-1 text-sm text-[#6B7280]">Latest lead and contact jobs from your account.</p>
            </div>
            <Link href="/contacts" className="cursor-pointer text-xs font-semibold text-[#7C3AED]">
              Contact finder
            </Link>
          </div>

          {recent.length === 0 ? (
            <p className="py-3 text-sm text-[#9CA3AF]">
              No scrapes yet. Run Lead search or Contact finder to see jobs here.
            </p>
          ) : (
            <ul className="max-h-[280px] divide-y divide-[#E5E7EB] overflow-y-auto overscroll-contain text-sm pr-1">
              {recent.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#111827]">
                      {modeLabel(s.mode)}
                      {s.mode === "manual_contacts"
                        ? ` · ${s.input_location}`
                        : ` · ${s.input_name}${s.input_location ? ` · ${s.input_location}` : ""}`}
                    </p>
                    <p className="text-xs text-[#9CA3AF]">
                      {s.result_count ? `${s.result_count} results` : "No results yet"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${statusTone(s.status)}`}>
                      {statusLabel(s.status)}
                    </span>
                    <Link
                      href={
                        s.mode === "contacts" || s.mode === "manual_contacts" ? "/contacts" : "/leads"
                      }
                      className="cursor-pointer text-xs font-semibold text-[#7C3AED]"
                    >
                      Open
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
