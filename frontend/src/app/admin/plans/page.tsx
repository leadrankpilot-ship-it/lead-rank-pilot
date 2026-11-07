"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminPlan, fetchAdminPlans, updateAdminPlan } from "@/lib/admin-api";
import { SkeletonBones } from "@/components/ui";

type PlanDraft = {
  name: string;
  price_usd_month: string;
  description: string;
  search_daily_quota: string;
  blog_daily_quota: string;
  websites_max: string;
};

function toDraft(p: AdminPlan): PlanDraft {
  return {
    name: p.name,
    price_usd_month: String(p.price_usd_month),
    description: p.description || "",
    search_daily_quota: String(p.search_daily_quota),
    blog_daily_quota: String(p.blog_daily_quota),
    websites_max: String(p.websites_max),
  };
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAdminPlans()
      .then(setPlans)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load plans"))
      .finally(() => setLoading(false));
  }, []);

  function startEdit(p: AdminPlan) {
    setError("");
    setEditingId(p.id);
    setDraft(toDraft(p));
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!editingId || !draft) return;
    setError("");
    setSaving(true);
    try {
      const updated = await updateAdminPlan(editingId, {
        name: draft.name.trim(),
        price_usd_month: Number(draft.price_usd_month),
        description: draft.description,
        search_daily_quota: Number(draft.search_daily_quota),
        blog_daily_quota: Number(draft.blog_daily_quota),
        websites_max: Number(draft.websites_max),
      });
      setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="smx-report-title !mb-6 !mt-0">Plans</h1>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#D63A2F]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="lrp-card">
              <SkeletonBones rows={4} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p) => {
            const isEditing = editingId === p.id && draft;
            if (isEditing) {
              return (
                <form key={p.id} onSubmit={onSave} className="lrp-card space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      className="lrp-input w-full font-bold"
                      required
                    />
                    <span className="shrink-0 rounded-lg bg-[#F5EDFF] px-2.5 py-1 text-xs font-bold text-[#7C3AED]">
                      {p.id}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[#6B7280]">$</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={draft.price_usd_month}
                      onChange={(e) => setDraft({ ...draft, price_usd_month: e.target.value })}
                      className="lrp-input w-full"
                      required
                    />
                    <span className="text-sm text-[#6B7280]">/mo</span>
                  </div>
                  <textarea
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    className="lrp-input min-h-[72px] w-full resize-y text-sm"
                    rows={3}
                  />
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#6B7280]">Search / day</span>
                      <input
                        type="number"
                        min={0}
                        value={draft.search_daily_quota}
                        onChange={(e) => setDraft({ ...draft, search_daily_quota: e.target.value })}
                        className="lrp-input w-full"
                        required
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#6B7280]">Blogs / day</span>
                      <input
                        type="number"
                        min={0}
                        value={draft.blog_daily_quota}
                        onChange={(e) => setDraft({ ...draft, blog_daily_quota: e.target.value })}
                        className="lrp-input w-full"
                        required
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-[#6B7280]">Websites max</span>
                      <input
                        type="number"
                        min={1}
                        value={draft.websites_max}
                        onChange={(e) => setDraft({ ...draft, websites_max: e.target.value })}
                        className="lrp-input w-full"
                        required
                      />
                    </label>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={saving}
                      className="lrp-btn lrp-btn-primary cursor-pointer disabled:opacity-60"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={cancelEdit}
                      className="lrp-btn lrp-btn-secondary cursor-pointer disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              );
            }

            return (
              <div key={p.id} className="lrp-card space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-bold text-[#111827]">{p.name}</h2>
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-[#F5EDFF] px-2.5 py-1 text-xs font-bold text-[#7C3AED]">
                      {p.id}
                    </span>
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      className="lrp-btn lrp-btn-secondary cursor-pointer !px-2.5 !py-1.5 text-xs"
                    >
                      Edit
                    </button>
                  </div>
                </div>
                <p className="text-2xl font-semibold text-[#111827]">
                  ${p.price_usd_month}
                  <span className="text-sm font-medium text-[#6B7280]">/mo</span>
                </p>
                <p className="text-sm text-[#6B7280]">{p.description || "—"}</p>
                <ul className="space-y-1.5 text-sm text-[#374151]">
                  <li>
                    Search / day: <strong>{p.search_daily_quota}</strong>
                  </li>
                  <li>
                    Blogs / day: <strong>{p.blog_daily_quota}</strong>
                  </li>
                  <li>
                    Websites max: <strong>{p.websites_max}</strong>
                  </li>
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
