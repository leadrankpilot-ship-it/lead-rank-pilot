export type BlogCategory = {
  slug: string;
  label: string;
};

export const BLOG_CATEGORIES: BlogCategory[] = [
  { slug: "lead-generation", label: "Lead Generation" },
  { slug: "contact-discovery", label: "Contact Discovery" },
  { slug: "ai-blogging", label: "AI Blogging" },
  { slug: "wordpress-publishing", label: "WordPress Publishing" },
  { slug: "growth-tips", label: "Growth Tips" },
];

export const DEFAULT_BLOG_CATEGORY = "growth-tips";

export function normalizeBlogCategory(value?: string | null): string {
  const slug = (value || "").trim().toLowerCase();
  return BLOG_CATEGORIES.some((c) => c.slug === slug) ? slug : DEFAULT_BLOG_CATEGORY;
}

export function blogCategoryLabel(value?: string | null): string {
  const slug = normalizeBlogCategory(value);
  return BLOG_CATEGORIES.find((c) => c.slug === slug)?.label || "Growth Tips";
}
