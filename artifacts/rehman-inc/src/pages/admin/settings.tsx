import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetAdminMe } from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getSiteSettings, saveSiteSettings } from "@/lib/admin-api";
import { Save, Loader2, AlertCircle } from "lucide-react";

const SETTING_FIELDS = [
  { key: "company_name",         label: "Company Name",                    placeholder: "Rehman INC",                      type: "text" as const },
  { key: "tagline",              label: "Company Tagline",                 placeholder: "We buy houses fast, for cash.",   type: "text" as const },
  { key: "main_cta_text",        label: "Main CTA Button Text",            placeholder: "Get My Cash Offer",               type: "text" as const },
  { key: "notification_email",   label: "Lead Notification Email",         placeholder: "Aliproperties91@gmail.com",       type: "text" as const },
  { key: "address",              label: "Business Address (optional)",     placeholder: "Princeton, NJ",                   type: "text" as const },
  { key: "about_text",           label: "About / Company Description",     placeholder: "Describe your company...",        type: "textarea" as const },
];

const DEFAULTS: Record<string, string> = {
  company_name: "Rehman INC",
  tagline: "We Buy Houses Fast — Any Condition",
  main_cta_text: "Get My Cash Offer",
  notification_email: "Aliproperties91@gmail.com",
  address: "",
  about_text: "",
};

export default function AdminSettings() {
  const [, setLocation] = useLocation();
  const { data: me, isLoading: meLoading } = useGetAdminMe();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState<Record<string, string>>(DEFAULTS);
  const [dirty, setDirty] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin-site-settings"],
    queryFn: getSiteSettings,
    enabled: !!me?.authenticated,
  });

  useEffect(() => {
    if (settings) {
      setForm(Object.fromEntries(SETTING_FIELDS.map(f => [f.key, settings[f.key] ?? DEFAULTS[f.key] ?? ""])));
      setDirty(false);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => saveSiteSettings(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-site-settings"] });
      toast({ title: "Website settings saved" });
      setDirty(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (meLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!me?.authenticated) { setLocation("/admin"); return null; }

  return (
    <AdminLayout>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Website Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Core company information and website configuration.</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-5">
            {SETTING_FIELDS.map(({ key, label, placeholder, type }) => (
              <div key={key}>
                <label className="text-sm font-medium text-muted-foreground block mb-1.5">{label}</label>
                {type === "textarea" ? (
                  <Textarea
                    rows={4}
                    value={form[key] ?? ""}
                    onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setDirty(true); }}
                    placeholder={placeholder}
                  />
                ) : (
                  <Input
                    value={form[key] ?? ""}
                    onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setDirty(true); }}
                    placeholder={placeholder}
                  />
                )}
              </div>
            ))}

            <div className="pt-2 flex items-center gap-3">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !dirty}>
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Settings
              </Button>
              {!dirty && !saveMutation.isPending && settings && (
                <span className="text-sm text-muted-foreground">All changes saved</span>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
