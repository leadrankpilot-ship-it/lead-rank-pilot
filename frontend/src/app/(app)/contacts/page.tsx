"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ManualWebsiteScraper from "@/components/ManualWebsiteScraper";
import {
  CONTACTS_MODE_EVENT,
  CONTACTS_MODE_KEY,
  ContactsModeToggle,
} from "@/components/AppShell";
import {
  Lead,
  SearchRun,
  claimSearchLeads,
  createManualContactSearch,
  createSearch,
  downloadLeadsCsvClient,
  fetchManualContactLimits,
  getSearch,
  listSearches,
} from "@/lib/api";

const SESSION_CURRENT = "lrp_contacts_current";
const SESSION_SAVED = "lrp_contacts_saved";
const SESSION_SAVED_BIZ = "lrp_contacts_saved_biz";
const SESSION_POOL = "lrp_contacts_pool";
const SESSION_SEEN = "lrp_contacts_seen";
const SESSION_LAST_POOL = "lrp_contacts_last_pool_key";
const MIXED_BIZ = "__mixed__";
const MAX_RESULTS_OPTIONS = [5, 10, 15, 20, 25, 30] as const;
const CACHE_HIT_MS = 12_000;

type ResultsTab = "current" | "saved";
type StageKey = "open" | "feed" | "check" | "done";
type PoolEntry = { leads: Lead[] };
type SeenBucket = { urls: string[]; phones: string[]; keys: string[] };

function readSession(key: string): Lead[] {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSession(key: string, leads: Lead[]) {
  try {
    sessionStorage.setItem(key, JSON.stringify(leads));
  } catch {
    /* ignore */
  }
}

function normBiz(v: string) {
  return (v || "").trim().toLowerCase().replace(/\s+/g, " ");
}
function normLoc(v: string) {
  return (v || "").trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
}
function poolKey(biz: string, loc: string) {
  return `${normBiz(biz)}|${normLoc(loc)}`;
}
function normMapsUrl(url: string) {
  return (url || "").trim().split("?")[0].replace(/\/$/, "").toLowerCase();
}
function normPhone(phone: string) {
  return (phone || "").replace(/\D/g, "");
}

function readPoolMap(): Record<string, PoolEntry> {
  try {
    const raw = sessionStorage.getItem(SESSION_POOL);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function writePoolMap(map: Record<string, PoolEntry>) {
  try {
    sessionStorage.setItem(SESSION_POOL, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
function saveLastPoolKey(key: string) {
  try {
    if (key && key !== "|") sessionStorage.setItem(SESSION_LAST_POOL, key);
  } catch {
    /* ignore */
  }
}
function readLastPoolKey() {
  try {
    return sessionStorage.getItem(SESSION_LAST_POOL) || "";
  } catch {
    return "";
  }
}

/** Pool hit only for same business + same location. New city → fresh dig. */
function resolvePoolKey(biz: string, loc: string): string | null {
  const exact = poolKey(biz, loc);
  if (!exact || exact === "|" || !normBiz(biz) || !normLoc(loc)) return null;
  const map = readPoolMap();
  if (map[exact]?.leads?.length) return exact;
  return null;
}

function mergeIntoPool(key: string, leads: Lead[]) {
  if (!key || key === "|") return;
  const map = readPoolMap();
  const prev = map[key]?.leads || [];
  const byKey = new Map<string, Lead>();
  for (const row of [...prev, ...leads]) {
    if (!row?.dedupe_key) continue;
    byKey.set(row.dedupe_key, row);
  }
  map[key] = { leads: [...byKey.values()] };
  writePoolMap(map);
  saveLastPoolKey(key);
}

function readSeenMap(): Record<string, SeenBucket> {
  try {
    const raw = sessionStorage.getItem(SESSION_SEEN);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function writeSeenMap(map: Record<string, SeenBucket>) {
  try {
    sessionStorage.setItem(SESSION_SEEN, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
function rememberSeen(biz: string, rows: Lead[]) {
  const key = normBiz(biz);
  if (!key || !rows.length) return;
  const map = readSeenMap();
  const bucket = map[key] || { urls: [], phones: [], keys: [] };
  const urls = new Set(bucket.urls);
  const phones = new Set(bucket.phones);
  const keys = new Set(bucket.keys);
  for (const row of rows) {
    const url = normMapsUrl(row.source_listing_url);
    const phone = normPhone(row.phone || "");
    if (url) urls.add(url);
    if (phone.length >= 8) phones.add(phone);
    if (row.dedupe_key) keys.add(row.dedupe_key);
  }
  map[key] = { urls: [...urls], phones: [...phones], keys: [...keys] };
  writeSeenMap(map);
}

function buildExcludePayload(biz: string, current: Lead[], saved: Lead[]) {
  const seen = readSeenMap()[normBiz(biz)] || { urls: [], phones: [], keys: [] };
  const urls = new Set(seen.urls);
  const phones = new Set(seen.phones);
  for (const row of [...current, ...saved]) {
    const url = normMapsUrl(row.source_listing_url);
    const phone = normPhone(row.phone || "");
    if (url) urls.add(url);
    if (phone.length >= 8) phones.add(phone);
  }
  return { urls: [...urls], phones: [...phones] };
}

function pickFromPool(key: string, limit: number, exclude: { urls: string[]; phones: string[] }): Lead[] {
  const entry = readPoolMap()[key];
  if (!entry?.leads?.length) return [];
  const urlSet = new Set(exclude.urls.map(normMapsUrl));
  const phoneSet = new Set(exclude.phones.map(normPhone).filter((p) => p.length >= 8));
  const out: Lead[] = [];
  for (const row of entry.leads) {
    const url = normMapsUrl(row.source_listing_url);
    const phone = normPhone(row.phone || "");
    if (url && urlSet.has(url)) continue;
    if (phone.length >= 8 && phoneSet.has(phone)) continue;
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

function readSavedBiz(): string {
  try {
    return sessionStorage.getItem(SESSION_SAVED_BIZ) || "";
  } catch {
    return "";
  }
}
function writeSavedBiz(biz: string) {
  try {
    if (!biz) sessionStorage.removeItem(SESSION_SAVED_BIZ);
    else sessionStorage.setItem(SESSION_SAVED_BIZ, biz === MIXED_BIZ ? MIXED_BIZ : normBiz(biz));
  } catch {
    /* ignore */
  }
}
function bizLabel(biz: string) {
  if (!biz || biz === MIXED_BIZ) return "mixed businesses";
  return biz;
}
function inferBizFromLeads(rows: Lead[]) {
  const cats = new Set(rows.map((l) => normBiz(l.category || "")).filter(Boolean));
  if (cats.size === 0) return "";
  if (cats.size === 1) return [...cats][0];
  return MIXED_BIZ;
}
function contactBiz(rows: Lead[], fallback = "") {
  return inferBizFromLeads(rows) || normBiz(fallback);
}

function whatsappChatUrl(phone: string, location?: string | null): string {
  let digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  const loc = (location || "").toLowerCase();
  let cc = "";
  if (/pakistan|\bpak\b|\bpk\b|karachi|lahore|islamabad|rawalpindi|faisalabad|multan|peshawar|quetta|khanewal/.test(loc)) {
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
  return `https://api.whatsapp.com/send/?phone=${digits}&type=phone_number&app_absent=0`;
}

function stageFromRun(run: SearchRun | null): StageKey {
  if (!run) return "open";
  if (run.status === "completed" || run.status === "failed") return "done";
  const pct = run.progress_pct ?? 0;
  const msg = (run.progress_message || "").toLowerCase();
  if (pct >= 78 || msg.includes("contact") || msg.includes("reading")) return "check";
  if (pct >= 28 || msg.includes("checking") || msg.includes("site")) return "check";
  if (pct >= 12 || msg.includes("loading")) return "feed";
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
  manual = false,
}: {
  states: Record<StageKey, "idle" | "active" | "done">;
  manual?: boolean;
}) {
  const steps: { key: StageKey; label: string }[] = manual
    ? [
        { key: "open", label: "Queue URLs" },
        { key: "feed", label: "Visit sites" },
        { key: "check", label: "Extract contacts" },
        { key: "done", label: "Done" },
      ]
    : [
        { key: "open", label: "Open Maps" },
        { key: "feed", label: "Load list" },
        { key: "check", label: "Find contacts" },
        { key: "done", label: "Done" },
      ];
  return (
    <div className="leads-stepper" role="list" aria-label="Scrape progress">
      {steps.map((step, i) => {
        const state = states[step.key];
        const prevDone = i > 0 && states[steps[i - 1].key] === "done";
        return (
          <div key={step.key} className="leads-step-node" role="listitem">
            {i > 0 ? <div className={`leads-step-line ${prevDone || state !== "idle" ? "is-done" : ""}`} /> : null}
            <span className={`leads-step-dot ${state === "active" ? "is-active" : ""} ${state === "done" ? "is-done" : ""}`}>
              {state === "done" ? "✓" : i + 1}
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

export default function ContactsPage() {
  const [mapsMode, setMapsMode] = useState(true);
  const [manualMaxUrls, setManualMaxUrls] = useState(50);
  const [manualReadyCount, setManualReadyCount] = useState(0);
  const [pendingManualUrls, setPendingManualUrls] = useState<string[] | null>(null);
  const [businessType, setBusinessType] = useState("");
  const [location, setLocation] = useState("");
  const [maxResults, setMaxResults] = useState<(typeof MAX_RESULTS_OPTIONS)[number]>(15);
  const [searches, setSearches] = useState<SearchRun[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [active, setActive] = useState<SearchRun | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [savedLeads, setSavedLeads] = useState<Lead[]>([]);
  const [resultsTab, setResultsTab] = useState<ResultsTab>("current");
  const [pendingStart, setPendingStart] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showBizMergeModal, setShowBizMergeModal] = useState(false);
  const [savePromptLeads, setSavePromptLeads] = useState<Lead[]>([]);
  const [savedBiz, setSavedBiz] = useState("");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => setPortalReady(true), []);

  useEffect(() => {
    try {
      setMapsMode(sessionStorage.getItem(CONTACTS_MODE_KEY) !== "0");
    } catch {
      setMapsMode(true);
    }
    function onMode(e: Event) {
      const detail = (e as CustomEvent<{ mapsOn?: boolean }>).detail;
      if (typeof detail?.mapsOn === "boolean") setMapsMode(detail.mapsOn);
    }
    window.addEventListener(CONTACTS_MODE_EVENT, onMode);
    return () => window.removeEventListener(CONTACTS_MODE_EVENT, onMode);
  }, []);

  useEffect(() => {
    fetchManualContactLimits()
      .then((lim) => {
        if (lim?.max_urls > 0) setManualMaxUrls(lim.max_urls);
      })
      .catch(() => {
        /* keep default 50 */
      });
  }, []);

  const refreshList = useCallback(async () => {
    const all = await listSearches();
    setSearches(
      all
        .filter((s) => {
          const m = s.mode || "leads";
          return m === "contacts" || m === "manual_contacts";
        })
        .slice(0, 12),
    );
  }, []);

  const setSaved = useCallback((rows: Lead[], biz?: string) => {
    setSavedLeads(rows);
    writeSession(SESSION_SAVED, rows);
    if (rows.length === 0) {
      setSavedBiz("");
      writeSavedBiz("");
      return;
    }
    if (biz !== undefined) {
      setSavedBiz(biz);
      writeSavedBiz(biz);
    }
  }, []);

  const setCurrent = useCallback(
    (rows: Lead[]) => {
      if (rows.length === 0) {
        setLeads([]);
        writeSession(SESSION_CURRENT, []);
        return;
      }
      const biz = rows[0]?.category || businessType || "";
      const loc = rows[0]?.location || location || "";
      const key = poolKey(biz, loc);
      mergeIntoPool(key, rows);
      // Fresh claim: show first page; exclude only saved so new inventory can appear.
      const savedOnly = buildExcludePayload("", [], savedLeads);
      const batch = pickFromPool(key, maxResults, savedOnly);
      const display = (batch.length ? batch : rows).slice(0, maxResults);
      setLeads(display);
      writeSession(SESSION_CURRENT, display);
      rememberSeen(biz, display);
    },
    [businessType, location, maxResults, savedLeads],
  );

  useEffect(() => {
    const saved = readSession(SESSION_SAVED);
    const storedBiz = readSavedBiz() || inferBizFromLeads(saved);
    setLeads(readSession(SESSION_CURRENT));
    setSavedLeads(saved);
    setSavedBiz(storedBiz);
    if (saved.length && !readSavedBiz()) writeSavedBiz(storedBiz);
    // Form empty on refresh; pool still skips deep scrape for same biz+city.
    setBusinessType("");
    setLocation("");
    refreshList().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [refreshList]);

  useEffect(() => {
    const busy = starting || active?.status === "queued" || active?.status === "running";
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
    const QUEUED_STUCK_MS = 45_000;
    const RUNNING_STALL_MS = 180_000;
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
            const claimed = await claimSearchLeads(activeId!);
            if (!cancelled) {
              setCurrent(claimed);
              setResultsTab("current");
            }
          } catch {
            /* already claimed */
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
          setError("Search stuck in Queued. Click Start again.");
          await refreshList();
          return;
        }
        if (run.status === "running" && now - lastPctAt >= RUNNING_STALL_MS) {
          setError("Search stalled with no progress for 3 minutes.");
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
  }, [activeId, refreshList, setCurrent]);

  async function startScrapeNow() {
    setError("");
    setJustCompleted(false);
    setClaiming(false);
    rememberSeen(businessType, leads);
    const exclude = buildExcludePayload(businessType, leads, savedLeads);
    const key = resolvePoolKey(businessType, location);
    setCurrent([]);
    setStarting(true);
    setResultsTab("current");
    try {
      // Same business + city already fully scraped this tab → next page from pool.
      if (key) {
        const batch = pickFromPool(key, maxResults, exclude);
        setActive({
          id: -1,
          input_name: businessType,
          input_location: location,
          max_results: maxResults,
          mode: "contacts",
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
        setLeads(batch);
        writeSession(SESSION_CURRENT, batch);
        rememberSeen(businessType, batch);
        setActive({
          id: -1,
          input_name: businessType,
          input_location: location,
          max_results: maxResults,
          mode: "contacts",
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

      const run = await createSearch(businessType, location, maxResults, exclude, "contacts");
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

  async function startManualScrapeNow(urls: string[]) {
    setError("");
    setJustCompleted(false);
    setClaiming(false);
    setCurrent([]);
    setStarting(true);
    setResultsTab("current");
    setPendingManualUrls(null);
    try {
      const run = await createManualContactSearch(urls);
      setActive(run);
      setActiveId(run.id);
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start website scrape");
    } finally {
      setStarting(false);
      setPendingStart(false);
      setShowSaveModal(false);
    }
  }

  async function onStart(e: FormEvent) {
    e.preventDefault();
    setPendingManualUrls(null);
    if (leads.length > 0) {
      setSavePromptLeads(leads);
      setPendingStart(true);
      setShowSaveModal(true);
      return;
    }
    await startScrapeNow();
  }

  function onManualStart(urls: string[]) {
    if (leads.length > 0) {
      setPendingManualUrls(urls);
      setSavePromptLeads(leads);
      setPendingStart(true);
      setShowSaveModal(true);
      return;
    }
    void startManualScrapeNow(urls);
  }

  function continuePendingStart() {
    if (pendingManualUrls?.length) {
      void startManualScrapeNow(pendingManualUrls);
      return;
    }
    void startScrapeNow();
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
    const current = contactBiz(rows, businessType);
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
          ? contactBiz(incoming, businessType)
          : contactBiz(baseSaved, savedBiz) === contactBiz(incoming, businessType)
            ? contactBiz(incoming, businessType)
            : MIXED_BIZ;
    setSaved(merged, nextBiz);
    rememberSeen(businessType || contactBiz(incoming, businessType), incoming);
    setCurrent([]);
    return merged;
  }

  function onModalSave() {
    const snapshot = savePromptLeads.length ? savePromptLeads : leads;
    setShowSaveModal(false);
    if (needsBizMergePrompt(snapshot)) {
      setSavePromptLeads(snapshot);
      setShowBizMergeModal(true);
      return;
    }
    moveCurrentToSaved(savedLeads, "current", snapshot);
    setSavePromptLeads([]);
    continuePendingStart();
  }

  function onModalCancel() {
    setPendingStart(false);
    setPendingManualUrls(null);
    setShowSaveModal(false);
    setSavePromptLeads([]);
  }

  function finishAfterBizChoice() {
    setShowBizMergeModal(false);
    if (pendingStart) {
      continuePendingStart();
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
      downloadLeadsCsvClient(savedLeads, `contacts_saved_export_${Date.now()}.csv`);
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
    setPendingManualUrls(null);
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

  function onClearCurrent() {
    if (!leads.length) return;
    setCurrent([]);
    // Keep session pool until tab close — refresh still reuses full dig.
  }

  function onClearSaved() {
    if (!savedLeads.length) return;
    setSaved([], "");
    if (resultsTab === "saved") setResultsTab("current");
  }

  function onExportActive() {
    const rows = resultsTab === "saved" ? savedLeads : leads;
    if (!rows.length) return;
    downloadLeadsCsvClient(rows, `contacts_${resultsTab}_${Date.now()}.csv`);
  }

  const displayed = resultsTab === "saved" ? savedLeads : leads;
  const running = active?.status === "queued" || active?.status === "running";
  const stage = stageFromRun(active);
  const pct = Math.min(100, Math.max(0, active?.progress_pct ?? 0));
  const promptLeads = savePromptLeads.length ? savePromptLeads : leads;
  const currentBizName = bizLabel(contactBiz(promptLeads, businessType) || businessType);
  const savedBizName = bizLabel(savedBiz || inferBizFromLeads(savedLeads));
  const showMapsCol = mapsMode || displayed.some((l) => (l.category || "") !== "manual");
  const isManualActive = active?.mode === "manual_contacts" || (!mapsMode && !!active);

  const stageState = useMemo(() => {
    const order: StageKey[] = ["open", "feed", "check", "done"];
    const idx = order.indexOf(stage);
    const map = (key: StageKey): "idle" | "active" | "done" => {
      const k = order.indexOf(key);
      if (active?.status === "completed" || justCompleted) return "done";
      if (k < idx) return "done";
      if (k === idx) return "active";
      return "idle";
    };
    return { open: map("open"), feed: map("feed"), check: map("check"), done: map("done") };
  }, [stage, active?.status, justCompleted]);

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
              <h3 className="text-lg font-bold text-[#111827]">Save {promptLeads.length} contacts?</h3>
              <p className="mt-2 text-sm text-[#6B7280]">
                Save these contacts, then start the new search. Export anytime from the list.
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
                Saved contacts are for <span className="font-semibold text-[#111827]">{savedBizName}</span>.
                Current contacts are for <span className="font-semibold text-[#111827]">{currentBizName}</span>.
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
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <h1 className="smx-report-title !m-0">Contact Finder</h1>
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
            {!mapsMode ? (
              <span className="text-sm font-semibold text-[#7C3AED]">
                {manualReadyCount} / {manualMaxUrls}
              </span>
            ) : null}
            <ContactsModeToggle />
          </div>
        </div>
        {mapsMode ? (
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
                aria-label="Max contacts"
                disabled={starting || running}
              >
                {MAX_RESULTS_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} contacts
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
        ) : (
          <ManualWebsiteScraper
            maxUrls={manualMaxUrls}
            busy={starting || running}
            onStart={onManualStart}
            onReadyCountChange={setManualReadyCount}
          />
        )}

        {active ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-[#6B7280]">
                {active.mode === "manual_contacts"
                  ? `${active.input_name} · ${active.input_location}`
                  : `${active.input_name} in ${active.input_location}`}
              </p>
              <p className="text-sm font-semibold text-[#111827]">
                {active.progress_message || active.status} · {pct}%
              </p>
            </div>
            <Stepper states={stageState} manual={isManualActive} />
            <div className="h-2 overflow-hidden rounded-full bg-[#E5E7EB]">
              <div
                className="h-full rounded-full bg-[#C190FF] transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#D63A2F]">{error}</div>
        ) : null}
      </section>

      <section className="lrp-card !p-0 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#E5E7EB] px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: "current" as const, label: "Current", count: leads.length },
                { id: "saved" as const, label: "Saved", count: savedLeads.length },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={resultsTab === tab.id}
                onClick={() => setResultsTab(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  resultsTab === tab.id ? "bg-[#F3E8FF] text-[#7C3AED]" : "text-[#6B7280] hover:bg-[#F9FAFB]"
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {resultsTab === "current" ? (
              <>
                <button
                  type="button"
                  disabled={!leads.length}
                  onClick={onSaveCurrent}
                  className="rounded-lg bg-[#C190FF] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  type="button"
                  disabled={!leads.length}
                  onClick={onClearCurrent}
                  className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280] disabled:opacity-40"
                >
                  Clear
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!savedLeads.length}
                onClick={onClearSaved}
                className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280] disabled:opacity-40"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              disabled={!displayed.length}
              onClick={onExportActive}
              className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280] disabled:opacity-40"
            >
              Export CSV
            </button>
          </div>
        </div>

        {(running || claiming) && displayed.length === 0 ? (
          <div className="space-y-3 px-4 py-6 sm:px-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="grid grid-cols-[1fr_120px_140px_100px] gap-3">
                <div className="lrp-skeleton" />
                <div className="lrp-skeleton" />
                <div className="lrp-skeleton" />
                <div className="lrp-skeleton" />
              </div>
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="leads-empty">
            <div className="leads-empty-icon" aria-hidden>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-[#111827]">
              {resultsTab === "saved" ? "No saved contacts yet" : "No contacts found yet"}
            </h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-[#6B7280]">
              {resultsTab === "saved"
                ? "Saved contacts show here after you tap Save."
                : mapsMode
                  ? "Start a scrape to find business email and phone from websites."
                  : "Add website URLs and start a scrape to extract public email and phone."}
            </p>
          </div>
        ) : (
          <div className="leads-scroll-panel overflow-x-auto">
            <table className="lrp-table min-w-[720px]">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Website</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Status</th>
                  {showMapsCol ? <th>Maps</th> : null}
                </tr>
              </thead>
              <tbody>
                {displayed.map((lead, i) => (
                  <tr
                    key={`${lead.dedupe_key}-${i}`}
                    className="lrp-row-in"
                    style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                  >
                    <td>
                      <span className="font-bold text-[#C190FF]">{i + 1}</span>
                    </td>
                    <td className="font-semibold text-[#111827]">{lead.business_name || "—"}</td>
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
                        "—"
                      )}
                    </td>
                    <td className="font-mono text-xs text-[#374151]">
                      {lead.phone ? (
                        <a
                          href={whatsappChatUrl(lead.phone, lead.location)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 font-semibold text-[#128C7E] hover:underline"
                          title="Chat on WhatsApp"
                        >
                          {lead.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-xs text-[#374151]">
                      {lead.email ? (
                        <a href={`mailto:${lead.email}`} className="font-semibold text-[#C190FF] hover:underline">
                          {lead.email}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-xs font-semibold text-[#6B7280]">
                      {lead.website_status === "working"
                        ? "OK"
                        : lead.website_status === "failed"
                          ? "Failed"
                          : lead.website_status === "no_contact"
                            ? "No contact"
                            : lead.website_status === "duplicate_email"
                              ? "Dup email"
                              : lead.website_status || "—"}
                    </td>
                    {showMapsCol ? (
                      <td>
                        {(lead.category || "") === "manual" ? (
                          "—"
                        ) : (
                          <a
                            href={lead.source_listing_url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-[#C190FF] hover:underline"
                          >
                            Open
                          </a>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="lrp-card">
        <p className="lrp-panel-title">Recent contact scrapes</p>
        <ul className="leads-recent-scroll text-sm">
          {searches.length === 0 ? (
            <li className="leads-recent-item text-[#6B7280]">None yet.</li>
          ) : null}
          {searches.map((s, i) => (
            <li key={s.id} className="leads-recent-item">
              <span className="font-semibold text-[#111827]">
                {i + 1}.{" "}
                {s.mode === "manual_contacts" ? (
                  <>
                    <span className="mr-1 rounded bg-[#F3E8FF] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#7C3AED]">
                      Manual
                    </span>
                    {s.input_name} · {s.input_location}
                  </>
                ) : (
                  <>
                    {s.input_name} in {s.input_location}
                  </>
                )}
              </span>
              <span className="text-[#6B7280]">
                {s.status} · {s.result_count} contacts
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
