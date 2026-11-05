"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { resetPassword } from "@/lib/api";

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!token) {
      setError("Missing reset token. Request a new link.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, password);
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-full flex-1 items-center justify-center overflow-hidden px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(255,98,47,0.14),transparent_50%),linear-gradient(180deg,#f8f9fb,#f2f3f7)]"
      />
      <div className="relative w-full max-w-md lrp-fade-up">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--bg-primary)] text-sm font-bold text-white shadow-[0_10px_30px_rgba(255,98,47,0.35)]">
            L
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight">LeadRankPilot</p>
            <p className="text-xs text-[var(--text-secondary)]">Choose a new password</p>
          </div>
        </div>
        <div className="lrp-card !p-7">
          <h1 className="ig-h2">Reset password</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Pick a new password, then{" "}
            <Link href="/login" className="font-semibold text-[var(--text-link)] hover:underline">
              sign in
            </Link>
            .
          </p>
          {!token ? (
            <p className="mt-6 text-sm text-[var(--text-danger)]">
              This link is missing a token.{" "}
              <Link href="/forgot-password" className="font-semibold underline">
                Request a new reset email
              </Link>
              .
            </p>
          ) : (
            <form onSubmit={onSubmit} className="mt-7 space-y-4">
              <label className="block space-y-1.5 text-sm">
                <span className="font-semibold">New password</span>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="lrp-input pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--text-secondary)] hover:bg-black/5"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-semibold">Confirm password</span>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="lrp-input"
                />
              </label>
              {error ? <p className="text-sm text-[var(--text-danger)]">{error}</p> : null}
              <button type="submit" disabled={loading} className="lrp-btn lrp-btn-primary w-full">
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-[var(--text-secondary)]">Loading…</p>}>
      <ResetPasswordInner />
    </Suspense>
  );
}
