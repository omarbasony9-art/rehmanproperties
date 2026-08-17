import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetAdminMe } from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Loader2, Images, Info } from "lucide-react";

export default function AdminImages() {
  const [, setLocation] = useLocation();
  const { data: me, isLoading: meLoading } = useGetAdminMe();

  useEffect(() => {
    if (!meLoading && !me?.authenticated) setLocation("/admin");
  }, [meLoading, me, setLocation]);

  if (meLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!me?.authenticated) return null;

  return (
    <AdminLayout>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Images</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage property photos and website media.</p>
        </div>

        {/* Neutral info note — no orange warning */}
        <div className="bg-muted/40 border border-border rounded-xl p-4 mb-6 flex gap-3">
          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Property photo management is available inside each property listing.
            Go to <strong>Properties → Edit</strong> to upload and manage photos for a specific listing.
          </p>
        </div>

        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
          <Images className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Property photos are managed per listing</p>
          <p className="text-sm mt-1 max-w-sm mx-auto">
            Open a property in the <strong>Properties</strong> section to upload, reorder, and manage its photos.
          </p>
          <p className="text-sm mt-3 max-w-sm mx-auto text-muted-foreground/70">
            Inquiry photos submitted via the website form are accessible inside each inquiry detail.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
