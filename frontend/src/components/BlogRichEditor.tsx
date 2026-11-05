"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type EditorInternalPost = {
  id: number;
  title: string;
  slug: string;
};

type Props = {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  internalPosts?: EditorInternalPost[];
  siteHost?: string;
};

function run(command: string, value?: string) {
  document.execCommand(command, false, value);
}

function selectedText(): string {
  return window.getSelection()?.toString() || "";
}

function wrapSelectionHtml(html: string) {
  run("insertHTML", html);
}

function markdownTableToHtml(text: string): string | null {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const splitRow = (line: string) =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

  const isSep = (line: string) => /^[:\-| ]+$/.test(line.replace(/\|/g, ""));
  let header = splitRow(lines[0]);
  let bodyStart = 1;
  if (lines[1] && isSep(lines[1])) bodyStart = 2;
  else if (lines.every((l) => l.includes("\t") || l.includes(","))) {
    // TSV / CSV-ish block
    const rows = lines.map((l) => l.split(/\t|,/).map((c) => c.trim()));
    header = rows[0];
    const body = rows.slice(1);
    return tableHtml(header, body);
  }

  const body = lines.slice(bodyStart).map(splitRow);
  if (!header.length) return null;
  return tableHtml(header, body);
}

function statsBlockToHtml(text: string): string | null {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  const rows: string[][] = [];
  for (const line of lines) {
    if (line.includes("|")) {
      rows.push(
        line
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim()),
      );
      continue;
    }
    const m = line.match(/^(.+?)[:\-–—]\s*(.+)$/);
    if (m) rows.push([m[1].trim(), m[2].trim()]);
    else {
      const parts = line.split(/\s{2,}|\t/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) rows.push(parts);
    }
  }
  if (!rows.length) return null;
  const width = Math.max(...rows.map((r) => r.length));
  const normalized = rows.map((r) => {
    const copy = [...r];
    while (copy.length < width) copy.push("");
    return copy;
  });
  return `<table class="stats-table"><tbody>${normalized
    .map((r) => `<tr>${r.map((c) => `<td><strong>${escapeHtml(c)}</strong></td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

function tableHtml(header: string[], body: string[][]): string {
  const width = Math.max(header.length, ...body.map((r) => r.length));
  const pad = (row: string[]) => {
    const copy = [...row];
    while (copy.length < width) copy.push("");
    return copy;
  };
  const h = pad(header);
  return `<table><thead><tr>${h.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody>${body
    .map((r) => `<tr>${pad(r).map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function insertLink(url: string, follow: "nofollow" | "dofollow", label?: string) {
  const text = label || selectedText() || url;
  const rel = follow === "nofollow" ? ' rel="nofollow noopener noreferrer"' : ' rel="noopener noreferrer"';
  const target = ' target="_blank"';
  wrapSelectionHtml(`<a href="${escapeHtml(url)}"${target}${rel}>${escapeHtml(text)}</a>`);
}

function ToolBtn({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} className="blog-editor__icon">
      {children}
    </button>
  );
}

export function BlogRichEditor({ value, onChange, disabled, internalPosts = [], siteHost }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState<"nofollow" | "dofollow">("nofollow");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.innerHTML !== value) el.innerHTML = value || "";
  }, [value]);

  function emit() {
    if (!ref.current) return;
    onChange(ref.current.innerHTML);
  }

  function focusCanvas() {
    ref.current?.focus();
  }

  function cmd(command: string, arg?: string) {
    focusCanvas();
    run(command, arg);
    emit();
  }

  function block(tag: string) {
    focusCanvas();
    // Chrome wants "<h2>"; Firefox accepts "h2"
    run("formatBlock", tag.startsWith("<") ? tag : `<${tag}>`);
    emit();
  }

  function insertQuote() {
    focusCanvas();
    const text = selectedText() || "Quote";
    wrapSelectionHtml(`<blockquote><p>${escapeHtml(text)}</p></blockquote>`);
    emit();
  }

  function insertCode() {
    focusCanvas();
    const text = selectedText() || "code";
    wrapSelectionHtml(`<pre><code>${escapeHtml(text)}</code></pre>`);
    emit();
  }

  function insertHr() {
    focusCanvas();
    wrapSelectionHtml("<hr/>");
    emit();
  }

  function insertTable() {
    focusCanvas();
    wrapSelectionHtml(
      "<table><thead><tr><th>Column 1</th><th>Column 2</th></tr></thead><tbody><tr><td>Value</td><td>Value</td></tr></tbody></table><p></p>",
    );
    emit();
  }

  function convertStats() {
    focusCanvas();
    const text = selectedText();
    if (!text.trim()) {
      window.alert("Select text first (Label: value lines or a small table).");
      return;
    }
    const html = statsBlockToHtml(text);
    if (!html) {
      window.alert("Could not convert selection to a stats table.");
      return;
    }
    wrapSelectionHtml(html);
    emit();
  }

  function convertMarkdownTable() {
    focusCanvas();
    const text = selectedText();
    if (!text.trim()) {
      window.alert("Select Markdown/TSV/CSV table text first.");
      return;
    }
    const html = markdownTableToHtml(text);
    if (!html) {
      window.alert("Could not convert selection to a table.");
      return;
    }
    wrapSelectionHtml(html);
    emit();
  }

  function insertExternalLink() {
    focusCanvas();
    const url = window.prompt(follow === "nofollow" ? "External URL (nofollow)" : "External URL (dofollow)");
    if (!url) return;
    insertLink(url.trim(), follow);
    emit();
  }

  function editRel() {
    focusCanvas();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    let node: Node | null = sel.anchorNode;
    while (node && !(node instanceof HTMLAnchorElement)) node = node.parentNode;
    if (!(node instanceof HTMLAnchorElement)) {
      window.alert("Place the cursor inside a link first.");
      return;
    }
    const next = window.prompt("rel attribute", node.getAttribute("rel") || "");
    if (next == null) return;
    if (next.trim()) node.setAttribute("rel", next.trim());
    else node.removeAttribute("rel");
    emit();
  }

  function insertInternalLink() {
    focusCanvas();
    if (!internalPosts.length) {
      const slug = window.prompt("Internal post slug or path", "/blogs/");
      if (!slug) return;
      const href = slug.startsWith("http") ? slug : slug.startsWith("/") ? slug : `/blogs/${slug}`;
      insertLink(href, "dofollow");
      emit();
      return;
    }
    const choices = internalPosts
      .slice(0, 30)
      .map((p, i) => `${i + 1}. ${p.title} (${p.slug})`)
      .join("\n");
    const pick = window.prompt(`Internal link to article (dofollow)\n${choices}\n\nEnter number or slug:`);
    if (!pick) return;
    const asNum = Number(pick);
    const post =
      Number.isFinite(asNum) && asNum >= 1
        ? internalPosts[asNum - 1]
        : internalPosts.find((p) => p.slug === pick.trim() || p.title.toLowerCase() === pick.trim().toLowerCase());
    if (!post) {
      window.alert("Article not found.");
      return;
    }
    const href = siteHost ? `https://${siteHost}/blogs/${post.slug}` : `/blogs/${post.slug}`;
    insertLink(href, "dofollow", selectedText() || post.title);
    emit();
  }

  return (
    <div className={`blog-editor ${disabled ? "is-disabled" : ""}`}>
      <div className="blog-editor__toolbar" role="toolbar" aria-label="Formatting">
        <ToolBtn title="Bold" disabled={disabled} onClick={() => cmd("bold")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M7 5h6.5a3.5 3.5 0 0 1 2.45 5.99A3.75 3.75 0 0 1 13.25 19H7V5zm3 5.5h3.1a1.5 1.5 0 0 0 0-3H10v3zm0 5.5h3.5a1.75 1.75 0 1 0 0-3.5H10V16z" />
          </svg>
        </ToolBtn>
        <ToolBtn title="Italic" disabled={disabled} onClick={() => cmd("italic")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M10 5h9v2h-3.3l-3.4 10H16v2H7v-2h3.3l3.4-10H10V5z" />
          </svg>
        </ToolBtn>
        <ToolBtn title="Underline" disabled={disabled} onClick={() => cmd("underline")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M6 20h12v2H6v-2zm6-2a5 5 0 0 0 5-5V4h-2.5v9a2.5 2.5 0 1 1-5 0V4H7v9a5 5 0 0 0 5 5z" />
          </svg>
        </ToolBtn>
        <ToolBtn title="Strikethrough" disabled={disabled} onClick={() => cmd("strikeThrough")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M4 11h16v2H4v-2zm8-8c-2.8 0-4.7 1.4-5.4 3.4l2.2.9C9.2 6.1 10.2 5.5 12 5.5c1.9 0 3 0.8 3 2.1 0 .7-.3 1.2-.9 1.6H17c.4-.6.6-1.4.6-2.3C17.6 4.3 15.3 3 12 3zm-1.1 10.2c.3.1.7.2 1.1.2 1.9 0 3-0.8 3-2.2 0-.4-.1-.7-.2-1H7.8c.4 1.3 1.5 2.3 3.1 3z" />
          </svg>
        </ToolBtn>

        <select
          className="blog-editor__select"
          defaultValue="P"
          disabled={disabled}
          aria-label="Paragraph style"
          onChange={(e) => {
            block(e.target.value);
            e.target.value = "P";
          }}
        >
          <option value="P">Paragraph</option>
          <option value="H1">Heading 1</option>
          <option value="H2">Heading 2</option>
          <option value="H3">Heading 3 (FAQ question)</option>
          <option value="H4">Heading 4</option>
        </select>

        <ToolBtn title="Bullet list" disabled={disabled} onClick={() => cmd("insertUnorderedList")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M4 6h2v2H4V6zm4 0h12v2H8V6zM4 11h2v2H4v-2zm4 0h12v2H8v-2zM4 16h2v2H4v-2zm4 0h12v2H8v-2z" />
          </svg>
        </ToolBtn>
        <ToolBtn title="Ordered list" disabled={disabled} onClick={() => cmd("insertOrderedList")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M3 5h1.5v4H3V5zm0 7h2.2v1H4.1v.7H5v1H4.1V16H5.2v1H3v-5zm0 6.2 1.1-1.2H5.5L4 18.7V20H3v-1.8zM8 6h12v2H8V6zm0 5h12v2H8v-2zm0 5h12v2H8v-2z" />
          </svg>
        </ToolBtn>
        <ToolBtn title="Quote" disabled={disabled} onClick={insertQuote}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M7.2 18H3.5l2-7.5H3V6h6.5v4.3L7.2 18zm11 0H14.5l2-7.5H14V6h6.5v4.3L18.2 18z" />
          </svg>
        </ToolBtn>
        <ToolBtn title="Code block" disabled={disabled} onClick={insertCode}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M8 7 3 12l5 5M16 7l5 5-5 5" />
          </svg>
        </ToolBtn>
        <ToolBtn title="Horizontal rule" disabled={disabled} onClick={insertHr}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M3 11h18v2H3v-2z" />
          </svg>
        </ToolBtn>
        <ToolBtn title="Insert table" disabled={disabled} onClick={insertTable}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M3 4h18v16H3V4zm2 2v3h6V6H5zm8 0v3h6V6h-6zM5 11v3h6v-3H5zm8 0v3h6v-3h-6zM5 16v2h6v-2H5zm8 0v2h6v-2h-6z" />
          </svg>
        </ToolBtn>
        <ToolBtn title="Convert selection to box-score / stats table (in place)" disabled={disabled} onClick={convertStats}>
          <span className="blog-editor__chip">STATS</span>
        </ToolBtn>
        <ToolBtn title="Convert selection to Markdown/HTML table (in place)" disabled={disabled} onClick={convertMarkdownTable}>
          <span className="blog-editor__chip">MD→T</span>
        </ToolBtn>

        <select
          className="blog-editor__select blog-editor__select--follow"
          value={follow}
          disabled={disabled}
          aria-label="New link follow type"
          title="New links: nofollow or dofollow"
          onChange={(e) => setFollow(e.target.value as "nofollow" | "dofollow")}
        >
          <option value="nofollow">No Follow</option>
          <option value="dofollow">dofollow</option>
        </select>
        <ToolBtn title={`Insert link (${follow})`} disabled={disabled} onClick={insertExternalLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 5" />
            <path d="M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 0 0 7.07 7.07L13 19" />
          </svg>
        </ToolBtn>
        <ToolBtn title="Edit link rel" disabled={disabled} onClick={editRel}>
          <span className="blog-editor__chip">REL</span>
        </ToolBtn>
        <ToolBtn title="Internal link to article (dofollow)" disabled={disabled} onClick={insertInternalLink}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 5v14M5 12h14" />
            <path d="M7 7h10v10" />
          </svg>
        </ToolBtn>
        <ToolBtn title="Clear formatting" disabled={disabled} onClick={() => cmd("removeFormat")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M4 5h11l-1.5 2H13l-3 9H8l3-9H6.5L4 5zm12.2 6.5 1.4-1.4 2.1 2.1 2.1-2.1 1.4 1.4-2.1 2.1 2.1 2.1-1.4 1.4-2.1-2.1-2.1 2.1-1.4-1.4 2.1-2.1-2.1-2.1z" />
          </svg>
        </ToolBtn>
        <ToolBtn title="Undo" disabled={disabled} onClick={() => cmd("undo")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M9 7H4v5" />
            <path d="M4 12a8 8 0 1 0 2.3-5.7L4 7" />
          </svg>
        </ToolBtn>
        <ToolBtn title="Redo" disabled={disabled} onClick={() => cmd("redo")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M15 7h5v5" />
            <path d="M20 12a8 8 0 1 1-2.3-5.7L20 7" />
          </svg>
        </ToolBtn>
      </div>
      <div
        ref={ref}
        className="blog-editor__canvas"
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        data-placeholder="Write or edit the article here…"
      />
    </div>
  );
}
