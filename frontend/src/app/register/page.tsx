"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { register, setToken } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await register(email, password);
      setToken(res.access_token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-full flex-1 items-center justify-center overflow-hidden px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_0%,rgba(255,98,47,0.14),transparent_50%),linear-gradient(180deg,#f8f9fb,#f2f3f7)]"
      />
      <div className="relative w-full max-w-md lrp-fade-up">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--bg-primary)] text-sm font-bold text-white shadow-[0_10px_30px_rgba(255,98,47,0.35)]">
            L
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight">LeadRankPilot</p>
            <p className="text-xs text-[var(--text-secondary)]">Start free in seconds</p>
          </div>
        </div>
        <div className="lrp-card !p-7">
          <h1 className="ig-h2">Create account</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Already registered?{" "}
            <Link href="/login" className="font-semibold text-[var(--text-link)] hover:underline">
              Sign in
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
              <span className="font-semibold">Password (min 8)</span>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="lrp-input"
              />
            </label>
            {error ? <p className="text-sm text-[var(--text-danger)]">{error}</p> : null}
            <button type="submit" disabled={loading} className="lrp-btn lrp-btn-primary w-full">
              {loading ? "Creating…" : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
