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
import { Save, Loader2, ChevronDown, ChevronRight, Database } from "lucide-react";

// Page field definitions — plain text only, no HTML allowed
const PAGES: Array<{
  id: string;
  label: string;
  fields: Array<{ key: string; label: string; type: "text" | "textarea"; placeholder?: string }>;
}> = [
  {
    id: "home",
    label: "Home Page",
    fields: [
      { key: "heroEyebrow",       label: "Hero Eyebrow Text",       type: "text",     placeholder: "WE BUY HOUSES IN NJ" },
      { key: "heroHeadline",      label: "Hero Headline",           type: "textarea", placeholder: "Sell Your House Fast, For Cash" },
      { key: "heroSubheadline",   label: "Hero Subheadline",        type: "textarea", placeholder: "No repairs, no commissions, no stress..." },
      { key: "heroCta",           label: "Hero CTA Button",         type: "text",     placeholder: "Get My Cash Offer" },
      { key: "heroBody",          label: "Hero Body Text",           type: "textarea", placeholder: "Sell your property as-is and see if Rehman INC can provide a straightforward, no-obligation offer." },
      { key: "heroImage",         label: "Hero Background Image URL", type: "text",    placeholder: "https://... (leave blank to use the default hero photo)" },
      { key: "howItWorksTitle",   label: "How It Works — Title",    type: "text",     placeholder: "How It Works" },
      { key: "howItWorksSubtitle",label: "How It Works — Subtitle", type: "textarea", placeholder: "Simple, fast, and straightforward..." },
      { key: "whyUsTitle",        label: "Why Us — Title",          type: "text",     placeholder: "Why Choose Rehman INC?" },
      { key: "whyUsSubtitle",     label: "Why Us — Subtitle",       type: "textarea", placeholder: "We've helped homeowners across NJ..." },
      { key: "finalCtaTitle",     label: "Final CTA — Headline",    type: "textarea", placeholder: "Ready to Sell Your House Fast?" },
      { key: "finalCtaSubtitle",  label: "Final CTA — Subtext",     type: "textarea", placeholder: "Get a fair cash offer today..." },
      { key: "finalCtaButton",    label: "Final CTA — Button",      type: "text",     placeholder: "Get My Cash Offer" },
    ],
  },
  {
    id: "sell",
    label: "Sell Your House",
    fields: [
      { key: "heroEyebrow",   label: "Eyebrow",       type: "text",     placeholder: "GET YOUR CASH OFFER" },
      { key: "heroHeadline",  label: "Headline",      type: "textarea", placeholder: "Sell Your House Fast" },
      { key: "heroSubtext",   label: "Subtext",       type: "textarea", placeholder: "Fill out the form below..." },
      { key: "formTitle",     label: "Form Title",    type: "text",     placeholder: "Tell Us About Your Property" },
      { key: "formSubtitle",  label: "Form Subtitle", type: "textarea", placeholder: "It takes just a few minutes to provide the details we need..." },
    ],
  },
  {
    id: "how-it-works",
    label: "How It Works",
    fields: [
      { key: "heroEyebrow",    label: "Eyebrow",       type: "text",     placeholder: "THE PROCESS" },
      { key: "heroHeadline",   label: "Headline",      type: "textarea", placeholder: "How We Buy Your House" },
      { key: "heroSubtext",    label: "Subtext",       type: "textarea", placeholder: "Our simple 3-step process..." },
      { key: "step1Title",     label: "Step 1 Title",  type: "text",     placeholder: "Contact Us" },
      { key: "step1Body",      label: "Step 1 Body",   type: "textarea" },
      { key: "step2Title",     label: "Step 2 Title",  type: "text",     placeholder: "We Evaluate" },
      { key: "step2Body",      label: "Step 2 Body",   type: "textarea" },
      { key: "step3Title",     label: "Step 3 Title",  type: "text",     placeholder: "You Get Paid" },
      { key: "step3Body",      label: "Step 3 Body",   type: "textarea" },
    ],
  },
  {
    id: "why-us",
    label: "Why Us",
    fields: [
      { key: "heroEyebrow",  label: "Eyebrow",   type: "text",     placeholder: "WHY CHOOSE US" },
      { key: "heroHeadline", label: "Headline",  type: "textarea", placeholder: "The Rehman INC Difference" },
      { key: "heroSubtext",  label: "Subtext",   type: "textarea" },
      { key: "intro",        label: "Intro Text", type: "textarea" },
    ],
  },
  {
    id: "contact",
    label: "Contact Page",
    fields: [
      { key: "heroEyebrow",  label: "Eyebrow",   type: "text",     placeholder: "GET IN TOUCH" },
      { key: "heroHeadline", label: "Headline",  type: "textarea", placeholder: "Contact Rehman INC" },
      { key: "heroSubtext",  label: "Subtext",   type: "textarea" },
      { key: "intro",        label: "Intro Text", type: "textarea" },
    ],
  },
  {
    id: "privacy",
    label: "Privacy Policy",
    fields: [
      { key: "pageTitle",   label: "Page Title",       type: "text",     placeholder: "Privacy Policy" },
      { key: "lastUpdated", label: "Last Updated Date", type: "text",     placeholder: "October 2026" },
      { key: "disclaimer",  label: "Disclaimer Note",   type: "textarea", placeholder: "This page describes our privacy practices..." },
    ],
  },
  {
    id: "terms",
    label: "Terms of Service",
    fields: [
      { key: "pageTitle",   label: "Page Title",       type: "text",     placeholder: "Terms of Service" },
      { key: "lastUpdated", label: "Last Updated Date", type: "text",     placeholder: "October 2026" },
      { key: "disclaimer",  label: "Disclaimer Note",   type: "textarea", placeholder: "This page is for informational purposes only..." },
    ],
  },
  {
    id: "faq",
    label: "FAQ Page",
    fields: [
      { key: "heroEyebrow",  label: "Eyebrow",     type: "text",     placeholder: "Common Questions" },
      { key: "heroHeadline", label: "Headline",    type: "textarea", placeholder: "Questions About Selling? Start Here." },
      { key: "heroSubtext",  label: "Subtext",     type: "textarea", placeholder: "Learn more about the Rehman INC process..." },
    ],
  },
  {
    id: "properties",
    label: "Properties Page",
    fields: [
      { key: "heroEyebrow",  label: "Eyebrow",     type: "text",     placeholder: "Our Portfolio" },
      { key: "heroHeadline", label: "Headline",    type: "textarea", placeholder: "Real Estate We Acquire and Manage." },
      { key: "heroSubtext",  label: "Subtext",     type: "textarea", placeholder: "Explore the types of properties that fit the Rehman INC investment strategy." },
    ],
  },
  {
    id: "footer",
    label: "Footer",
    fields: [
      { key: "tagline",     label: "Footer Tagline",    type: "textarea", placeholder: "Helping New Jersey homeowners..." },
      { key: "copyright",   label: "Copyright Text",    type: "text",     placeholder: "© 2025 Rehman INC. All rights reserved." },
      { key: "disclaimer",  label: "Legal Disclaimer",  type: "textarea" },
    ],
  },
];

export default function AdminWebsiteContent() {
  const [, setLocation] = useLocation();
  const { data: me, isLoading: meLoading } = useGetAdminMe();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activePage, setActivePage] = useState(PAGES[0].id);
  const [forms, setForms] = useState<Record<string, Record<string, string>>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({ home: true });
  const [seeding, setSeeding] = useState(false);

  const handleSeedDefaults = async () => {
    if (!confirm("This will pre-fill any empty content fields with default values. Existing content will not be overwritten. Continue?")) return;
    setSeeding(true);
    try {
      const res = await fetch("/api/site/seed", { method: "POST", credentials: "include" });
      const json = await res.json() as { ok?: boolean; inserted?: number; total?: number };
      if (json.ok) {
        toast({ title: `Seed complete — ${json.inserted} of ${json.total} records inserted` });
        qc.invalidateQueries({ queryKey: ["admin-page-content"] });
      } else {
        toast({ title: "Seed failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Seed request failed", variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  };

  const activePageDef = PAGES.find(p => p.id === activePage)!;

  const { data: content, isLoading } = useQuery({
    queryKey: ["admin-page-content", activePage],
    queryFn: () => getPageContent(activePage),
    enabled: !!me?.authenticated,
  });

  useEffect(() => {
    if (content) {
      setForms(prev => ({
        ...prev,
        [activePage]: Object.fromEntries(
          activePageDef.fields.map(f => [f.key, String(content[f.key] ?? "")])
        ),
      }));
      setDirty(prev => ({ ...prev, [activePage]: false }));
    }
  }, [content, activePage]);

  const saveMutation = useMutation({
    mutationFn: () => savePageContent(activePage, { ...(content ?? {}), ...(forms[activePage] ?? {}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-page-content", activePage] });
      qc.invalidateQueries({ queryKey: ["page-content", activePage] });
      toast({ title: `${activePageDef.label} content saved` });
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
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Website Content</h1>
            <p className="text-muted-foreground text-sm mt-1">Edit visible text on each page. Changes save to the database and update the website.</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleSeedDefaults} disabled={seeding} title="Pre-fill empty fields with default values (existing content is never overwritten)">
            {seeding ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Database className="w-3.5 h-3.5 mr-1.5" />}
            Seed Defaults
          </Button>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Page selector */}
          <div className="md:w-48 shrink-0">
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
              {PAGES.map(p => (
                <button
                  key={p.id}
                  onClick={() => setActivePage(p.id)}
                  className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors border-b border-border last:border-0 ${activePage === p.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
                >
                  {p.label}
                  {dirty[p.id] && <span className="ml-1 text-xs opacity-70">•</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Editor */}
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : (
              <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-semibold">{activePageDef.label}</h2>
                  <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !dirty[activePage]} size="sm">
                    {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                    Save
                  </Button>
                </div>

                <div className="space-y-5">
                  {activePageDef.fields.map(f => (
                    <div key={f.key}>
                      <label className="text-sm font-medium text-muted-foreground block mb-1.5">{f.label}</label>
                      {f.type === "textarea" ? (
                        <Textarea
                          rows={3}
                          value={formValues[f.key] ?? ""}
                          onChange={e => setField(f.key, e.target.value)}
                          placeholder={f.placeholder}
                        />
                      ) : (
                        <Input
                          value={formValues[f.key] ?? ""}
                          onChange={e => setField(f.key, e.target.value)}
                          placeholder={f.placeholder}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {!dirty[activePage] && !saveMutation.isPending && (
                  <p className="text-sm text-muted-foreground mt-4">All changes saved.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
