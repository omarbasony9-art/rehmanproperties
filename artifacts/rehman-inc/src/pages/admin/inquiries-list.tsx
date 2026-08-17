// Dedicated Inquiries page — mirrors dashboard table but is full-page with CSV export
import { useState } from "react";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/layout/admin-layout";
import {
  useGetAdminStats,
  useListAdminInquiries,
  getGetAdminStatsQueryKey,
  getListAdminInquiriesQueryKey,
  ListAdminInquiriesStatus,
  useGetAdminMe,
} from "@workspace/api-client-react";
import { Loader2, Search, Download, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800 border-blue-200",
  contacted: "bg-purple-100 text-purple-800 border-purple-200",
  appointment: "bg-amber-100 text-amber-800 border-amber-200",
  offer_made: "bg-emerald-100 text-emerald-800 border-emerald-200",
  under_contract: "bg-indigo-100 text-indigo-800 border-indigo-200",
  closed: "bg-gray-100 text-gray-800 border-gray-200",
  lost: "bg-red-100 text-red-800 border-red-200",
};

const STATUS_LABELS: Record<string, string> = {
  new: "New", contacted: "Contacted", appointment: "Appointment",
  offer_made: "Offer Made", under_contract: "Under Contract",
  closed: "Closed", lost: "Lost",
};

export default function AdminInquiriesList() {
  const [, setLocation] = useLocation();
  const { data: me, isLoading: meLoading } = useGetAdminMe();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ListAdminInquiriesStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"created_at" | "full_name" | "status">("created_at");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(1);
  const limit = 25;

  const listParams = {
    search: search || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    page, limit,
    sortBy: sortBy as "created_at",
    sortDir,
  };
  const { data: listData, isLoading } = useListAdminInquiries(listParams, {
    query: { queryKey: getListAdminInquiriesQueryKey(listParams), enabled: !!me?.authenticated },
  });

  const handleExport = () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter !== "all") params.set("status", statusFilter);
    window.open(`/api/admin/inquiries/export.csv?${params}`, "_blank");
  };

  if (meLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!me?.authenticated) { setLocation("/admin"); return null; }

  const items = listData?.items ?? [];
  const total = listData?.total ?? 0;
  const pages = Math.ceil(total / limit);

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Inquiries</h1>
            <p className="text-muted-foreground text-sm mt-1">{total} total inquiries</p>
          </div>
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search name, address, phone, email..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v as ListAdminInquiriesStatus | "all"); setPage(1); }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={v => setSortBy(v as "created_at")}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="created_at">Date</SelectItem>
              <SelectItem value="full_name">Name</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortDir} onValueChange={v => setSortDir(v as "desc" | "asc")}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Newest First</SelectItem>
              <SelectItem value="asc">Oldest First</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground border border-dashed border-border rounded-xl">
            <p className="font-medium">No inquiries found</p>
            <p className="text-sm mt-1">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <>
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">#</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Name</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Property</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Phone</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Email</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell whitespace-nowrap">Date</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => (
                      <tr
                        key={item.id}
                        className={`border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                        onClick={() => setLocation(`/admin/inquiries/${item.id}`)}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.inquiryNumber}</td>
                        <td className="px-4 py-3 font-medium whitespace-nowrap">{item.fullName}</td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell truncate max-w-48">
                          {item.address}, {item.city}, {item.state}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell whitespace-nowrap">{item.phone}</td>
                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell truncate max-w-36">{item.email}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[item.status] ?? ""}`}>
                            {STATUS_LABELS[item.status] ?? item.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell whitespace-nowrap">
                          {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="px-4 py-3">
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground">
                  Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
