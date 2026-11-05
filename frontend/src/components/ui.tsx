import { CSSProperties, ReactNode } from "react";

export function Flex({
  children,
  className = "",
  gap = 3,
  align = "center",
  justify,
  wrap,
  col,
  style,
}: {
  children: ReactNode;
  className?: string;
  gap?: 2 | 3 | 4 | 6;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "between" | "end" | "center";
  wrap?: boolean;
  col?: boolean;
  style?: CSSProperties;
}) {
  const alignMap = {
    start: "items-start",
    center: "items-center",
    end: "items-end",
    stretch: "items-stretch",
  };
  const justifyMap = {
    start: "justify-start",
    between: "justify-between",
    end: "justify-end",
    center: "justify-center",
  };
  return (
    <div
      className={`flex ${col ? "flex-col" : ""} ${alignMap[align]} ${justify ? justifyMap[justify] : ""} ${
        wrap ? "flex-wrap" : ""
      } ig-gap-${gap} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

export function Box({
  children,
  className = "",
  style,
}: {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="ig-metric lrp-fade-up">
      <p className="ig-caption">{label}</p>
      <p className={`ig-metric-value ${accent ? "text-sm-orange" : ""}`}>{value}</p>
      {hint ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{hint}</p> : null}
    </div>
  );
}

export function SkeletonBones({ rows = 3 }: { rows?: number }) {
  const count = Math.min(3, Math.max(1, rows));
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="lrp-skeleton" style={{ width: `${92 - i * 12}%`, height: 14 }} />
      ))}
    </div>
  );
}

export function StatusIcon({
  tone = "neutral",
}: {
  tone?: "success" | "danger" | "warning" | "info" | "neutral";
}) {
  const color =
    tone === "success"
      ? "var(--text-success)"
      : tone === "danger"
        ? "var(--text-danger)"
        : tone === "warning"
          ? "var(--orange-500)"
          : tone === "info"
            ? "var(--blue-500)"
            : "var(--text-secondary)";
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color }}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      {tone === "success" ? <path d="M8 12.5 11 15.5 16 9.5" stroke="currentColor" strokeWidth="2" /> : null}
      {tone === "danger" || tone === "warning" ? (
        <>
          <path d="M12 8v5" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="16.5" r="1" fill="currentColor" />
        </>
      ) : null}
      {tone === "info" || tone === "neutral" ? (
        <>
          <path d="M12 11v5" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="8" r="1" fill="currentColor" />
        </>
      ) : null}
    </svg>
  );
}
