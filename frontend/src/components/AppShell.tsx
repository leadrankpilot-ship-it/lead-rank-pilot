"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { clearToken, fetchMe, getToken } from "@/lib/api";

type NavItem = {
  href: string;
  label: string;
  group: string;
  icon: ReactNode;
};

const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    group: "Home",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
      </svg>
    ),
  },
  {
    href: "/leads",
    label: "Lead search",
    group: "Lead Gen",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    ),
  },
  {
    href: "/contacts",
    label: "Contact finder",
    group: "Lead Gen",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    ),
  },
  {
    href: "/blogs",
    label: "AI blogs",
    group: "Content",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M5 5h14v14H5z" />
        <path d="M8 9h8M8 12h8M8 15h5" />
      </svg>
    ),
  },
  {
    href: "/billing",
    label: "Billing",
    group: "Account",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 10h18" />
      </svg>
    ),
  },
];

function metaFor(pathname: string) {
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    return {
      suite: "Home",
      title: "Dashboard",
      reportTitle: "Dashboard",
      crumbs: ["Home", "Dashboard"],
      filters: [] as string[],
      hideSubAndFilters: true,
      hideReportHead: true,
    };
  }
  if (pathname.startsWith("/leads")) {
    return {
      suite: "Lead Gen",
      title: "Lead search",
      reportTitle: "Lead Search",
      crumbs: ["Home", "Lead Gen", "Lead search"],
      filters: [] as string[],
      hideSubAndFilters: true,
      hideReportHead: true,
    };
  }
  if (pathname.startsWith("/contacts")) {
    return {
      suite: "Lead Gen",
      title: "Contact finder",
      reportTitle: "Contact Finder",
      crumbs: ["Home", "Lead Gen", "Contact finder"],
      filters: [] as string[],
      hideSubAndFilters: true,
      hideReportHead: true,
    };
  }
  if (pathname.startsWith("/blogs")) {
    return {
      suite: "Content",
      title: "AI blogs",
      reportTitle: "AI Blog Pipeline",
      crumbs: ["Home", "Content", "AI blogs"],
      filters: [] as string[],
      hideSubAndFilters: true,
      hideReportHead: true,
    };
  }
  if (pathname.startsWith("/billing")) {
    return {
      suite: "Account",
      title: "Billing",
      reportTitle: "Billing",
      crumbs: ["Home", "Account", "Billing"],
      filters: [] as string[],
      hideSubAndFilters: true,
      hideReportHead: true,
    };
  }
  if (pathname.startsWith("/profile")) {
    return {
      suite: "Account",
      title: "Profile",
      reportTitle: "Profile",
      crumbs: ["Home", "Account", "Profile"],
      filters: [] as string[],
      hideSubAndFilters: true,
      hideReportHead: false,
    };
  }
  if (pathname.startsWith("/settings")) {
    return {
      suite: "Account",
      title: "Settings",
      reportTitle: "Settings",
      crumbs: ["Home", "Account", "Settings"],
      filters: [] as string[],
      hideSubAndFilters: true,
      hideReportHead: false,
    };
  }
  return {
    suite: "Home",
    title: "Dashboard",
    reportTitle: "Dashboard",
    crumbs: ["Home", "Dashboard"],
    filters: [] as string[],
    hideSubAndFilters: true,
    hideReportHead: true,
  };
}

const SIDEBAR_KEY = "lrp_sidebar_collapsed";
export const CONTACTS_MODE_KEY = "lrp_contacts_maps_mode";
export const CONTACTS_MODE_EVENT = "lrp-contacts-mode";

export function ContactsModeToggle() {
  const [mapsOn, setMapsOn] = useState(true);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CONTACTS_MODE_KEY);
      if (raw === "0") setMapsOn(false);
      else setMapsOn(true);
    } catch {
      setMapsOn(true);
    }
  }, []);

  function setMode(on: boolean) {
    setMapsOn(on);
    try {
      sessionStorage.setItem(CONTACTS_MODE_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent(CONTACTS_MODE_EVENT, { detail: { mapsOn: on } }));
  }

  return (
    <div className="lrp-contacts-mode" role="group" aria-label="Contact finder mode">
      <span className={`lrp-contacts-mode__label ${mapsOn ? "is-active" : ""}`}>Maps finder</span>
      <button
        type="button"
        role="switch"
        aria-checked={mapsOn}
        aria-label={mapsOn ? "Maps Contact Finder on" : "Manual website scraper on"}
        className={`lrp-mode-switch ${mapsOn ? "is-on" : ""}`}
        onClick={() => setMode(!mapsOn)}
      >
        <span className="lrp-mode-switch__knob" />
      </button>
      <span className={`lrp-contacts-mode__label ${!mapsOn ? "is-active" : ""}`}>Manual URLs</span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [planId, setPlanId] = useState("free");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const meta = useMemo(() => metaFor(pathname), [pathname]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_KEY);
      if (saved === "1") setCollapsed(true);
      if (saved === "0") setCollapsed(false);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    fetchMe()
      .then((me) => {
        setEmail(me.email);
        setPlanId(me.plan_id || "free");
      })
      .catch(() => {
        clearToken();
        router.replace("/login");
      });
  }, [router, pathname]);

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    if (!profileOpen) return;
    function onDocClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [profileOpen]);

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

  /** One control: mobile drawer open/close, desktop collapse/expand */
  function toggleSidebar() {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      setMobileOpen((v) => !v);
      return;
    }
    toggleCollapsed();
  }

  function logout() {
    setProfileOpen(false);
    clearToken();
    router.push("/login");
  }

  const rail = collapsed ? 56 : 168;
  const showLabels = mobileOpen || !collapsed;

  return (
    <div className="smx-layout">
      {/* Semrush-style top navigation */}
      <header className="smx-snav" id="lrp-snav-header">
        <div className="smx-snav__wrapper">
          <button
            type="button"
            className="smx-icon-btn"
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

          <Link href="/dashboard" className="smx-snav__brand min-w-0">
            <span className="smx-snav__logo">L</span>
            <span className="smx-snav__name">LeadRankPilot</span>
          </Link>

          <nav className="smx-snav__links">
            <Link href="/pricing">Pricing</Link>
            <Link href="/billing" className="smx-snav__cta">
              <span className="sm:hidden">{planId === "free" ? "Upgrade" : "Plan"}</span>
              <span className="hidden sm:inline">{planId === "free" ? "Start free trial" : "Upgrade"}</span>
            </Link>
            <div className="smx-snav__profile" ref={profileRef}>
              <button
                type="button"
                className="smx-snav__user"
                aria-haspopup="menu"
                aria-expanded={profileOpen}
                title={email || "Account"}
                onClick={() => setProfileOpen((v) => !v)}
              >
                {(email || "U").slice(0, 1).toUpperCase()}
              </button>
              {profileOpen ? (
                <div className="smx-snav__menu" role="menu">
                  <Link
                    href="/profile"
                    role="menuitem"
                    className="smx-snav__menu-item"
                    onClick={() => setProfileOpen(false)}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                      <circle cx="12" cy="8" r="3.5" />
                      <path d="M5 19.5c1.6-3.2 4-4.8 7-4.8s5.4 1.6 7 4.8" />
                    </svg>
                    Profile
                  </Link>
                  <Link
                    href="/settings"
                    role="menuitem"
                    className="smx-snav__menu-item"
                    onClick={() => setProfileOpen(false)}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
                    </svg>
                    Settings
                  </Link>
                  <div className="smx-snav__menu-sep" role="separator" />
                  <button type="button" role="menuitem" className="smx-snav__menu-item is-danger" onClick={logout}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
                      <path d="M15 8l4 4-4 4M9 12h10" />
                    </svg>
                    Log out
                  </button>
                </div>
              ) : null}
            </div>
          </nav>
        </div>
      </header>

      <div className="smx-main-wrap">
        {mobileOpen ? (
          <button type="button" className="smx-overlay lg:hidden" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
        ) : null}

        {/* Toolkit sidebar */}
        <aside
          className={`smx-rail ${mobileOpen ? "is-open" : ""}`}
          style={{ width: mobileOpen ? 196 : rail }}
        >
          {showLabels ? (
            <div className="smx-rail__top">
              <span className="smx-rail__eyebrow">Toolkit</span>
            </div>
          ) : (
            <div className="smx-rail__top is-collapsed" aria-hidden />
          )}

          <nav className="smx-rail__nav">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`smx-rail__item ${active ? "is-active" : ""} ${showLabels ? "" : "is-icon"}`}
                >
                  <span className="smx-rail__icon">{item.icon}</span>
                  {showLabels ? (
                    <span className="smx-rail__text">
                      <span className="smx-rail__label">{item.label}</span>
                      <span className="smx-rail__group">{item.group}</span>
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Report workspace */}
        <div className="smx-content">
          {!meta.hideReportHead ? (
            <div className="smx-report-head">
              <div className="smx-report-head__inner">
                <div className="smx-report-head__row smx-report-head__title-row">
                  <div>
                    <h1 className="smx-report-title">{meta.reportTitle}</h1>
                  </div>
                  {!meta.hideSubAndFilters && meta.filters.length > 0 ? (
                    <div className="smx-filter-pills">
                      {meta.filters.map((f) => (
                        <button key={f} type="button" className="smx-pill">
                          {f}
                        </button>
                      ))}
                      <button type="button" className="smx-pill is-accent">
                        Export
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <main className="smx-report-page" id="reportPage">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
