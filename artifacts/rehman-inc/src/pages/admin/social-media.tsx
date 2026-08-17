import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetAdminMe } from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getSiteSettings, saveSiteSettings } from "@/lib/admin-api";
import { Save, Loader2, Instagram, Facebook, Linkedin, Twitter, ExternalLink } from "lucide-react";

const SOCIAL_FIELDS = [
  { key: "instagram_url", label: "Instagram",  icon: Instagram, placeholder: "https://www.instagram.com/yourhandle" },
  { key: "facebook_url",  label: "Facebook",   icon: Facebook,  placeholder: "https://www.facebook.com/yourpage" },
  { key: "linkedin_url",  label: "LinkedIn",   icon: Linkedin,  placeholder: "https://www.linkedin.com/company/..." },
  { key: "twitter_url",   label: "X (Twitter)", icon: Twitter,  placeholder: "https://x.com/yourhandle" },
] as const;

const DEFAULTS: Record<string, string> = {
  instagram_url: "https://www.instagram.com/ali_monopoly/?utm_source=ig_web_button_share_sheet",
  facebook_url: "",
  linkedin_url: "",
  twitter_url: "",
};

export default function AdminSocialMedia() {
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
      setForm(Object.fromEntries(SOCIAL_FIELDS.map(f => [f.key, settings[f.key] ?? DEFAULTS[f.key] ?? ""])));
      setDirty(false);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => saveSiteSettings(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-site-settings"] });
      toast({ title: "Social media links saved" });
      setDirty(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (meLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!me?.authenticated) { setLocation("/admin"); return null; }

  return (
    <AdminLayout>
      <div className="p-6 max-w-xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Social Media</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage social media links shown on the website and in the footer.</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-5">
            {SOCIAL_FIELDS.map(({ key, label, icon: Icon, placeholder }) => (
              <div key={key}>
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                  <Icon className="w-3.5 h-3.5" /> {label}
                </label>
                <div className="flex gap-2">
                  <Input
                    value={form[key] ?? ""}
                    onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setDirty(true); }}
                    placeholder={placeholder}
                    className="flex-1"
                  />
                  {form[key] && (
                    <a href={form[key]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
            <div className="pt-2 flex items-center gap-3">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !dirty}>
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Social Links
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
