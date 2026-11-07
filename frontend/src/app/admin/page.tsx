"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminStats,
  AdminStatsFilters,
  fetchAdminFilterOptions,
  fetchAdminStats,
} from "@/lib/admin-api";
import { SkeletonBones } from "@/components/ui";

const WEEKDAYS = [
  { value: "", label: "All days" },
  { value: "sunday", label: "Sunday" },
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
];

const MONTHS = [
  { value: "", label: "All months" },
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const selectClass = "lrp-input admin-filter-field mt-1 cursor-pointer text-sm";

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [date, setDate] = useState("");
  const [weekday, setWeekday] = useState("");

  const filters: AdminStatsFilters = useMemo(
    () => ({
      ...(year ? { year } : {}),
      ...(month ? { month } : {}),
      ...(date ? { date } : {}),
      ...(weekday ? { weekday } : {}),
    }),
    [year, month, date, weekday],
  );

  const hasFilters = Boolean(year || month || date || weekday);

  const years = useMemo(
    () => [
      { value: "", label: "All years" },
      ...availableYears.map((y) => ({ value: String(y), label: String(y) })),
    ],
    [availableYears],
  );

  const refresh = useCallback(async (next: AdminStatsFilters) => {
    setError("");
    setLoading(true);
    try {
      setStats(await fetchAdminStats(next));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdminFilterOptions()
      .then((opts) => {
        setAvailableYears(opts.years || []);
        setYear((prev) => {
          if (!prev) return prev;
          return (opts.years || []).includes(Number(prev)) ? prev : "";
        });
      })
      .catch(() => setAvailableYears([]));
  }, []);

  useEffect(() => {
    void refresh(filters);
  }, [filters, refresh]);

  function clearFilters() {
    setYear("");
    setMonth("");
    setDate("");
    setWeekday("");
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="smx-report-title !m-0">Overview</h1>

      <div className="lrp-card grid grid-cols-1 items-end gap-3 !px-4 !py-4 sm:grid-cols-2 sm:!px-5 lg:flex lg:flex-wrap">
        <label className="block min-w-0 space-y-1 text-xs font-semibold text-[#6B7280]">
          Year
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className={`${selectClass} w-full min-w-0 lg:min-w-[120px]`}
          >
            {years.map((o) => (
              <option key={o.value || "all-y"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-0 space-y-1 text-xs font-semibold text-[#6B7280]">
          Month
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className={`${selectClass} w-full min-w-0 lg:min-w-[140px]`}
          >
            {MONTHS.map((o) => (
              <option key={o.value || "all-m"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-0 space-y-1 text-xs font-semibold text-[#6B7280]">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="lrp-input mt-1 w-full min-w-0 cursor-pointer !py-2.5 !pl-4 !pr-3 text-sm lg:min-w-[160px]"
          />
        </label>

        <label className="block min-w-0 space-y-1 text-xs font-semibold text-[#6B7280]">
          Day
          <select
            value={weekday}
            onChange={(e) => setWeekday(e.target.value)}
            className={`${selectClass} w-full min-w-0 lg:min-w-[140px]`}
          >
            {WEEKDAYS.map((o) => (
              <option key={o.value || "all-d"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={!hasFilters}
          onClick={clearFilters}
          className="lrp-btn lrp-btn-secondary w-full cursor-pointer !px-4 disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-2 lg:w-auto"
        >
          Clear filters
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#D63A2F]">
          {error}
        </div>
      ) : null}

      {loading && !stats ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="lrp-card !p-4">
              <SkeletonBones rows={2} />
            </div>
          ))}
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3${loading ? " opacity-60" : ""}`}>
          {[
            {
              label: "Total revenue",
              value: `$${Number(stats?.mrr_usd ?? 0).toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })}`,
            },
            { label: "Total users", value: stats?.users_total ?? 0 },
            { label: "Active", value: stats?.users_active ?? 0 },
            { label: "Inactive", value: stats?.users_inactive ?? 0 },
            { label: "Free plan", value: stats?.plan_free ?? 0 },
            { label: "Starter plan", value: stats?.plan_starter ?? 0 },
            { label: "Pro plan", value: stats?.plan_pro ?? 0 },
          ].map((m) => (
            <div key={m.label} className="lrp-card !p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">{m.label}</p>
              <p className="mt-1.5 text-[22px] font-semibold tracking-[-0.03em] text-[#111827]">{m.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
