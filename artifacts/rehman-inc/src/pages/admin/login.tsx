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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // retry:false is set globally in App.tsx so this resolves in one round-trip
  const { data: me, isLoading } = useGetAdminMe();
  const login = useAdminLogin();

  // Redirect to dashboard once authenticated (useEffect to avoid setState-during-render)
  useEffect(() => {
    if (me?.authenticated) {
      setLocation("/admin/dashboard");
    }
  }, [me, setLocation]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  // Already authenticated — render nothing while useEffect fires the redirect
  if (me?.authenticated) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ data: { password } }, {
      onSuccess: (res) => {
        if (res.authenticated) {
          // Seed the cache so every other page immediately sees authenticated:true
          queryClient.setQueryData(getGetAdminMeQueryKey(), { authenticated: true });
          setLocation("/admin/dashboard");
        }
      },
      onError: (err) => {
        toast({
          title: "Access Denied",
          description: (err.data as { error?: string } | null)?.error || "Invalid password",
          variant: "destructive"
        });
      }
    });
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
              />
            </div>
            
            <Button type="submit" className="w-full h-12 text-lg" disabled={login.isPending}>
              {login.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign In"}
            </Button>
          </form>
        </div>
      </div>
      
      <a href="/" className="mt-8 text-muted-foreground hover:text-foreground text-sm font-medium transition-colors">
        &larr; Return to public site
      </a>
    </div>
  );
}
