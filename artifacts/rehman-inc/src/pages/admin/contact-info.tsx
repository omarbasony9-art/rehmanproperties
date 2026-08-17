import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetAdminMe } from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getSiteSettings, saveSiteSettings } from "@/lib/admin-api";
import { Save, Loader2, Phone, Mail, User, Instagram, Facebook, Linkedin } from "lucide-react";

const FIELDS = [
  { key: "contact_name",  label: "Contact Name",  icon: User,      placeholder: "Ali Rehman" },
  { key: "contact_phone", label: "Phone Number",  icon: Phone,     placeholder: "609-582-1061" },
  { key: "contact_email", label: "Email Address", icon: Mail,      placeholder: "Aliproperties91@gmail.com" },
  { key: "instagram_url", label: "Instagram URL", icon: Instagram, placeholder: "https://instagram.com/..." },
  { key: "facebook_url",  label: "Facebook URL",  icon: Facebook,  placeholder: "https://facebook.com/..." },
  { key: "linkedin_url",  label: "LinkedIn URL",  icon: Linkedin,  placeholder: "https://linkedin.com/..." },
] as const;

const DEFAULTS: Record<string, string> = {
  contact_name: "Ali Rehman",
  contact_phone: "609-582-1061",
  contact_email: "Aliproperties91@gmail.com",
  instagram_url: "https://www.instagram.com/ali_monopoly/?utm_source=ig_web_button_share_sheet",
  facebook_url: "",
  linkedin_url: "",
};

export default function AdminContactInfo() {
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
      setForm(prev => ({ ...DEFAULTS, ...prev, ...Object.fromEntries(FIELDS.map(f => [f.key, settings[f.key] ?? DEFAULTS[f.key] ?? ""])) }));
      setDirty(false);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => saveSiteSettings(Object.fromEntries(FIELDS.map(f => [f.key, form[f.key] ?? ""]))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-site-settings"] });
      toast({ title: "Contact information saved" });
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
          <h1 className="text-2xl font-bold">Contact Information</h1>
          <p className="text-muted-foreground text-sm mt-1">These values appear on the public website. Saving here updates them everywhere.</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-5">
            {FIELDS.map(({ key, label, icon: Icon, placeholder }) => (
              <div key={key}>
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                  <Icon className="w-3.5 h-3.5" /> {label}
                </label>
                <Input
                  value={form[key] ?? ""}
                  onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setDirty(true); }}
                  placeholder={placeholder}
                />
              </div>
            ))}

            <div className="pt-2 flex items-center gap-3">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !dirty}>
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Contact Information
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
