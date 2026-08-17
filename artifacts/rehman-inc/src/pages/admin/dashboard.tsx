import { useState } from "react";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/layout/admin-layout";
import { 
  useGetAdminStats, 
  useListAdminInquiries, 
  ListAdminInquiriesStatus,
  InquiryStatus,
  useGetAdminMe
} from "@workspace/api-client-react";
import { 
  Loader2, 
  Search,
  Filter,
  ChevronRight,
  Home
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/hooks/use-seo";

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  contacted: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  appointment: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  offer_made: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  under_contract: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800",
  closed: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700",
  lost: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
};

const statusLabels: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  appointment: "Appointment",
  offer_made: "Offer Made",
  under_contract: "Under Contract",
  closed: "Closed",
  lost: "Lost",
};

export default function AdminDashboard() {
  useSEO("Dashboard | Rehman INC Admin", "Admin Portal");
  const [, setLocation] = useLocation();
  const { data: me, isLoading: meLoading } = useGetAdminMe();
  
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ListAdminInquiriesStatus | "all">("all");
  const [page, setPage] = useState(1);
  const limit = 10;
  
  const { data: stats, isLoading: statsLoading } = useGetAdminStats({
    query: { enabled: !!me?.authenticated }
  });
  
  const { data: listData, isLoading: listLoading } = useListAdminInquiries({
    search: search || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    page,
    limit,
    sortBy: "created_at",
    sortDir: "desc"
  }, {
    query: { enabled: !!me?.authenticated }
  });

  if (meLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!me?.authenticated) {
    setLocation("/admin");
    return null;
  }

  return (
    <AdminLayout>
      <div className="p-6 md:p-10 flex-1 overflow-y-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of all property inquiries.</p>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-10">
          {[
            { key: "new", label: "New" },
            { key: "contacted", label: "Contacted" },
            { key: "appointment", label: "Appointment" },
            { key: "offerMade", label: "Offer Made" },
            { key: "underContract", label: "Under Contract" },
            { key: "closed", label: "Closed" },
            { key: "lost", label: "Lost" },
          ].map((stat) => (
            <div key={stat.key} className="bg-card border border-border p-4 rounded-xl shadow-sm">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{stat.label}</p>
              <p className="text-2xl font-bold mt-1 text-foreground">
                {statsLoading ? <Loader2 className="w-4 h-4 animate-spin my-1" /> : (stats?.[stat.key as keyof typeof stats] || 0)}
              </p>
            </div>
          ))}
        </div>

        {/* LIST CONTROLS */}
        <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/20 flex flex-col sm:flex-row gap-4 justify-between items-center">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search address, name, phone..." 
                className="pl-9 h-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-muted-foreground hidden sm:block" />
              <Select value={statusFilter} onValueChange={(val: any) => { setStatusFilter(val); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-48 h-10">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(statusLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* TABLE */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/40">
                <tr>
                  <th className="px-6 py-4 font-medium border-b border-border">Inquiry</th>
                  <th className="px-6 py-4 font-medium border-b border-border">Property</th>
                  <th className="px-6 py-4 font-medium border-b border-border">Seller</th>
                  <th className="px-6 py-4 font-medium border-b border-border">Date</th>
                  <th className="px-6 py-4 font-medium border-b border-border">Status</th>
                  <th className="px-6 py-4 font-medium border-b border-border"></th>
                </tr>
              </thead>
              <tbody>
                {listLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : listData?.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                      No inquiries found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  listData?.items.map((inquiry) => (
                    <tr 
                      key={inquiry.id} 
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setLocation(`/admin/inquiries/${inquiry.id}`)}
                    >
                      <td className="px-6 py-4 font-medium whitespace-nowrap">
                        {inquiry.inquiryNumber}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-2">
                          <Home className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div>
                            <div className="font-medium text-foreground">{inquiry.address}</div>
                            <div className="text-xs text-muted-foreground">{inquiry.city}, {inquiry.state} {inquiry.zip}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium">{inquiry.fullName}</div>
                        <div className="text-xs text-muted-foreground">{inquiry.phone}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {new Date(inquiry.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusColors[inquiry.status]}`}>
                          {statusLabels[inquiry.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <ChevronRight className="w-5 h-5 text-muted-foreground inline-block" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* PAGINATION */}
          {listData && listData.total > 0 && (
            <div className="p-4 border-t border-border flex items-center justify-between bg-muted/20 text-sm text-muted-foreground">
              <div>
                Showing <span className="font-medium text-foreground">{(page - 1) * limit + 1}</span> to <span className="font-medium text-foreground">{Math.min(page * limit, listData.total)}</span> of <span className="font-medium text-foreground">{listData.total}</span> inquiries
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  disabled={page * limit >= listData.total}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
