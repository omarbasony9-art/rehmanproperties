import { Link, useLocation } from "wouter";
import { useAdminLogout, useGetAdminMe } from "@workspace/api-client-react";
import { LogOut, LayoutDashboard, Building, Settings, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: me, isLoading } = useGetAdminMe();
  const logout = useAdminLogout();

  // If not authenticated and not loading, redirect to login is handled by the page component usually,
  // but we can enforce it here too.
  if (!isLoading && (!me || !me.authenticated) && location !== "/admin") {
    setLocation("/admin");
    return null;
  }

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        setLocation("/admin");
      }
    });
  };

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-sidebar border-r border-border flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-border bg-background">
          <Link href="/admin/dashboard" className="font-serif font-bold text-lg tracking-wider text-sidebar-foreground">
            REHMAN INC Admin
          </Link>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          <Link href="/admin/dashboard" className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${location === "/admin/dashboard" ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}`}>
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>
          <a href="/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors">
            <Building className="w-4 h-4" />
            View Live Site
          </a>
        </nav>
        
        <div className="p-4 border-t border-border mt-auto">
          <Button 
            variant="outline" 
            className="w-full justify-start text-sidebar-foreground/70 border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" 
            onClick={handleLogout}
            disabled={logout.isPending}
          >
            {logout.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogOut className="w-4 h-4 mr-2" />}
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-background md:bg-transparent overflow-hidden">
        {children}
      </main>
    </div>
  );
}
