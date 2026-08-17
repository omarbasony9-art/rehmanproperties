import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useGetAdminMe } from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { changePassword } from "@/lib/admin-api";
import { Save, Loader2, Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";

export default function AdminSettingsPage() {
  const [, setLocation] = useLocation();
  const { data: me, isLoading: meLoading } = useGetAdminMe();
  const { toast } = useToast();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);

  const changePwMutation = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: () => {
      toast({ title: "Password changed successfully" });
      setCurrent(""); setNext(""); setConfirm("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (meLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!me?.authenticated) { setLocation("/admin"); return null; }

  const canSubmit = current.length > 0 && next.length >= 4 && next === confirm;

  return (
    <AdminLayout>
      <div className="p-6 max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Admin Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your admin account and security settings.</p>
        </div>

        {/* Change Password */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Change Password</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <Lock className="w-3.5 h-3.5" /> Current Password
              </label>
              <div className="relative">
                <Input
                  type={showCurrent ? "text" : "password"}
                  value={current}
                  onChange={e => setCurrent(e.target.value)}
                  placeholder="Enter current password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <Lock className="w-3.5 h-3.5" /> New Password
              </label>
              <div className="relative">
                <Input
                  type={showNext ? "text" : "password"}
                  value={next}
                  onChange={e => setNext(e.target.value)}
                  placeholder="At least 4 characters"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNext(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <Lock className="w-3.5 h-3.5" /> Confirm New Password
              </label>
              <Input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat new password"
                className={confirm && confirm !== next ? "border-destructive" : ""}
              />
              {confirm && confirm !== next && (
                <p className="text-xs text-destructive mt-1">Passwords do not match</p>
              )}
            </div>

            <div className="pt-1">
              <Button
                onClick={() => changePwMutation.mutate()}
                disabled={!canSubmit || changePwMutation.isPending}
              >
                {changePwMutation.isPending
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Save className="w-4 h-4 mr-2" />}
                Change Password
              </Button>
            </div>
          </div>
        </div>

        {/* Session info */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm mt-4">
          <h2 className="text-lg font-semibold mb-2">Session</h2>
          <p className="text-sm text-muted-foreground">You are currently logged in as administrator. Sessions expire after 24 hours of inactivity.</p>
          <p className="text-sm text-muted-foreground mt-1">To end your session now, use the <strong>Sign Out</strong> button in the sidebar.</p>
        </div>
      </div>
    </AdminLayout>
  );
}
