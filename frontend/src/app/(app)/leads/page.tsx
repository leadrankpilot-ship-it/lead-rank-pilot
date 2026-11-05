"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Lead,
  SearchRun,
  claimSearchLeads,
  createSearch,
  downloadLeadsCsvClient,
  getSearch,
  listSearches,
} from "@/lib/api";

type StageKey = "open" | "feed" | "check" | "done";
type ResultsTab = "current" | "saved" | "examples";

const SESSION_CURRENT_KEY = "lrp_leads_current";
const SESSION_SAVED_KEY = "lrp_leads_saved";
const SESSION_EXAMPLES_KEY = "lrp_leads_examples";
const SESSION_EXAMPLES_BIZ_KEY = "lrp_leads_examples_biz";
const SESSION_SAVED_BIZ_KEY = "lrp_leads_saved_biz";
const SESSION_SEEN_KEY = "lrp_leads_seen";
const SESSION_POOL_KEY = "lrp_leads_pool";
const SESSION_LAST_QUERY_KEY = "lrp_leads_last_query";
const SESSION_LAST_POOL_KEY = "lrp_leads_last_pool_key";
const MIXED_BIZ = "__mixed__";
const CACHE_HIT_MS = 12_000; // short wait when serving from pool (same city already scraped)

type SeenBucket = { urls: string[]; phones: string[]; keys: string[] };
type PoolEntry = { leads: Lead[]; examples: Lead[] };
type LastQuery = { businessType: string; location: string; maxResults: number };

function normMapsUrl(url: string | null | undefined): string {
  return (url || "").trim().split("?")[0].replace(/\/+$/, "").toLowerCase();
}

function normPhoneDigits(phone: string | null | undefined): string {
  return (phone || "").replace(/\D/g, "");
}

function readSeenMap(): Record<string, SeenBucket> {
  try {
    const raw = sessionStorage.getItem(SESSION_SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSeenMap(map: Record<string, SeenBucket>) {
  try {
    sessionStorage.setItem(SESSION_SEEN_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function clearSeenMap() {
  try {
    sessionStorage.removeItem(SESSION_SEEN_KEY);
  } catch {
    /* ignore */
  }
}

function normLoc(value: string | null | undefined): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/\s+/g, " ");
}

function poolKey(biz: string, loc: string): string {
  return `${normBiz(biz)}|${normLoc(loc)}`;
}

function readPoolMap(): Record<string, PoolEntry> {
  try {
    const raw = sessionStorage.getItem(SESSION_POOL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writePoolMap(map: Record<string, PoolEntry>) {
  try {
    sessionStorage.setItem(SESSION_POOL_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

function saveLastQuery(biz: string, loc: string, maxResults: number) {
  try {
    const payload: LastQuery = {
      businessType: biz.trim(),
      location: loc.trim(),
      maxResults,
    };
    sessionStorage.setItem(SESSION_LAST_QUERY_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function readLastQuery(): LastQuery | null {
  try {
    const raw = sessionStorage.getItem(SESSION_LAST_QUERY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastQuery;
    if (!parsed?.businessType || !parsed?.location) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveLastPoolKey(key: string) {
  try {
    if (key && key !== "|") sessionStorage.setItem(SESSION_LAST_POOL_KEY, key);
  } catch {
    /* ignore */
  }
}

function readLastPoolKey(): string {
  try {
    return sessionStorage.getItem(SESSION_LAST_POOL_KEY) || "";
  } catch {
    return "";
  }
}

/** Pool hit only for the same business + same location (normalized). New city → fresh dig. */
function resolvePoolKey(biz: string, loc: string): string | null {
  const exact = poolKey(biz, loc);
  if (!exact || exact === "|" || !normBiz(biz) || !normLoc(loc)) return null;
  const map = readPoolMap();
  if (map[exact] && (map[exact].leads.length > 0 || map[exact].examples.length > 0)) {
    return exact;
  }
  return null;
}

function mergeIntoPool(key: string, leads: Lead[], examples: Lead[]) {
  if (!key || key === "|") return;
  const map = readPoolMap();
  const prev = map[key] || { leads: [], examples: [] };
  const byKey = new Map<string, Lead>();
  for (const row of [...prev.leads, ...leads]) {
    if (!row?.dedupe_key) continue;
    byKey.set(row.dedupe_key, row);
  }
  const exBy = new Map<string, Lead>();
  for (const row of [...prev.examples, ...examples]) {
    const k = exampleDedupeKey(row);
    exBy.set(k, row);
  }
  map[key] = { leads: [...byKey.values()], examples: [...exBy.values()] };
  writePoolMap(map);
  saveLastPoolKey(key);
}

function pickFromPool(key: string, limit: number, exclude: { urls: string[]; phones: string[] }): Lead[] {
  const entry = readPoolMap()[key];
  if (!entry?.leads?.length) return [];
  return filterUnseenLeads(entry.leads, exclude).slice(0, Math.max(0, limit));
}

function rememberSeenLeads(biz: string, rows: Lead[]) {
  const key = normBiz(biz);
  if (!key || !rows.length) return;
  const map = readSeenMap();
  const bucket: SeenBucket = map[key] || { urls: [], phones: [], keys: [] };
  const urls = new Set(bucket.urls);
  const phones = new Set(bucket.phones);
  const keys = new Set(bucket.keys);
  for (const row of rows) {
    const url = normMapsUrl(row.source_listing_url);
    const phone = normPhoneDigits(row.phone);
    if (url) urls.add(url);
    if (phone.length >= 8) phones.add(phone);
    if (row.dedupe_key) keys.add(row.dedupe_key);
  }
  map[key] = { urls: [...urls], phones: [...phones], keys: [...keys] };
  writeSeenMap(map);
}

function buildExcludePayload(biz: string, ...groups: Lead[][]): { urls: string[]; phones: string[] } {
  const urls = new Set<string>();
  const phones = new Set<string>();
  const seen = readSeenMap()[normBiz(biz)];
  if (seen) {
    for (const u of seen.urls) urls.add(u);
    for (const p of seen.phones) if (p.length >= 8) phones.add(p);
  }
  for (const group of groups) {
    for (const row of group) {
      const url = normMapsUrl(row.source_listing_url);
      const phone = normPhoneDigits(row.phone);
      if (url) urls.add(url);
      if (phone.length >= 8) phones.add(phone);
    }
  }
  return { urls: [...urls], phones: [...phones] };
}

function filterUnseenLeads(rows: Lead[], exclude: { urls: string[]; phones: string[] }): Lead[] {
  const urls = new Set(exclude.urls);
  const phones = new Set(exclude.phones);
  return rows.filter((row) => {
    const url = normMapsUrl(row.source_listing_url);
    const phone = normPhoneDigits(row.phone);
    if (url && urls.has(url)) return false;
    if (phone.length >= 8 && phones.has(phone)) return false;
    return true;
  });
}

function isExampleLead(lead: Lead): boolean {
  return Boolean(lead.website_url) || lead.website_status === "working";
}

function splitClaimedLeads(rows: Lead[]): { leads: Lead[]; examples: Lead[] } {
  const leads: Lead[] = [];
  const examples: Lead[] = [];
  for (const row of rows) {
    if (isExampleLead(row)) examples.push(row);
    else leads.push(row);
  }
  return { leads, examples };
}

function normBiz(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function exampleDedupeKey(lead: Lead): string {
  const url = (lead.website_url || "").trim().toLowerCase().replace(/\/+$/, "");
  if (url) return `url:${url}`;
  return `key:${lead.dedupe_key}`;
}

function isBetterExample(a: Lead, b: Lead): boolean {
  const ar = a.review_count || 0;
  const br = b.review_count || 0;
  if (ar !== br) return ar > br;
  return (a.rating || 0) > (b.rating || 0);
}

/** Same business type: keep best sites across cities. Different type: start fresh. */
function mergeQualityExamples(prev: Lead[], incoming: Lead[], bizType: string, prevBiz: string): Lead[] {
  const sameBiz = Boolean(normBiz(bizType)) && normBiz(bizType) === normBiz(prevBiz);
  const pool = sameBiz ? [...prev, ...incoming] : [...incoming];
  const best = new Map<string, Lead>();
  for (const row of pool) {
    if (!isExampleLead(row)) continue;
    const key = exampleDedupeKey(row);
    const existing = best.get(key);
    if (!existing || isBetterExample(row, existing)) best.set(key, row);
  }
  return [...best.values()]
    .sort(
      (a, b) =>
        (b.review_count || 0) - (a.review_count || 0) || (b.rating || 0) - (a.rating || 0),
    )
    .slice(0, 5)
    .map((l, i) => ({ ...l, rank: i + 1 }));
}

function readExamplesBiz(): string {
  try {
    return sessionStorage.getItem(SESSION_EXAMPLES_BIZ_KEY) || "";
  } catch {
    return "";
  }
}

function writeExamplesBiz(biz: string) {
  try {
    sessionStorage.setItem(SESSION_EXAMPLES_BIZ_KEY, normBiz(biz));
  } catch {
    /* ignore */
  }
}

function readSavedBiz(): string {
  try {
    return sessionStorage.getItem(SESSION_SAVED_BIZ_KEY) || "";
  } catch {
    return "";
  }
}

function writeSavedBiz(biz: string) {
  try {
    if (!biz) sessionStorage.removeItem(SESSION_SAVED_BIZ_KEY);
    else sessionStorage.setItem(SESSION_SAVED_BIZ_KEY, biz === MIXED_BIZ ? MIXED_BIZ : normBiz(biz));
  } catch {
    /* ignore */
  }
}

function bizLabel(biz: string): string {
  if (!biz || biz === MIXED_BIZ) return "mixed businesses";
  return biz;
}

function inferBizFromLeads(rows: Lead[]): string {
  const cats = new Set(
    rows.map((l) => normBiz(l.category)).filter(Boolean),
  );
  if (cats.size === 0) return "";
  if (cats.size === 1) return [...cats][0];
  return MIXED_BIZ;
}

function leadBiz(rows: Lead[], fallback = ""): string {
  return inferBizFromLeads(rows) || normBiz(fallback);
}

function readSessionLeads(key: string): Lead[] {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSessionLeads(key: string, leads: Lead[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify(leads));
  } catch {
    /* ignore quota */
  }
}

/** Build click-to-chat URL for a business number (opens THEIR chat, not yours alone). */
function whatsappChatUrl(phone: string, location?: string | null): string {
  let digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);

  // Local numbers (leading 0 / short) need a country code for wa.me to open the right chat.
  const loc = (location || "").toLowerCase();
  let cc = "";
  if (/pakistan|\bpak\b|\bpk\b|karachi|lahore|islamabad|rawalpindi|faisalabad|multan|peshawar|quetta/.test(loc)) {
    cc = "92";
  } else if (/united states|\busa\b|\bu\.s\./.test(loc)) {
    cc = "1";
  } else if (/united kingdom|\buk\b|england|london/.test(loc)) {
    cc = "44";
  } else if (/india|\bin\b|delhi|mumbai|bangalore/.test(loc)) {
    cc = "91";
  } else if (/uae|dubai|abu dhabi/.test(loc)) {
    cc = "971";
  }

  if (cc) {
    if (digits.startsWith("0")) digits = cc + digits.slice(1);
    else if (!digits.startsWith(cc) && digits.length <= 11) digits = cc + digits;
  }

  // api.whatsapp.com/send opens a direct chat composer with this phone.
  return `https://api.whatsapp.com/send/?phone=${digits}&type=phone_number&app_absent=0`;
}

function stageFromRun(run: SearchRun | null): StageKey {
  if (!run) return "open";
  if (run.status === "completed" || run.status === "failed") return "done";
  const pct = run.progress_pct ?? 0;
  const msg = (run.progress_message || "").toLowerCase();
  if (pct >= 28 || msg.includes("checking") || msg.includes("place")) return "check";
  if (pct >= 12 || msg.includes("loading") || msg.includes("scroll") || msg.includes("feed")) {
    return "feed";
  }
  return "open";
}

function IconTag() {
  return (
    <svg className="leads-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20.6 13.4 12.7 21.3a1 1 0 0 1-1.4 0l-8.6-8.6a2 2 0 0 1-.6-1.4V4a1 1 0 0 1 1-1h7.3a2 2 0 0 1 1.4.6l8.6 8.6a1 1 0 0 1 0 1.4Z" />
      <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconPin() {
  return (
    <svg className="leads-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function IconSpark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.5 13.8 9l6.7.4-5.2 4.2 1.7 6.4L12 16.7 7 20l1.7-6.4L3.5 9.4 10.2 9 12 2.5Z" />
    </svg>
  );
}

function Stepper({
  states,
}: {
  states: Record<StageKey, "idle" | "active" | "done">;
}) {
  const steps: { key: StageKey; label: string }[] = [
    { key: "open", label: "Open Maps" },
    { key: "feed", label: "Load feed" },
    { key: "check", label: "Check places" },
    { key: "done", label: "Done" },
  ];
  return (
    <div className="leads-stepper" role="list" aria-label="Scrape progress">
      {steps.map((step, i) => {
        const state = states[step.key];
        const prevDone = i === 0 ? true : states[steps[i - 1].key] === "done";
        return (
          <div key={step.key} className="leads-step-node" role="listitem">
            {i > 0 ? <div className={`leads-step-line ${prevDone || state !== "idle" ? "is-done" : ""}`} /> : null}
            <span className={`leads-step-dot ${state === "active" ? "is-active" : ""} ${state === "done" ? "is-done" : ""}`}>
              {state === "done" ? "✓" : state === "active" ? <span className="lrp-spinner !h-3.5 !w-3.5 !border-[1.5px]" /> : i + 1}
            </span>
            <span className={`leads-step-label ${state === "active" ? "is-active" : ""} ${state === "done" ? "is-done" : ""}`}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const MAX_RESULTS_OPTIONS = [5, 10, 15, 20, 25, 30] as const;

export default function LeadsPage() {
  const [businessType, setBusinessType] = useState("");
  const [location, setLocation] = useState("");
  const [maxResults, setMaxResults] = useState<(typeof MAX_RESULTS_OPTIONS)[number]>(15);
  const [searches, setSearches] = useState<SearchRun[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [active, setActive] = useState<SearchRun | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [savedLeads, setSavedLeads] = useState<Lead[]>([]);
  const [exampleLeads, setExampleLeads] = useState<Lead[]>([]);
  const [resultsTab, setResultsTab] = useState<ResultsTab>("current");
  const [pendingStart, setPendingStart] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [savePromptLeads, setSavePromptLeads] = useState<Lead[]>([]);
  const [showBizMergeModal, setShowBizMergeModal] = useState(false);
  const [savedBiz, setSavedBiz] = useState("");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => setPortalReady(true), []);

  const refreshList = useCallback(async () => {
    setSearches(await listSearches());
  }, []);

  const rankByReviews = useCallback((rows: Lead[]) => {
    const sorted = [...rows].sort(
      (a, b) => (b.review_count || 0) - (a.review_count || 0) || (b.rating || 0) - (a.rating || 0),
    );
    return sorted.map((l, i) => ({ ...l, rank: i + 1 }));
  }, []);

  const applyDisplayBatch = useCallback(
    (batch: Lead[], examples: Lead[], biz: string) => {
      const rankedLeads = rankByReviews(batch);
      setLeads(rankedLeads);
      writeSessionLeads(SESSION_CURRENT_KEY, rankedLeads);
      rememberSeenLeads(biz, rankedLeads);

      const prevBiz = readExamplesBiz();
      const prevExamples = readSessionLeads(SESSION_EXAMPLES_KEY).filter(isExampleLead);
      if (examples.length === 0) {
        if (normBiz(biz) && normBiz(biz) !== normBiz(prevBiz)) {
          setExampleLeads([]);
          writeSessionLeads(SESSION_EXAMPLES_KEY, []);
          writeExamplesBiz(biz);
        }
        return;
      }
      const merged = mergeQualityExamples(prevExamples, examples, biz, prevBiz);
      setExampleLeads(merged);
      writeSessionLeads(SESSION_EXAMPLES_KEY, merged);
      writeExamplesBiz(biz);
    },
    [rankByReviews],
  );

  const setCurrentLeads = useCallback(
    (rows: Lead[]) => {
      const { leads: onlyLeads, examples } = splitClaimedLeads(rows);

      // Clearing Current for a new scrape must NOT wipe the quality Top 5 / pool bank.
      if (rows.length === 0) {
        setLeads([]);
        writeSessionLeads(SESSION_CURRENT_KEY, []);
        return;
      }

      const biz =
        examples[0]?.category || onlyLeads[0]?.category || businessType || "";
      const loc = onlyLeads[0]?.location || examples[0]?.location || location || "";
      const key = poolKey(biz, loc);
      // Store full inventory for this tab session; show only selected page size.
      mergeIntoPool(key, onlyLeads, examples);
      saveLastQuery(biz, loc, maxResults);
      const exclude = buildExcludePayload(biz, savedLeads);
      const batch = pickFromPool(key, maxResults, exclude);
      applyDisplayBatch(batch, examples, biz);
    },
    [applyDisplayBatch, businessType, location, maxResults, savedLeads],
  );

  const setSaved = useCallback(
    (rows: Lead[], biz?: string) => {
      const ranked = rankByReviews(rows.filter((l) => !isExampleLead(l)));
      setSavedLeads(ranked);
      writeSessionLeads(SESSION_SAVED_KEY, ranked);
      if (ranked.length === 0) {
        setSavedBiz("");
        writeSavedBiz("");
        return;
      }
      if (biz !== undefined) {
        setSavedBiz(biz);
        writeSavedBiz(biz);
      }
    },
    [rankByReviews],
  );

  useEffect(() => {
    const saved = readSessionLeads(SESSION_SAVED_KEY).filter((l) => !isExampleLead(l));
    const storedBiz = readSavedBiz() || inferBizFromLeads(saved);
    setLeads(readSessionLeads(SESSION_CURRENT_KEY).filter((l) => !isExampleLead(l)));
    setSavedLeads(saved);
    setSavedBiz(storedBiz);
    if (saved.length && !readSavedBiz()) writeSavedBiz(storedBiz);
    setExampleLeads(rankByReviews(readSessionLeads(SESSION_EXAMPLES_KEY).filter(isExampleLead)).slice(0, 5));
    // Form stays empty on refresh; pool/session still skips deep scrape for same biz+city.
    setBusinessType("");
    setLocation("");
    refreshList().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [refreshList, rankByReviews]);

  useEffect(() => {
    const busy =
      starting || active?.status === "queued" || active?.status === "running";
    if (!busy || typeof document === "undefined") return;
    const el = document.activeElement;
    if (el instanceof HTMLElement && el.closest(".leads-toolbar")) el.blur();
  }, [starting, active?.status]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    let wasRunning = false;
    const startedAt = Date.now();
    let lastPct = -1;
    let lastPctAt = Date.now();
    let timer: number | null = null;

    // Stop endless GET spam if worker never leaves "queued" (e.g. uvicorn --reload killed the thread)
    const QUEUED_STUCK_MS = 45_000;
    const RUNNING_STALL_MS = 180_000;
    // Full ~150-place dig can run long; give headroom before UI gives up.
    const HARD_CAP_MS = 25 * 60_000;

    async function poll() {
      try {
        const run = await getSearch(activeId!);
        if (cancelled) return;

        const now = Date.now();
        if (run.progress_pct !== lastPct) {
          lastPct = run.progress_pct;
          lastPctAt = now;
        }

        if (run.status === "queued" || run.status === "running") wasRunning = true;
        setActive(run);

        if (run.status === "completed") {
          if (!cancelled) setClaiming(true);
          try {
            // Claim once into browser session cache, then wipe server payload.
            const claimed = await claimSearchLeads(activeId!);
            if (!cancelled) {
              setCurrentLeads(claimed);
              setResultsTab("current");
            }
          } catch {
            // Already claimed / empty — keep whatever is in session cache.
          } finally {
            if (!cancelled) setClaiming(false);
          }
          if (wasRunning) {
            setJustCompleted(true);
            window.setTimeout(() => setJustCompleted(false), 2200);
          }
          await refreshList();
          return;
        }

        if (run.status === "failed") {
          setError(run.error_summary || "Search failed");
          await refreshList();
          return;
        }

        const elapsed = now - startedAt;
        if (run.status === "queued" && elapsed >= QUEUED_STUCK_MS) {
          setError(
            "Search stuck in Queued — background worker never started (often after backend reload). Click Start scrape again.",
          );
          await refreshList();
          return;
        }
        if (run.status === "running" && now - lastPctAt >= RUNNING_STALL_MS) {
          setError(
            "Search stalled with no progress for 3 minutes. Stop and start a new scrape.",
          );
          await refreshList();
          return;
        }
        if (elapsed >= HARD_CAP_MS) {
          setError("Search timed out after 25 minutes. Please try again.");
          await refreshList();
          return;
        }

        timer = window.setTimeout(poll, 1200);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Poll failed");
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [activeId, refreshList, setCurrentLeads]);

  async function startScrapeNow() {
    setError("");
    setJustCompleted(false);
    setClaiming(false);
    // Remember current before clear so the next page from the pool skips duplicates.
    rememberSeenLeads(businessType || leadBiz(leads, businessType), leads);
    const exclude = buildExcludePayload(businessType, leads, savedLeads);
    const key = resolvePoolKey(businessType, location);
    setCurrentLeads([]); // clear old rows until new batch is ready
    setStarting(true);
    setResultsTab("current");
    saveLastQuery(businessType, location, maxResults);

    try {
      // Same business + city already fully scraped this tab → next page from pool (survives refresh).
      if (key) {
        const batch = pickFromPool(key, maxResults, exclude);
        const poolExamples = readPoolMap()[key]?.examples || [];
        setActive({
          id: -1,
          input_name: businessType,
          input_location: location,
          max_results: maxResults,
          status: "running",
          progress_pct: 8,
          progress_message: "Working…",
          error_summary: null,
          result_count: 0,
          started_at: new Date().toISOString(),
          completed_at: null,
          created_at: new Date().toISOString(),
        });
        setActiveId(null);
        const steps = 8;
        for (let i = 1; i <= steps; i++) {
          await new Promise((r) => window.setTimeout(r, CACHE_HIT_MS / steps));
          setActive((prev) =>
            prev
              ? {
                  ...prev,
                  progress_pct: Math.min(96, Math.round((i / steps) * 96)),
                  progress_message: "Working…",
                }
              : prev,
          );
        }
        applyDisplayBatch(batch, poolExamples, businessType);
        setActive({
          id: -1,
          input_name: businessType,
          input_location: location,
          max_results: maxResults,
          status: "completed",
          progress_pct: 100,
          progress_message: "Done",
          error_summary: null,
          result_count: batch.length,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });
        setJustCompleted(true);
        window.setTimeout(() => setJustCompleted(false), 2200);
        return;
      }

      // First time for this business + place in this tab: full Maps dig.
      const run = await createSearch(businessType, location, maxResults, { urls: [], phones: [] });
      setActive(run);
      setActiveId(run.id);
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start search");
    } finally {
      setStarting(false);
      setPendingStart(false);
      setShowSaveModal(false);
    }
  }

  async function onStart(e: FormEvent) {
    e.preventDefault();
    if (leads.length > 0) {
      // Snapshot so the modal never shows "Save 0" if Current is cleared mid-prompt.
      setSavePromptLeads(leads);
      setPendingStart(true);
      setShowSaveModal(true);
      return;
    }
    await startScrapeNow();
  }

  function mergeLeads(base: Lead[], incoming: Lead[]): Lead[] {
    const merged = [...base];
    const seen = new Set(merged.map((l) => l.dedupe_key));
    for (const l of incoming) {
      if (!seen.has(l.dedupe_key)) {
        merged.push(l);
        seen.add(l.dedupe_key);
      }
    }
    return merged;
  }

  function needsBizMergePrompt(rows: Lead[] = leads): boolean {
    if (!rows.length || !savedLeads.length) return false;
    const current = leadBiz(rows, businessType);
    const saved = savedBiz || inferBizFromLeads(savedLeads);
    if (!current || !saved || saved === MIXED_BIZ) return false;
    return current !== saved;
  }

  function moveCurrentToSaved(
    baseSaved: Lead[] = savedLeads,
    bizMode: "current" | "mixed" = "current",
    rows: Lead[] = leads,
  ): Lead[] {
    const incoming = rows.length ? rows : leads;
    const merged = mergeLeads(baseSaved, incoming);
    const nextBiz =
      bizMode === "mixed"
        ? MIXED_BIZ
        : baseSaved.length === 0
          ? leadBiz(incoming, businessType)
          : leadBiz(baseSaved, savedBiz) === leadBiz(incoming, businessType)
            ? leadBiz(incoming, businessType)
            : MIXED_BIZ;
    setSaved(merged, nextBiz);
    rememberSeenLeads(businessType || leadBiz(incoming, businessType), incoming);
    setCurrentLeads([]); // Current empty → new search won't ask again
    return merged;
  }

  function onModalSave() {
    const snapshot = savePromptLeads.length ? savePromptLeads : leads;
    // Close first so the title never re-renders as "Save 0 leads?".
    setShowSaveModal(false);
    if (needsBizMergePrompt(snapshot)) {
      setSavePromptLeads(snapshot);
      setShowBizMergeModal(true);
      // pendingStart stays true → after merge choice, continue scrape
      return;
    }
    moveCurrentToSaved(savedLeads, "current", snapshot);
    setSavePromptLeads([]);
    void startScrapeNow();
  }

  function onModalCancel() {
    setPendingStart(false);
    setShowSaveModal(false);
    setSavePromptLeads([]);
  }

  function finishAfterBizChoice() {
    setShowBizMergeModal(false);
    if (pendingStart) {
      void startScrapeNow();
      return;
    }
    setResultsTab("saved");
  }

  function onBizMerge() {
    const snapshot = savePromptLeads.length ? savePromptLeads : leads;
    moveCurrentToSaved(savedLeads, "mixed", snapshot);
    setSavePromptLeads([]);
    finishAfterBizChoice();
  }

  function onBizExportClearThenSave() {
    const snapshot = savePromptLeads.length ? savePromptLeads : leads;
    if (savedLeads.length) {
      downloadLeadsCsvClient(savedLeads, `leads_saved_export_${Date.now()}.csv`);
    }
    moveCurrentToSaved([], "current", snapshot);
    setSavePromptLeads([]);
    finishAfterBizChoice();
  }

  function onBizClearThenSave() {
    const snapshot = savePromptLeads.length ? savePromptLeads : leads;
    moveCurrentToSaved([], "current", snapshot);
    setSavePromptLeads([]);
    finishAfterBizChoice();
  }

  function onBizMergeCancel() {
    setShowBizMergeModal(false);
    setPendingStart(false);
    setSavePromptLeads([]);
  }

  function onSaveCurrent() {
    if (!leads.length) return;
    if (needsBizMergePrompt()) {
      setShowBizMergeModal(true);
      return;
    }
    moveCurrentToSaved();
    setResultsTab("saved");
  }

  function onClearSaved() {
    if (!savedLeads.length) return;
    setSaved([], "");
    // Keep session pool until the browser tab is closed (refresh-safe).
    if (resultsTab === "saved") setResultsTab("current");
  }

  function onClearCurrent() {
    if (!leads.length) return;
    setCurrentLeads([]);
    // Do not wipe pool/seen here — refresh must still reuse the full dig for this tab.
  }

  function onClearExamples() {
    if (!exampleLeads.length) return;
    setExampleLeads([]);
    writeSessionLeads(SESSION_EXAMPLES_KEY, []);
    writeExamplesBiz("");
  }

  function onExportActive() {
    if (!displayedLeads.length) return;
    downloadLeadsCsvClient(displayedLeads, `leads_${resultsTab}_${Date.now()}.csv`);
  }

  const displayedLeads =
    resultsTab === "saved" ? savedLeads : resultsTab === "examples" ? exampleLeads : leads;

  const running = active?.status === "queued" || active?.status === "running";
  const stage = stageFromRun(active);
  const pct = Math.min(100, Math.max(0, active?.progress_pct ?? 0));

  const stageState = useMemo(() => {
    const order: StageKey[] = ["open", "feed", "check", "done"];
    const idx = order.indexOf(stage);
    const map = (key: StageKey): "idle" | "active" | "done" => {
      const k = order.indexOf(key);
      if (active?.status === "completed") return "done";
      if (active?.status === "failed") return key === "done" ? "done" : k < idx ? "done" : "idle";
      if (k < idx) return "done";
      if (k === idx) return "active";
      return "idle";
    };
    return {
      open: map("open"),
      feed: map("feed"),
      check: map("check"),
      done: map("done"),
    };
  }, [stage, active?.status]);

  const promptLeads = savePromptLeads.length ? savePromptLeads : leads;
  const currentBizName = bizLabel(leadBiz(promptLeads, businessType) || businessType);
  const savedBizName = bizLabel(savedBiz || inferBizFromLeads(savedLeads));

  const saveModal =
    showSaveModal && portalReady
      ? createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 p-4"
            role="dialog"
            aria-modal
            style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}
          >
            <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
              <h3 className="text-lg font-bold text-[#111827]">Save {promptLeads.length} leads?</h3>
              <p className="mt-2 text-sm text-[#6B7280]">
                Save these leads, then start the new search. Export anytime from the list.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" className="lrp-btn lrp-btn-primary" onClick={onModalSave}>
                  Save
                </button>
                <button type="button" className="lrp-btn lrp-btn-secondary" onClick={onModalCancel}>
                  Not now
                </button>
              </div>
        </div>
          </div>,
          document.body,
        )
      : null;

  const bizMergeModal =
    showBizMergeModal && portalReady
      ? createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/35 p-4"
            role="dialog"
            aria-modal
            style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}
          >
            <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
              <h3 className="text-lg font-bold text-[#111827]">Different business type</h3>
              <p className="mt-2 text-sm leading-6 text-[#6B7280]">
                Saved leads are for <span className="font-semibold text-[#111827]">{savedBizName}</span>.
                Current leads are for <span className="font-semibold text-[#111827]">{currentBizName}</span>.
                Merge both, or export the old saved list and clear it first?
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <button type="button" className="lrp-btn lrp-btn-primary w-full" onClick={onBizMerge}>
                  Merge both
                </button>
                <button type="button" className="lrp-btn lrp-btn-secondary w-full" onClick={onBizExportClearThenSave}>
                  Export old saved &amp; clear, then save new
                </button>
                <button type="button" className="lrp-btn lrp-btn-secondary w-full" onClick={onBizClearThenSave}>
                  Clear saved, then save new
                </button>
                <button type="button" className="lrp-btn lrp-btn-secondary w-full" onClick={onBizMergeCancel}>
                  Cancel
                </button>
        </div>
      </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="space-y-6">
      {saveModal}
      {bizMergeModal}

      <section className="lrp-card space-y-5 !pt-4">
        <h1 className="smx-report-title !mt-0 !mb-5">Lead Search</h1>
        <form onSubmit={onStart} className={`leads-toolbar${starting || running ? " is-busy" : ""}`}>
          <label className="leads-field">
            <IconTag />
        <input
          required
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value)}
              placeholder="e.g. Gym"
              aria-label="Business category"
              disabled={starting || running}
              readOnly={starting || running}
            />
          </label>
          <label className="leads-field">
            <IconPin />
        <input
          required
          value={location}
          onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Islamabad, Punjab, Pakistan"
              aria-label="Location"
              disabled={starting || running}
              readOnly={starting || running}
            />
          </label>
          <label className="leads-field leads-field--select">
            <select
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value) as (typeof MAX_RESULTS_OPTIONS)[number])}
              aria-label="Max leads"
              disabled={starting || running}
            >
              {MAX_RESULTS_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} leads
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={starting || running} className="leads-start-btn">
            {starting || running ? (
              <>
                <span className="lrp-spinner !border-white/40 !border-t-white" />
                {starting ? "Starting…" : "Running…"}
              </>
            ) : (
              <>
                <IconSpark />
                Start scrape
              </>
            )}
        </button>
      </form>
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-[#D63A2F]">{error}</p>
        ) : null}
      </section>

      {/* Live run */}
      {active ? (
        <section
          className={`lrp-card space-y-5 ${justCompleted ? "ring-2 ring-[rgba(193,144,255,0.35)]" : ""}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {running ? <span className="lrp-pulse-dot" aria-hidden /> : null}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">Live run</p>
                <h2 className="text-base font-bold text-[#111827]">
                  {active.input_name} in {active.input_location}
                </h2>
              </div>
            </div>
            <span
              className={`lrp-badge ${
                active.status === "completed"
                  ? "lrp-badge-success"
                  : active.status === "failed"
                    ? "lrp-badge-danger"
                    : "lrp-badge-orange"
              }`}
            >
              {active.status}
            </span>
          </div>

          <Stepper states={stageState} />

          <div className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <p className="text-sm text-[#6B7280]">
                {active.progress_message || (running ? "Working…" : "Ready")}
              </p>
              <p
                className={`text-2xl font-bold tabular-nums text-[#C190FF] ${justCompleted ? "lrp-count-pop" : ""}`}
              >
                {pct}%
              </p>
            </div>
            <div
              className="lrp-progress-track"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`lrp-progress-fill ${active.status === "completed" ? "is-done" : ""}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

        </section>
      ) : null}

      {/* Results toolbar */}
      <section className="lrp-card overflow-hidden !p-0">
        <div className="border-b border-[#E5E7EB] px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B7280]">Results</p>
              <h2 className="mt-0.5 text-lg font-bold text-[#111827]">
                {resultsTab === "examples"
                  ? `${displayedLeads.length} example sites`
                  : `${displayedLeads.length} leads`}
              </h2>
              {running ? (
                <div className="mt-2 flex items-center gap-2 text-sm font-medium text-[#A86EF0]">
                  <span className="lrp-spinner" /> Scanning…
                </div>
              ) : null}
            </div>

            <div className="flex flex-col items-end gap-2">
              <div
                className="inline-flex flex-wrap justify-end rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-1"
                role="tablist"
                aria-label="Result lists"
              >
                {(
                  [
                    { id: "current" as const, label: "Current", count: leads.length },
                    { id: "examples" as const, label: "Top 5 sites", count: exampleLeads.length },
                    { id: "saved" as const, label: "Saved", count: savedLeads.length },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={resultsTab === tab.id}
                    onClick={() => setResultsTab(tab.id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      resultsTab === tab.id
                        ? "bg-[#111827] text-white shadow-sm"
                        : "text-[#6B7280] hover:text-[#111827]"
                    }`}
                  >
                    {tab.label}
                    <span className="ml-1.5 tabular-nums opacity-80">({tab.count})</span>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2" role="toolbar" aria-label="List actions">
                {resultsTab === "current" ? (
                  <>
                    <button
                      type="button"
                      onClick={onSaveCurrent}
                      disabled={!leads.length}
                      className="rounded-lg bg-[#C190FF] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={onExportActive}
                      disabled={!leads.length}
                      className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280] disabled:opacity-40"
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      onClick={onClearCurrent}
                      disabled={!leads.length}
                      className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280] disabled:opacity-40"
                    >
                      Clear
                    </button>
                  </>
                ) : null}
                {resultsTab === "examples" ? (
                  <>
                    <button
                      type="button"
                      onClick={onExportActive}
                      disabled={!exampleLeads.length}
                      className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280] disabled:opacity-40"
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      onClick={onClearExamples}
                      disabled={!exampleLeads.length}
                      className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280] disabled:opacity-40"
                    >
                      Clear
                    </button>
                  </>
                ) : null}
                {resultsTab === "saved" ? (
                  <>
                    <button
                      type="button"
                      onClick={onExportActive}
                      disabled={!savedLeads.length}
                      className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280] disabled:opacity-40"
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      onClick={onClearSaved}
                      disabled={!savedLeads.length}
                      className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280] disabled:opacity-40"
                    >
                      Clear
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {(running || claiming) && displayedLeads.length === 0 ? (
          <div className="space-y-3 px-6 py-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="grid grid-cols-[80px_1fr_120px_100px] gap-3">
                <div className="lrp-skeleton" />
                <div className="lrp-skeleton" />
                <div className="lrp-skeleton" />
                <div className="lrp-skeleton" />
              </div>
            ))}
          </div>
        ) : displayedLeads.length === 0 ? (
          <div className="leads-empty">
            <div className="leads-empty-icon" aria-hidden>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
                <path d="M8 11h6M11 8v6" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-[#111827]">
              {resultsTab === "saved"
                ? "No saved leads yet"
                : resultsTab === "examples"
                  ? "No example sites yet"
                  : "No leads found yet"}
            </h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-[#6B7280]">
              {resultsTab === "saved"
                ? "Saved leads will show here after you tap Save lead."
                : resultsTab === "examples"
                  ? "Best websites from your scrapes show here. Same business type keeps the strongest ones."
                  : "Start a scrape above to see leads here."}
            </p>
          </div>
        ) : (
          <div className="leads-scroll-panel overflow-x-auto">
            <table className="lrp-table min-w-[760px]">
            <thead>
                <tr>
                  <th>Rank</th>
                  <th>Reviews</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Website</th>
                  <th>Maps</th>
              </tr>
            </thead>
            <tbody>
                {displayedLeads.map((lead, i) => (
                  <tr
                    key={`${lead.dedupe_key}-${i}`}
                    className="lrp-row-in"
                    style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                  >
                    <td>
                      <span className="font-bold text-[#C190FF]">{lead.rank ?? i + 1}</span>
                    </td>
                    <td>
                      <span className="font-semibold text-[#111827]">
                        {lead.review_count != null ? lead.review_count.toLocaleString() : "—"}
                      </span>
                      {lead.rating != null ? (
                        <div className="mt-0.5 text-xs text-[#6B7280]">★ {lead.rating.toFixed(1)}</div>
                    ) : null}
                  </td>
                    <td className="font-semibold text-[#111827]">{lead.business_name || "—"}</td>
                    <td className="font-mono text-xs text-[#374151]">
                      {lead.phone ? (
                        <a
                          href={whatsappChatUrl(lead.phone, lead.location)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 font-semibold text-[#128C7E] hover:underline"
                          title="Chat with this business on WhatsApp"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                            <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 1.82c4.46 0 8.09 3.63 8.09 8.09 0 4.46-3.63 8.09-8.09 8.09-1.42 0-2.8-.37-4.01-1.07l-.29-.17-3.12.82.83-3.04-.19-.31a8.04 8.04 0 0 1-1.23-4.32c0-4.46 3.63-8.09 8.01-8.09zm4.52 10.62c-.21-.11-1.26-.62-1.46-.69-.2-.07-.34-.1-.49.11-.14.21-.56.69-.69.83-.13.14-.26.16-.47.05-.21-.1-.89-.33-1.7-1.05-.63-.56-1.05-1.25-1.17-1.46-.12-.21-.01-.33.09-.43.1-.1.21-.26.32-.39.1-.13.14-.21.21-.35.07-.14.03-.26-.02-.37-.05-.1-.49-1.18-.67-1.62-.18-.42-.36-.36-.49-.37h-.42c-.14 0-.37.05-.56.26-.19.21-.74.72-.74 1.76s.76 2.04.86 2.18c.11.14 1.49 2.28 3.61 3.2.5.22.9.35 1.21.45.51.16.97.14 1.34.08.41-.06 1.26-.51 1.44-1.01.18-.5.18-.92.12-1.01-.05-.09-.19-.14-.4-.25z" />
                          </svg>
                          {lead.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-xs text-[#374151]">{lead.email || "—"}</td>
                    <td>
                      {lead.website_url ? (
                        <a
                          href={lead.website_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-[#C190FF] hover:underline"
                          title={lead.website_url}
                        >
                          Open site
                        </a>
                      ) : (
                        <span className="lrp-badge lrp-badge-muted">{lead.website_status}</span>
                      )}
                    </td>
                    <td>
                      <a
                        href={lead.source_listing_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-[#C190FF] hover:underline"
                      >
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>

      <section className="lrp-card space-y-3">
        <h2 className="text-lg font-bold text-[#111827]">Recent scrapes</h2>
        <ul className="leads-recent-scroll text-sm">
          {searches.length === 0 ? (
            <li className="leads-recent-item text-[#6B7280]">None yet.</li>
          ) : null}
          {searches.map((s, i) => (
            <li key={s.id} className="leads-recent-item">
              <span className="font-semibold text-[#111827]">
                {i + 1}. {s.input_name} in {s.input_location}
              </span>
              <span className="lrp-badge lrp-badge-muted">
                {s.status} · {s.result_count} leads
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
