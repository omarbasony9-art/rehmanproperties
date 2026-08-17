import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetAdminMe } from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getPageContent, savePageContent } from "@/lib/admin-api";
import { Save, Loader2 } from "lucide-react";

const SEO_PAGES = [
  { id: "home",         label: "Home" },
  { id: "sell",         label: "Sell Your House" },
  { id: "how-it-works", label: "How It Works" },
  { id: "why-us",       label: "Why Us" },
  { id: "properties",   label: "Properties" },
  { id: "faq",          label: "FAQ" },
  { id: "contact",      label: "Contact" },
  { id: "privacy",      label: "Privacy Policy" },
  { id: "terms",        label: "Terms of Service" },
];

const SEO_FIELDS = [
  { key: "seoTitle",        label: "SEO Title",             type: "text" as const,     placeholder: "Page Title | Rehman INC",              maxLen: 60 },
  { key: "seoDescription",  label: "Meta Description",      type: "textarea" as const, placeholder: "Short page description for search...",  maxLen: 160 },
  { key: "ogTitle",         label: "OG Title",              type: "text" as const,     placeholder: "Same as SEO title or custom" },
  { key: "ogDescription",   label: "OG Description",        type: "textarea" as const, placeholder: "Description for social shares..." },
  { key: "ogImage",         label: "OG Image URL (optional)", type: "text" as const,   placeholder: "https://..." },
];

export default function AdminSEO() {
  const [, setLocation] = useLocation();
  const { data: me, isLoading: meLoading } = useGetAdminMe();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activePage, setActivePage] = useState("home");
  const [forms, setForms] = useState<Record<string, Record<string, string>>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});

  const { data: content, isLoading } = useQuery({
    queryKey: ["admin-page-content-seo", activePage],
    queryFn: () => getPageContent(activePage),
    enabled: !!me?.authenticated,
  });

  useEffect(() => {
    if (content) {
      setForms(prev => ({
        ...prev,
        [activePage]: Object.fromEntries(SEO_FIELDS.map(f => [f.key, String(content[f.key] ?? "")])),
      }));
      setDirty(prev => ({ ...prev, [activePage]: false }));
    }
  }, [content, activePage]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Merge SEO fields into existing page content
      const existing = content ?? {};
      const merged = { ...existing, ...(forms[activePage] ?? {}) };
      return savePageContent(activePage, merged);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-page-content-seo", activePage] });
      qc.invalidateQueries({ queryKey: ["page-content", activePage] });
      toast({ title: "SEO settings saved" });
      setDirty(prev => ({ ...prev, [activePage]: false }));
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const setField = (key: string, value: string) => {
    setForms(prev => ({ ...prev, [activePage]: { ...(prev[activePage] ?? {}), [key]: value } }));
    setDirty(prev => ({ ...prev, [activePage]: true }));
  };

  if (meLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!me?.authenticated) { setLocation("/admin"); return null; }

  const formValues = forms[activePage] ?? {};

  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">SEO Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Edit SEO titles, meta descriptions, and Open Graph settings per page.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          <div className="md:w-44 shrink-0">
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
              {SEO_PAGES.map(p => (
                <button
                  key={p.id}
                  onClick={() => setActivePage(p.id)}
                  className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors border-b border-border last:border-0 ${activePage === p.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
                >
                  {p.label}
                  {dirty[p.id] && <span className="ml-1 opacity-70">•</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : (
              <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-semibold">{SEO_PAGES.find(p => p.id === activePage)?.label}</h2>
                  <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !dirty[activePage]} size="sm">
                    {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                    Save
                  </Button>
                </div>
                <div className="space-y-5">
                  {SEO_FIELDS.map(f => (
                    <div key={f.key}>
                      <label className="text-sm font-medium text-muted-foreground block mb-1">
                        {f.label}
                        {f.maxLen && (
                          <span className={`ml-2 text-xs ${(formValues[f.key] ?? "").length > f.maxLen ? "text-destructive" : "text-muted-foreground"}`}>
                            {(formValues[f.key] ?? "").length}/{f.maxLen}
                          </span>
                        )}
                      </label>
                      {f.type === "textarea" ? (
                        <Textarea rows={2} value={formValues[f.key] ?? ""} onChange={e => setField(f.key, e.target.value)} placeholder={f.placeholder} />
                      ) : (
                        <Input value={formValues[f.key] ?? ""} onChange={e => setField(f.key, e.target.value)} placeholder={f.placeholder} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
