import Link from "next/link";

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

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[var(--bg-primary)] text-sm font-bold text-white shadow-[0_8px_24px_rgba(255,98,47,0.4)]">
            L
          </span>
          <p className="truncate text-sm font-semibold tracking-tight text-white">LeadRankPilot</p>
        </div>
        <nav className="flex shrink-0 items-center gap-2 text-sm text-[var(--text-nav-muted)] sm:gap-4">
          <Link href="/pricing" className="hidden hover:text-white sm:inline">
            Pricing
          </Link>
          <Link href="/login" className="px-1 hover:text-white sm:px-0">
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-[var(--radius-s)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[var(--bg-primary-hover)] sm:px-3 sm:text-sm"
          >
            Start free
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 pb-16 pt-8 sm:px-6 sm:pb-24 sm:pt-10">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--orange-400)] sm:mb-4">
          Lead generation &amp; content ops
        </p>
        <p
          className="mb-5 font-semibold tracking-tight text-white sm:mb-6"
          style={{ fontSize: "clamp(2.15rem, 10vw, 4.5rem)", lineHeight: 1.05 }}
        >
          LeadRankPilot
        </p>
        <h1 className="max-w-2xl text-[clamp(1.15rem,4.2vw,1.75rem)] font-medium leading-snug text-[#d7dae6]">
          Source local leads. Generate content. Publish anywhere.
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-7 text-[var(--text-nav-muted)] sm:text-base">
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
            className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-s)] border border-[var(--border-nav)] px-5 py-3 text-sm font-semibold text-white transition hover:border-[var(--orange-500)] active:scale-[0.98] sm:w-auto"
          >
            Open workspace
          </Link>
          <Link
            href="/pricing"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-s)] px-5 py-3 text-sm font-semibold text-[var(--text-nav-muted)] transition hover:text-white sm:hidden"
          >
            View pricing
          </Link>
        </div>
      </main>
    </div>
  );
}
