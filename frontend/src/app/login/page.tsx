"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { login, setToken } from "@/lib/api";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await login(email, password);
      setToken(res.access_token);
      const next = params.get("next") || "/dashboard";
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
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
            <p className="text-xs text-[var(--text-secondary)]">Lead ops toolkit</p>
          </div>
        </div>
        <div className="lrp-card !p-7">
          <h1 className="ig-h2">Welcome back</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            No account?{" "}
            <Link href="/register" className="font-semibold text-[var(--text-link)] hover:underline">
              Register
            </Link>
          </p>
          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <label className="block space-y-1.5 text-sm">
              <span className="font-semibold">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="lrp-input"
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="flex items-center justify-between gap-2 font-semibold">
                Password
                <Link href="/forgot-password" className="text-xs font-semibold text-[var(--text-link)] hover:underline">
                  Forgot password?
                </Link>
              </span>
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
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--text-secondary)] hover:bg-black/5 hover:text-[var(--text-primary)]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                      <path d="M9.9 5.1A10.5 10.5 0 0 1 12 5c5 0 9.3 3.1 10.7 7.5a11.3 11.3 0 0 1-1.7 3.2" />
                      <path d="M6.1 6.1A11.4 11.4 0 0 0 1.3 12.5 10.9 10.9 0 0 0 12 19c1.7 0 3.3-.4 4.7-1" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                      <path d="M1.5 12.5S5.5 6 12 6s10.5 6.5 10.5 6.5S18.5 19 12 19 1.5 12.5 1.5 12.5Z" />
                      <circle cx="12" cy="12.5" r="2.8" />
                    </svg>
                  )}
                </button>
              </div>
            </label>
            {error ? <p className="text-sm text-[var(--text-danger)]">{error}</p> : null}
            <button type="submit" disabled={loading} className="lrp-btn lrp-btn-primary w-full">
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-[var(--text-secondary)]">Loading…</p>}>
      <LoginInner />
    </Suspense>
  );
}
