"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Props = {
  maxUrls: number;
  busy: boolean;
  onStart: (urls: string[]) => void;
  onReadyCountChange?: (count: number) => void;
};

function parseUrlLines(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizePreview(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function dedupeUrls(raw: string[], maxUrls: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of raw) {
    const norm = normalizePreview(u);
    const key = norm.split("?")[0].replace(/\/$/, "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(norm);
    if (out.length >= maxUrls) break;
  }
  return out;
}

export default function ManualWebsiteScraper({ maxUrls, busy, onStart, onReadyCountChange }: Props) {
  const [singleUrl, setSingleUrl] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  const [csvName, setCsvName] = useState("");
  const [localError, setLocalError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const uniqueUrls = useMemo(() => dedupeUrls(urls, maxUrls), [urls, maxUrls]);

  const readyCount = useMemo(
    () =>
      dedupeUrls(
        [...urls, ...(singleUrl.trim() ? [singleUrl] : []), ...parseUrlLines(bulkText)],
        maxUrls,
      ).length,
    [urls, singleUrl, bulkText, maxUrls],
  );

  useEffect(() => {
    onReadyCountChange?.(readyCount);
  }, [readyCount, onReadyCountChange]);

  useEffect(() => {
    return () => onReadyCountChange?.(0);
  }, [onReadyCountChange]);

  function collectReady(): string[] {
    const extras = [...(singleUrl.trim() ? [singleUrl] : []), ...parseUrlLines(bulkText)];
    return dedupeUrls([...urls, ...extras], maxUrls);
  }

  function addUrls(incoming: string[]) {
    setLocalError("");
    const next = [...urls, ...incoming.map(normalizePreview).filter(Boolean)];
    if (next.length > maxUrls) {
      setLocalError(`Limit is ${maxUrls} websites per job. Extra URLs were not added.`);
    }
    setUrls(next.slice(0, maxUrls));
  }

  async function onCsv(file: File | null) {
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .map((line) => {
          const cell = line.split(/[,;\t]/)[0]?.trim().replace(/^"|"$/g, "") || "";
          return cell;
        })
        .filter(
          (c) =>
            c &&
            !/^https?:\/\/website$/i.test(c) &&
            c.toLowerCase() !== "url" &&
            c.toLowerCase() !== "website",
        );
      if (!lines.length) {
        setLocalError("No website URLs found in CSV.");
        setCsvName("");
        return;
      }
      setCsvName(file.name);
      addUrls(lines);
    } catch {
      setLocalError("Could not read CSV file.");
      setCsvName("");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const merged = collectReady();
    if (!merged.length) {
      setLocalError("Add at least one website URL.");
      return;
    }
    setUrls(merged);
    setSingleUrl("");
    setBulkText("");
    onStart(merged);
  }

  return (
    <div className="space-y-4">
      <input
        value={singleUrl}
        onChange={(e) => setSingleUrl(e.target.value)}
        placeholder="https://example.com"
        disabled={busy}
        className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2.5 text-sm outline-none focus:border-[#C190FF]"
        aria-label="Website URL"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex h-[148px] flex-col">
          <label className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
            Paste URLs (one per line)
          </label>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            disabled={busy}
            placeholder={"https://site-a.com\nhttps://site-b.com"}
            className="min-h-0 w-full flex-1 resize-none rounded-xl border border-[#E5E7EB] px-3 py-2.5 text-sm outline-none focus:border-[#C190FF]"
          />
        </div>

        <div className="flex h-[148px] flex-col">
          <label className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
            Upload CSV
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="flex min-h-0 w-full flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#D1D5DB] bg-[#F9FAFB] px-3 text-center transition hover:border-[#C190FF] hover:bg-[#F5EDFF] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="1.8" aria-hidden>
              <path d="M12 16V7" />
              <path d="m8.5 10.5 3.5-3.5 3.5 3.5" />
              <path d="M4 16.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5" />
            </svg>
            <span className="text-sm font-semibold text-[#111827]">Choose CSV file</span>
            <span className="max-w-[90%] truncate text-xs text-[#6B7280]">
              {csvName || "Click to select from your PC"}
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            className="hidden"
            onChange={(e) => void onCsv(e.target.files?.[0] || null)}
          />
        </div>
      </div>

      {uniqueUrls.length ? (
        <div className="max-h-36 overflow-auto rounded-xl border border-[#E5E7EB] bg-white">
          <ul className="divide-y divide-[#F3F4F6] text-sm">
            {uniqueUrls.map((u) => (
              <li key={u} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="truncate font-mono text-xs text-[#374151]">{u}</span>
                <button
                  type="button"
                  disabled={busy}
                  className="shrink-0 cursor-pointer text-xs font-semibold text-[#D63A2F]"
                  onClick={() => setUrls((prev) => prev.filter((x) => normalizePreview(x) !== u))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {localError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {localError}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || readyCount === 0}
          className={`leads-start-btn${readyCount && !busy ? " is-ready" : ""}`}
        >
          {busy ? (
            <>
              <span className="lrp-spinner !border-white/40 !border-t-white" />
              Scraping…
            </>
          ) : (
            <>Start website scrape{readyCount ? ` (${readyCount})` : ""}</>
          )}
        </button>
      </form>
    </div>
  );
}
