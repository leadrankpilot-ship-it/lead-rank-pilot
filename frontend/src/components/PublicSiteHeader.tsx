import Link from "next/link";

type Props = {
  variant?: "dark" | "light";
};

export function PublicSiteHeader({ variant = "dark" }: Props) {
  const dark = variant === "dark";
  return (
    <header
      className={`relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-6 ${
        dark ? "" : "max-w-5xl"
      }`}
    >
      <Link href="/" className="flex min-w-0 items-center gap-2.5">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-sm font-bold text-white ${
            dark
              ? "bg-[var(--bg-primary)] shadow-[0_8px_24px_rgba(255,98,47,0.4)]"
              : "rounded-md bg-sm-orange"
          }`}
        >
          L
        </span>
        <span
          className={`truncate text-sm font-semibold tracking-tight ${dark ? "text-white" : "text-sm-ink"}`}
        >
          LeadRankPilot
        </span>
      </Link>
      <nav
        className={`flex shrink-0 items-center gap-2 text-sm sm:gap-4 ${
          dark ? "text-[var(--text-nav-muted)]" : "text-sm-muted"
        }`}
      >
        <Link
          href="/blog"
          className={dark ? "hidden hover:text-white sm:inline" : "hover:text-sm-ink"}
        >
          Blog
        </Link>
        <Link
          href="/pricing"
          className={dark ? "hidden hover:text-white sm:inline" : "hidden hover:text-sm-ink sm:inline"}
        >
          Pricing
        </Link>
        <Link href="/login" className={dark ? "px-1 hover:text-white sm:px-0" : "hover:text-sm-ink sm:hidden"}>
          Sign in
        </Link>
        {dark ? (
          <Link
            href="/register"
            className="rounded-[var(--radius-s)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[var(--bg-primary-hover)] sm:px-3 sm:text-sm"
          >
            Start free
          </Link>
        ) : (
          <Link href="/billing" className="text-sm font-semibold text-sm-orange hover:underline">
            <span className="sm:hidden">Billing</span>
            <span className="hidden sm:inline">Account billing</span>
          </Link>
        )}
      </nav>
    </header>
  );
}
