import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useGetAdminMe } from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Loader2, ClipboardList } from "lucide-react";
import { getAuditLog } from "@/lib/admin-api";

const ACTION_LABELS: Record<string, string> = {
  property_added: "Property Added",
  property_updated: "Property Updated",
  property_removed: "Property Removed",
  faq_added: "FAQ Added",
  faq_updated: "FAQ Updated",
  faq_deleted: "FAQ Deleted",
  settings_updated: "Settings Updated",
  content_updated: "Content Updated",
  note_added: "Note Added",
  password_changed: "Password Changed",
};

export default function AdminAudit() {
  const [, setLocation] = useLocation();
  const { data: me, isLoading: meLoading } = useGetAdminMe();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["admin-audit-log"],
    queryFn: () => getAuditLog(1, 100),
    enabled: !!me?.authenticated,
  });

  if (meLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!me?.authenticated) { setLocation("/admin"); return null; }

  return (
    <AdminLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-muted-foreground text-sm mt-1">Recent admin activity. The last 100 actions are shown.</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : logs.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground border border-dashed border-border rounded-xl">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No activity yet</p>
            <p className="text-sm mt-1">Admin actions will appear here.</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Action</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Details</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Date & Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((entry, i) => (
                  <tr key={entry.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {entry.details ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-right whitespace-nowrap">
                      {new Date(entry.createdAt).toLocaleString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                        hour: "numeric", minute: "2-digit", hour12: true,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
