"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AuditReport,
  SavedSearch,
  createAudit,
  createSavedSearch,
  disableSavedSearch,
  listAudits,
  listSavedSearches,
  recheckSavedSearch,
} from "@/lib/api";

export default function AuditsPage() {
  const [url, setUrl] = useState("https://example.com");
  const [audits, setAudits] = useState<AuditReport[]>([]);
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [name, setName] = useState("Weekly gyms LA");
  const [businessType, setBusinessType] = useState("Gym");
  const [location, setLocation] = useState("Los Angeles, USA");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<AuditReport | null>(null);

  const refresh = useCallback(async () => {
    const [a, s] = await Promise.all([listAudits(), listSavedSearches()]);
    setAudits(a);
    setSaved(s);
  }, []);

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [refresh]);

  async function onAudit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const report = await createAudit(url);
      setSelected(report);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audit failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await createSavedSearch({ name, business_type: businessType, location });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <section className="lrp-card space-y-4">
        <div>
          <p className="lrp-panel-title">Run audit</p>
          <p className="mt-1 text-sm text-sm-muted">
            Status classification + basic SEO/mobile/link checks. Not a ranking guarantee.
          </p>
        </div>
        <form onSubmit={onAudit} className="flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="lrp-input flex-1"
            placeholder="https://example.com"
          />
          <button type="submit" disabled={busy} className="lrp-btn lrp-btn-primary">
            {busy ? "AuditingΓÇª" : "Run audit"}
          </button>
        </form>
        {error ? <p className="text-sm text-sm-danger">{error}</p> : null}
      </section>

      {selected ? (
        <section className="lrp-card space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="lrp-badge lrp-badge-orange">{selected.status_category}</span>
            <p className="text-lg font-semibold">
              Score {selected.score?.score ?? "n/a"}
            </p>
          </div>
          <p className="text-sm-muted">{selected.target_url}</p>
          <p className="text-sm-muted">
            Reasons: {(selected.score?.reasons || []).join(", ") || "none"}
          </p>
          <details className="rounded-md border border-sm-border bg-sm-canvas p-3">
            <summary className="cursor-pointer font-medium">Checks JSON</summary>
            <pre className="mt-2 overflow-x-auto text-xs">
              {JSON.stringify(selected.checks, null, 2)}
            </pre>
          </details>
          <ul className="list-disc space-y-1 pl-5 text-sm-muted">
            {(selected.limitations || []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="lrp-card space-y-3">
        <p className="lrp-panel-title">Recent audits</p>
        <ul className="divide-y divide-sm-border text-sm">
          {audits.length === 0 ? <li className="py-3 text-sm-muted">None yet.</li> : null}
          {audits.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <button
                type="button"
                className="text-left font-medium hover:text-sm-orange"
                onClick={() => setSelected(a)}
              >
                #{a.id} {a.status_category}
              </button>
              <span className="truncate text-xs text-sm-muted">{a.target_url}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="lrp-card space-y-4">
        <div>
          <p className="lrp-panel-title">Saved searches</p>
          <h2 className="mt-1 text-lg font-semibold">Re-check schedules</h2>
        </div>
        <form onSubmit={onSave} className="grid gap-2 sm:grid-cols-4">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="lrp-input"
          />
          <input
            required
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            placeholder="Business type"
            className="lrp-input"
          />
          <input
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location"
            className="lrp-input"
          />
          <button type="submit" className="lrp-btn lrp-btn-primary">
            Save
          </button>
        </form>
        <ul className="divide-y divide-sm-border text-sm">
          {saved.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="font-medium">
                #{s.id} {s.name}{" "}
                {!s.enabled ? <span className="lrp-badge lrp-badge-muted">disabled</span> : null}
              </span>
              <button
                type="button"
                className="lrp-btn lrp-btn-ghost"
                onClick={async () => {
                  try {
                    await recheckSavedSearch(s.id);
                    await refresh();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Recheck failed");
                  }
                }}
              >
                Re-check
              </button>
              {s.enabled ? (
                <button
                  type="button"
                  className="lrp-btn lrp-btn-ghost"
                  onClick={async () => {
                    await disableSavedSearch(s.id);
                    await refresh();
                  }}
                >
                  Disable
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
