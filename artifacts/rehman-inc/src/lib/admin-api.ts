// Lightweight admin API helpers — plain fetch, no generated client needed.
// All requests go to /api/* using same-origin browser cookies for auth.

const BASE = "/api";

export async function adminFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...((options.headers ?? {}) as Record<string, string>) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" })) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Properties ────────────────────────────────────────────────────────────
export type Property = {
  id: number; title: string; displayAddress: string | null; propertyType: string | null;
  description: string | null; status: string; featured: boolean; sortOrder: number;
  imageKeys: string[]; createdAt: string; updatedAt: string;
};
export const getProperties = () => adminFetch<Property[]>("/admin/properties");
export const createProperty = (data: Partial<Property>) => adminFetch<Property>("/admin/properties", { method: "POST", body: JSON.stringify(data) });
export const updateProperty = (id: number, data: Partial<Property>) => adminFetch<Property>(`/admin/properties/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteProperty = (id: number) => adminFetch(`/admin/properties/${id}`, { method: "DELETE" });

// ─── FAQs ──────────────────────────────────────────────────────────────────
export type Faq = { id: number; question: string; answer: string; published: boolean; sortOrder: number; createdAt: string; updatedAt: string; };
export const getFaqs = () => adminFetch<Faq[]>("/admin/faqs");
export const createFaq = (data: Partial<Faq>) => adminFetch<Faq>("/admin/faqs", { method: "POST", body: JSON.stringify(data) });
export const updateFaq = (id: number, data: Partial<Faq>) => adminFetch<Faq>(`/admin/faqs/${id}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteFaq = (id: number) => adminFetch(`/admin/faqs/${id}`, { method: "DELETE" });
export const reorderFaqs = (order: number[]) => adminFetch("/admin/faqs/reorder", { method: "POST", body: JSON.stringify({ order }) });

// ─── Site Settings ─────────────────────────────────────────────────────────
export type SiteSettings = Record<string, string>;
export const getSiteSettings = () => adminFetch<SiteSettings>("/admin/site-settings");
export const saveSiteSettings = (data: SiteSettings) => adminFetch("/admin/site-settings", { method: "PUT", body: JSON.stringify(data) });

// ─── Page Content ──────────────────────────────────────────────────────────
export type PageContent = Record<string, unknown>;
export const getPageContent = (page: string) => adminFetch<PageContent>(`/admin/page-content/${page}`);
export const savePageContent = (page: string, data: PageContent) => adminFetch(`/admin/page-content/${page}`, { method: "PUT", body: JSON.stringify(data) });

// ─── Audit Log ─────────────────────────────────────────────────────────────
export type AuditEntry = { id: number; action: string; details: string | null; createdAt: string; };
export const getAuditLog = (page = 1, limit = 50) => adminFetch<AuditEntry[]>(`/admin/audit-log?page=${page}&limit=${limit}`);

// ─── Inquiry Notes ─────────────────────────────────────────────────────────
export type InquiryNote = { id: number; inquiryId: number; note: string; createdAt: string; };
export const getInquiryNotes = (id: number) => adminFetch<InquiryNote[]>(`/admin/inquiries/${id}/notes`);
export const addInquiryNote = (id: number, note: string) => adminFetch<InquiryNote>(`/admin/inquiries/${id}/notes`, { method: "POST", body: JSON.stringify({ note }) });

// ─── Change Password ───────────────────────────────────────────────────────
export const changePassword = (currentPassword: string, newPassword: string) =>
  adminFetch("/admin/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });

// ─── Public site data (no auth) ────────────────────────────────────────────
export const getPublicFaqs = () => fetch(`${BASE}/site/faqs`).then(r => r.json());
export const getPublicProperties = () => fetch(`${BASE}/site/properties`).then(r => r.json());
export const getPublicSettings = () => fetch(`${BASE}/site/settings`).then(r => r.json());
