import { Link, useLocation } from "wouter";
import { useAdminLogout, useGetAdminMe } from "@workspace/api-client-react";
import {
  LogOut, LayoutDashboard, Building2, Loader2,
  FileText, HelpCircle, Phone, Image, Search, Share2,
  SlidersHorizontal, ShieldCheck, ClipboardList,
  History, Menu, House,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

const NAV = [
  { href: "/admin/dashboard",       label: "Dashboard",           icon: LayoutDashboard },
  { href: "/admin/inquiries-list",  label: "Inquiries",           icon: ClipboardList },
  { href: "/admin/website-content", label: "Website Content",     icon: FileText },
  { href: "/admin/properties",      label: "Properties",          icon: Building2 },
  { href: "/admin/faqs",            label: "FAQs",                icon: HelpCircle },
  { href: "/admin/contact-info",    label: "Contact Information", icon: Phone },
  { href: "/admin/images",          label: "Images",              icon: Image },
  { href: "/admin/seo",             label: "SEO",                 icon: Search },
  { href: "/admin/social-media",    label: "Social Media",        icon: Share2 },
  { href: "/admin/settings",        label: "Website Settings",    icon: SlidersHorizontal },
  { href: "/admin/admin-settings",  label: "Admin Settings",      icon: ShieldCheck },
  { href: "/admin/audit",           label: "Audit Log",           icon: History },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: me, isLoading } = useGetAdminMe();
  const logout = useAdminLogout();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Redirect unauthenticated users — useEffect prevents setState-during-render
  useEffect(() => {
    if (!isLoading && (!me || !me.authenticated) && location !== "/admin") {
      setLocation("/admin");
    }
  }, [isLoading, me, location, setLocation]);

  // Render nothing while the redirect fires
  if (!isLoading && (!me || !me.authenticated) && location !== "/admin") {
    return null;
  }

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        window.scrollTo(0, 0);
        setLocation("/");
      },
    });
  };

  const handleExitAdmin = () => {
    window.scrollTo(0, 0);
    setLocation("/");
  };

  const SidebarContent = () => (
    <>
      <div className="h-16 flex items-center px-6 border-b border-border shrink-0">
        <Link href="/admin/dashboard" className="font-serif font-bold text-lg tracking-wider text-foreground">
          REHMAN INC
        </Link>
        <span className="ml-2 text-xs text-muted-foreground font-medium uppercase tracking-widest">Admin</span>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
              location === href || (href !== "/admin/dashboard" && location.startsWith(href))
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        ))}

      </nav>

      <div className="p-3 border-t border-border shrink-0 space-y-1">
        {/* Exit Admin — leaves admin, goes to public homepage, session stays active */}
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-accent"
          onClick={handleExitAdmin}
        >
          <House className="w-4 h-4 mr-2 shrink-0" />
          Exit Admin
        </Button>

        {/* Sign Out — ends session, then goes to public homepage */}
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={handleLogout}
          disabled={logout.isPending}
        >
          {logout.isPending
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : <LogOut className="w-4 h-4 mr-2 shrink-0" />}
          Sign Out
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col md:flex-row">
      {/* Mobile header */}
      <header className="md:hidden flex items-center justify-between h-14 px-4 border-b border-border bg-background sticky top-0 z-40">
        <span className="font-serif font-bold text-sm tracking-wider">REHMAN INC Admin</span>
        <button
          onClick={() => setMobileOpen(o => !o)}
          className="p-2 rounded-md text-muted-foreground hover:bg-accent"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-72 bg-background border-r border-border flex flex-col shadow-xl">
            {SidebarContent()}
          </div>
          <div className="flex-1 bg-black/40" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 bg-background border-r border-border flex-col shrink-0 h-screen sticky top-0">
        {SidebarContent()}
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
