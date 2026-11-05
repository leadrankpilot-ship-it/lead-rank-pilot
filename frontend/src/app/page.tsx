import Link from "next/link";
import { Suspense } from "react";
import { fetchApiHealth } from "@/lib/api";

async function BackendStatus() {
  let online = false;
  try {
    const health = await fetchApiHealth();
    online = health.status === "ok";
  } catch {
    online = false;
  }
  return (
    <p className="text-xs tracking-wide text-[var(--text-nav-muted)]">
      {online ? "System online" : "System offline"}
    </p>
  );
}

export default function Home() {
  return (
    <div className="relative flex min-h-full flex-1 flex-col overflow-hidden bg-[var(--bg-nav)] text-[var(--text-nav)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,rgba(255,98,47,0.28)_0%,transparent_50%),radial-gradient(ellipse_at_90%_10%,rgba(255,98,47,0.12)_0%,transparent_40%),linear-gradient(180deg,#14151f_0%,#1d1e2c_50%,#12131a_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:48px_48px]"
      />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[var(--bg-primary)] text-sm font-bold text-white shadow-[0_8px_24px_rgba(255,98,47,0.4)]">
            L
          </span>
          <p className="text-sm font-semibold tracking-tight text-white">LeadRankPilot</p>
        </div>
        <nav className="flex items-center gap-4 text-sm text-[var(--text-nav-muted)]">
          <Link href="/pricing" className="hover:text-white">
            Pricing
          </Link>
          <Link href="/login" className="hover:text-white">
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-[var(--radius-s)] bg-[var(--bg-primary)] px-3 py-1.5 font-semibold text-white hover:bg-[var(--bg-primary-hover)]"
          >
            Start free
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 pb-24 pt-10">
        <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--orange-400)]">
          Lead ops toolkit
        </p>
        <p
          className="mb-6 font-semibold tracking-tight text-white"
          style={{ fontSize: "clamp(2.5rem, 8vw, 4.5rem)", lineHeight: 1.05 }}
        >
          LeadRankPilot
        </p>
        <h1 className="max-w-2xl text-[clamp(1.25rem,3vw,1.75rem)] font-medium leading-snug text-[#d7dae6]">
          Find local leads. Ship AI blog drafts. Publish with confidence.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-[var(--text-nav-muted)]">
          A Semrush-style workspace for operators — Maps lead search and WordPress or custom
          publishing in one calm, high-contrast toolkit.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/register"
            className="rounded-[var(--radius-s)] bg-[var(--bg-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--bg-primary-hover)] active:scale-[0.98]"
          >
            Start free
          </Link>
          <Link
            href="/dashboard"
            className="rounded-[var(--radius-s)] border border-[var(--border-nav)] px-5 py-3 text-sm font-semibold text-white transition hover:border-[var(--orange-500)] active:scale-[0.98]"
          >
            Open workspace
          </Link>
        </div>
        <div className="mt-16">
          <Suspense fallback={<p className="text-xs text-[var(--text-nav-muted)]">Checking system…</p>}>
            <BackendStatus />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
