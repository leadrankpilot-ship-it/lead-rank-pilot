"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { clearAdminToken, getAdminToken } from "@/lib/admin-api";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/plans", label: "Plans" },
  { href: "/admin/blogs", label: "Blogs" },
];

const SIDEBAR_KEY = "lrp_admin_sidebar_collapsed";

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!getAdminToken()) {
      router.replace("/admin/login");
      return;
    }
    setReady(true);
  }, [router, pathname]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_KEY);
      if (saved === "1") setCollapsed(true);
      if (saved === "0") setCollapsed(false);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function toggleSidebar() {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setMobileOpen((v) => !v);
      return;
    }
    toggleCollapsed();
  }

  function logout() {
    clearAdminToken();
    router.push("/admin/login");
  }

  if (!ready) {
    return <div className="smx-layout min-h-screen bg-[#f4f5f5]" />;
  }

  const rail = collapsed ? 56 : 168;
  const showLabels = mobileOpen || !collapsed;

  return (
    <div className="smx-layout">
      <header className="smx-snav" id="lrp-admin-snav">
        <div className="smx-snav__wrapper">
          <button
            type="button"
            className="smx-icon-btn cursor-pointer"
            onClick={toggleSidebar}
            aria-label={mobileOpen || !collapsed ? "Collapse sidebar" : "Expand sidebar"}
            title="Toggle sidebar"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              {mobileOpen || !collapsed ? (
                <path d="M15 6l-6 6 6 6" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>

          <Link href="/admin" className="smx-snav__brand min-w-0">
            <span className="smx-snav__logo">L</span>
            <span className="smx-snav__name">
              <span className="sm:hidden">Admin</span>
              <span className="hidden sm:inline">LeadRankPilot Admin</span>
            </span>
          </Link>
          <nav className="smx-snav__links">
            <button
              type="button"
              className="cursor-pointer rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-[#D63A2F] transition hover:bg-red-100 sm:px-3"
              onClick={logout}
            >
              Log out
            </button>
          </nav>
        </div>
      </header>

      <div className="smx-main-wrap">
        {mobileOpen ? (
          <button
            type="button"
            className="smx-overlay lg:hidden cursor-pointer"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}

        <aside
          className={`smx-rail ${mobileOpen ? "is-open" : ""}`}
          style={{ width: mobileOpen ? 196 : rail }}
        >
          {showLabels ? (
            <div className="smx-rail__top">
              <span className="smx-rail__eyebrow">Admin</span>
            </div>
          ) : (
            <div className="smx-rail__top is-collapsed" aria-hidden />
          )}
          <nav className="smx-rail__nav">
            {NAV.map((item) => {
              const active =
                item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`smx-rail__item ${active ? "is-active" : ""} ${showLabels ? "" : "is-icon"}`}
                >
                  {showLabels ? (
                    <span className="smx-rail__text">
                      <span className="smx-rail__label">{item.label}</span>
                      <span className="smx-rail__group">Manage</span>
                    </span>
                  ) : (
                    <span className="smx-rail__label text-xs font-bold">{item.label.slice(0, 1)}</span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="smx-content">
          <main className="smx-report-page" id="adminReportPage">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
