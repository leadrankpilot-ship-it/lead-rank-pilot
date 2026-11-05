"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AdminUser, fetchAdminUsers, updateAdminUser } from "@/lib/admin-api";
import { SkeletonBones } from "@/components/ui";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);

  const refresh = useCallback(async (query = q) => {
    const rows = await fetchAdminUsers(query);
    setUsers(rows);
  }, [q]);

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load users"))
      .finally(() => setLoading(false));
  }, [refresh]);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await refresh(q);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function patchUser(
    userId: number,
    patch: Partial<Pick<AdminUser, "plan_id" | "billing_status" | "status" | "role">>,
  ) {
    setError("");
    setSavingId(userId);
    try {
      const updated = await updateAdminUser(userId, patch);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="smx-report-title !m-0">Users</h1>
        <form onSubmit={onSearch} className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email"
            className="lrp-input min-w-[220px]"
          />
          <button type="submit" className="lrp-btn lrp-btn-secondary cursor-pointer">
            Search
          </button>
        </form>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#D63A2F]">
          {error}
        </div>
      ) : null}

      <section className="lrp-card !p-0 overflow-hidden">
        {loading ? (
          <div className="p-5">
            <SkeletonBones rows={5} />
          </div>
        ) : users.length === 0 ? (
          <p className="px-5 py-8 text-sm text-[#9CA3AF]">No users found.</p>
        ) : (
          <div className="leads-scroll-panel overflow-x-auto !max-h-[calc(100vh-220px)]">
            <table className="lrp-table min-w-[860px]">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Email</th>
                  <th>Plan</th>
                  <th>Billing</th>
                  <th>Status</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={`lrp-row-in${savingId === u.id ? " opacity-60" : ""}`}>
                    <td className="font-mono text-xs text-[#6B7280]">{u.id}</td>
                    <td className="font-semibold text-[#111827]">{u.email}</td>
                    <td>
                      <select
                        value={u.plan_id}
                        disabled={savingId === u.id}
                        className="rounded-lg border border-[#E5E7EB] bg-white px-2 py-1.5 text-xs font-semibold"
                        onChange={(e) => void patchUser(u.id, { plan_id: e.target.value })}
                      >
                        <option value="free">Free</option>
                        <option value="starter">Starter</option>
                        <option value="pro">Pro</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={u.billing_status || "none"}
                        disabled={savingId === u.id || u.plan_id === "free"}
                        className="rounded-lg border border-[#E5E7EB] bg-white px-2 py-1.5 text-xs font-semibold disabled:opacity-50"
                        onChange={(e) => void patchUser(u.id, { billing_status: e.target.value })}
                      >
                        <option value="none">None</option>
                        <option value="active">Active</option>
                        <option value="past_due">Past due</option>
                        <option value="canceled">Canceled</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={u.status}
                        disabled={savingId === u.id}
                        className="rounded-lg border border-[#E5E7EB] bg-white px-2 py-1.5 text-xs font-semibold"
                        onChange={(e) => void patchUser(u.id, { status: e.target.value })}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={u.role}
                        disabled={savingId === u.id}
                        className="rounded-lg border border-[#E5E7EB] bg-white px-2 py-1.5 text-xs font-semibold"
                        onChange={(e) => void patchUser(u.id, { role: e.target.value })}
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
