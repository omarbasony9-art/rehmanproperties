import { useLocation } from "wouter";
import { useGetAdminMe } from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Loader2, Image, AlertCircle } from "lucide-react";

export default function AdminImages() {
  const [, setLocation] = useLocation();
  const { data: me, isLoading: meLoading } = useGetAdminMe();

  if (meLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!me?.authenticated) { setLocation("/admin"); return null; }

  return (
    <AdminLayout>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Images</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage website images and media.</p>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-5 flex gap-3 mb-6">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">Cloudflare R2 Configuration Required</p>
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Image uploads require Cloudflare R2 credentials to be configured. Set <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">R2_ACCOUNT_ID</code>, <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">R2_ACCESS_KEY_ID</code>, <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">R2_SECRET_ACCESS_KEY</code>, <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">R2_BUCKET_NAME</code>, and <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded text-xs">R2_PUBLIC_URL</code> in Replit environment variables.
            </p>
          </div>
        </div>

        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
          <Image className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Property photos are attached to inquiries</p>
          <p className="text-sm mt-1">View uploaded photos in Admin → Inquiries → [Inquiry Detail].</p>
          <p className="text-sm mt-4 max-w-sm mx-auto">
            When R2 is configured, property photos submitted through the website forms will be stored and accessible here.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
