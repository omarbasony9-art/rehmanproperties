import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAdminLogin, useGetAdminMe, getGetAdminMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/hooks/use-seo";

export default function AdminLogin() {
  useSEO("Admin Access | Rehman INC", "Admin Portal");
  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // retry:false is set globally in App.tsx so this resolves in one round-trip
  const { data: me, isLoading } = useGetAdminMe();
  const login = useAdminLogin();

  // Redirect to dashboard once /api/admin/me confirms the cookie is valid
  useEffect(() => {
    if (me?.authenticated) {
      setLocation("/admin/dashboard");
    }
  }, [me, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Already authenticated — render nothing while useEffect fires the redirect
  if (me?.authenticated) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Step 1 — POST /api/admin/login (sets the HttpOnly session cookie)
      await login.mutateAsync({ data: { password } });

      // Step 2 — Verify the cookie was actually established by calling
      // /api/admin/me for real. Do NOT seed the cache with setQueryData.
      // If the Set-Cookie was blocked or malformed, this will return 401
      // and we show an error instead of a phantom "logged-in" state.
      await queryClient.refetchQueries({
        queryKey: getGetAdminMeQueryKey(),
        exact: true,
      });

      const meData = queryClient.getQueryData<{ authenticated: boolean }>(
        getGetAdminMeQueryKey()
      );

      if (!meData?.authenticated) {
        // Login POST succeeded but the session cookie isn't being sent back —
        // most likely a browser cookie policy or SameSite issue.
        toast({
          title: "Session Error",
          description:
            "Signed in but the session could not be established. " +
            "Check that cookies are allowed for this site.",
          variant: "destructive",
        });
      }
      // If authenticated, the useEffect above fires the redirect automatically.
    } catch (err: unknown) {
      const apiErr = err as { data?: { error?: string }; status?: number } | null;
      toast({
        title: "Access Denied",
        description: apiErr?.data?.error ?? "Invalid password. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-xl overflow-hidden">
        <div className="bg-muted p-8 text-center border-b border-border">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <h1 className="font-serif text-2xl font-bold">Admin Access</h1>
          <p className="text-muted-foreground mt-2">Rehman INC Management Portal</p>
        </div>

        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12"
                required
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full h-12 text-lg" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign In"}
            </Button>
          </form>
        </div>
      </div>

      <a
        href="/"
        className="mt-8 text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
      >
        &larr; Return to public site
      </a>
    </div>
  );
}
