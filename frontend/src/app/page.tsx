import Link from "next/link";

export default function Home() {
  return (
    <div className="relative flex min-h-full flex-1 flex-col overflow-hidden bg-[#0f1017] text-[var(--text-nav)]">
      {/* Base atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_85%_-10%,rgba(193,144,255,0.22)_0%,transparent_55%),radial-gradient(ellipse_50%_40%_at_10%_20%,rgba(193,144,255,0.1)_0%,transparent_50%),linear-gradient(180deg,#12131a_0%,#161822_45%,#0f1017_100%)]"
      />
      {/* Grid — kept, but faded behind copy (Vercel-style mask) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.55] [background-image:linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_70%_65%_at_78%_35%,#000_18%,transparent_72%)] [-webkit-mask-image:radial-gradient(ellipse_70%_65%_at_78%_35%,#000_18%,transparent_72%)]"
      />
      {/* Soft reading scrim behind hero text */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-full max-w-3xl bg-[radial-gradient(ellipse_90%_70%_at_20%_45%,rgba(15,16,23,0.92)_0%,rgba(15,16,23,0.55)_45%,transparent_75%)]"
      />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[var(--bg-primary)] text-sm font-bold text-white shadow-[0_8px_24px_rgba(193,144,255,0.35)]">
            L
          </span>
          <p className="truncate text-sm font-semibold tracking-tight text-white">LeadRankPilot</p>
        </div>
        <nav className="flex shrink-0 items-center gap-2 text-sm text-[#A8AEBF] sm:gap-4">
          <Link href="/pricing" className="hidden transition hover:text-white sm:inline">
            Pricing
          </Link>
          <Link href="/login" className="px-1 transition hover:text-white sm:px-0">
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-[var(--radius-s)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--bg-primary-hover)] sm:px-3 sm:text-sm"
          >
            Start free
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 pb-16 pt-8 sm:px-6 sm:pb-24 sm:pt-10">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#D4B0FF] sm:mb-4">
          Lead generation &amp; content ops
        </p>
        <p
          className="mb-5 font-semibold tracking-tight text-white sm:mb-6"
          style={{ fontSize: "clamp(2.15rem, 10vw, 4.5rem)", lineHeight: 1.05 }}
        >
          LeadRankPilot
        </p>
        <h1 className="max-w-2xl text-[clamp(1.15rem,4.2vw,1.75rem)] font-medium leading-snug text-[#F3F4F8]">
          Source local leads. Generate content. Publish anywhere.
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-7 text-[#B6BCCE] sm:text-base">
          Search Maps, capture contacts, draft AI blog posts, and publish to WordPress or your own
          endpoint—from one secure workspace.
        </p>
        <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:mt-10 sm:max-w-none sm:flex-row sm:flex-wrap">
          <Link
            href="/register"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-s)] bg-[var(--bg-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--bg-primary-hover)] active:scale-[0.98] sm:w-auto"
          >
            Start free
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-s)] border border-white/15 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/[0.06] active:scale-[0.98] sm:w-auto"
          >
            Open workspace
          </Link>
          <Link
            href="/pricing"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-s)] px-5 py-3 text-sm font-semibold text-[#A8AEBF] transition hover:text-white sm:hidden"
          >
            View pricing
          </Link>
        </div>
      </main>
    </div>
  );
}
