import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/layout/admin-layout";
import { useSEO } from "@/hooks/use-seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Loader2,
  RefreshCw,
  MapPin,
  ExternalLink,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "@/lib/admin-api";
import { normalizeArray } from "@/lib/normalize-array";

const BASE = "/foreclosure-tracker/api";

type ForeclosureType = "all" | "tax_foreclosure" | "lien_foreclosure" | "mortgage_foreclosure" | "unknown";

// Matches the shape returned by formatForeclosure() in foreclosures.ts
interface Listing {
  sheriffNumber: string;
  courtCaseNumber: string | null;
  currentSaleDate: string | null;
  originalSaleDate: string | null;
  plaintiffName: string | null;
  defendantName: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  upsetAmount: number | null;
  occupancyStatus: string | null;
  foreclosureType: string | null;
  priorsLiensTaxes: string | null;
  googleMapsUrl: string | null;
  zillowUrl: string | null;
  dealRating: string | null;
  dealScore: number | null;
  estimatedMarketValue: number | null;
  estimatedSpread: number | null;
  discountPercent: number | null;
  warnings: string[];
  firstSeen: string | null;
  lastSeen: string | null;
}

interface ListResponse {
  total: number;
  page: number;
  limit: number;
  items: Listing[];
}

interface Health {
  status: string;
  lastRefresh: string | null;
  listingCount: number;
  majorDeals: number;
}

const RATING_COLORS: Record<string, string> = {
  EXTREME: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-300",
  MAJOR:   "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-300",
  STRONG:  "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-300",
  NORMAL:  "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-300",
  UNKNOWN: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-300",
};

const TYPE_LABELS: Record<string, string> = {
  tax_foreclosure:      "Tax",
  lien_foreclosure:     "Lien",
  mortgage_foreclosure: "Mortgage",
  unknown:              "Unknown",
};

function fmt$(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(s: string | null | undefined) {
  if (!s) return "Never";
  return new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function RatingBadge({ rating }: { rating: string | null }) {
  const r = rating ?? "UNKNOWN";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${RATING_COLORS[r] ?? RATING_COLORS.UNKNOWN}`}>
      {r}
    </span>
  );
}

function DetailSheet({ listing, open, onClose }: { listing: Listing | null; open: boolean; onClose: () => void }) {
  if (!listing) return null;
  const addr = [listing.streetAddress, listing.city, listing.state, listing.zipCode].filter(Boolean).join(", ");
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base font-semibold">{listing.sheriffNumber}</SheetTitle>
          {addr && <p className="text-sm text-muted-foreground">{addr}</p>}
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Deal Score */}
          <div className="flex items-center gap-3">
            <RatingBadge rating={listing.dealRating} />
            {listing.dealScore != null && (
              <span className="text-sm text-muted-foreground">Score: {listing.dealScore}/100</span>
            )}
          </div>

          {/* Warnings */}
          {listing.warnings?.length > 0 && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 space-y-1">
              {listing.warnings.map((w) => (
                <div key={w} className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {w.replace(/_/g, " ")}
                </div>
              ))}
            </div>
          )}

          {/* Financials */}
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Upset Amount",   fmt$(listing.upsetAmount)],
              ["Market Value",   fmt$(listing.estimatedMarketValue)],
              ["Spread",         fmt$(listing.estimatedSpread)],
              ["Discount",       listing.discountPercent != null ? `${listing.discountPercent.toFixed(1)}%` : "—"],
            ].map(([label, val]) => (
              <div key={label} className="rounded-md bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-semibold mt-0.5">{val}</p>
              </div>
            ))}
          </div>

          {/* Property Info */}
          <div className="space-y-2 text-sm">
            <Row label="Type"        value={TYPE_LABELS[listing.foreclosureType ?? ""] ?? listing.foreclosureType ?? "—"} />
            <Row label="Plaintiff"   value={listing.plaintiffName} />
            <Row label="Defendant"   value={listing.defendantName} />
            <Row label="Sale Date"   value={fmtDate(listing.currentSaleDate)} />
            <Row label="Occupancy"   value={listing.occupancyStatus} />
            <Row label="Priors/Liens" value={listing.priorsLiensTaxes} />
            <Row label="First Seen"  value={fmtDateTime(listing.firstSeen)} />
            <Row label="Last Seen"   value={fmtDateTime(listing.lastSeen)} />
          </div>

          {/* External Links */}
          <div className="flex gap-2">
            {listing.googleMapsUrl && (
              <a href={listing.googleMapsUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline">
                <MapPin className="w-3.5 h-3.5" /> Maps
              </a>
            )}
            {listing.zillowUrl && (
              <a href={listing.zillowUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="w-3.5 h-3.5" /> Zillow
              </a>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right truncate">{value || "—"}</span>
    </div>
  );
}

const LIMIT = 50;

export default function AdminForeclosures() {
  useSEO("Foreclosures | Rehman INC Admin", "Admin Portal");
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<ForeclosureType>("all");
  const [maxUpset, setMaxUpset] = useState("");
  const [selected, setSelected] = useState<Listing | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const healthQ = useQuery<Health>({
    queryKey: ["fc-health"],
    queryFn: () => fetch(`${BASE}/health`).then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (typeFilter !== "all") params.set("type", typeFilter);
  if (maxUpset) params.set("maxUpset", maxUpset);

  const listQ = useQuery<ListResponse>({
    queryKey: ["fc-listings", page, typeFilter, maxUpset],
    queryFn: () => fetch(`${BASE}/foreclosures?${params}`).then((r) => r.json()),
  });

  // Normalize: API returns { total, count, page, limit, items: [...] }.
  // normalizeArray handles missing/malformed responses so the page never crashes.
  const listings = normalizeArray<Listing>(listQ.data, ["items"]);

  const totalPages = Math.ceil((listQ.data?.total ?? 0) / LIMIT);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await adminFetch("/api/admin/foreclosure-refresh", { method: "POST" });
      toast({ title: "Refresh started", description: "CivilView scrape is running in the background." });
      setTimeout(() => healthQ.refetch(), 5000);
    } catch (err: unknown) {
      toast({ title: "Refresh failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  };

  const health = healthQ.data;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-serif font-bold">Foreclosures</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Atlantic County Sheriff Sale listings</p>
          </div>
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline" size="sm">
            {refreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Refresh CivilView
          </Button>
        </div>

        {/* Stats bar */}
        {health && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ["Total Listings",  String(health.listingCount)],
              ["Hot Deals",       String(health.majorDeals)],
              ["Last Refresh",    fmtDateTime(health.lastRefresh)],
              ["Status",          health.status === "ok" ? "Online" : "Error"],
            ].map(([label, val]) => (
              <div key={label} className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold mt-0.5 truncate">{val}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as ForeclosureType); setPage(1); }}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="mortgage_foreclosure">Mortgage</SelectItem>
              <SelectItem value="tax_foreclosure">Tax</SelectItem>
              <SelectItem value="lien_foreclosure">Lien</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="Max upset ($)"
              value={maxUpset}
              onChange={(e) => { setMaxUpset(e.target.value); setPage(1); }}
              className="w-40"
            />
          </div>
          {(typeFilter !== "all" || maxUpset) && (
            <Button variant="ghost" size="sm" onClick={() => { setTypeFilter("all"); setMaxUpset(""); setPage(1); }}>
              Clear filters
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-card overflow-hidden">
          {listQ.isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : listQ.isError ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <p className="text-sm font-medium text-destructive">Unable to load listings.</p>
              <p className="text-xs">Check that the Foreclosure Tracker service is running.</p>
            </div>
          ) : listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <p className="text-sm">No listings found.</p>
              <p className="text-xs">Click "Refresh CivilView" to import data.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-3">Sheriff #</th>
                    <th className="px-4 py-3">Address</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Upset</th>
                    <th className="px-4 py-3">Sale Date</th>
                    <th className="px-4 py-3">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {listings.map((item) => {
                    const addr = [item.streetAddress, item.city].filter(Boolean).join(", ");
                    return (
                      <tr
                        key={item.sheriffNumber}
                        onClick={() => setSelected(item)}
                        className="hover:bg-muted/40 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.sheriffNumber}</td>
                        <td className="px-4 py-3 max-w-xs truncate">{addr || "—"}</td>
                        <td className="px-4 py-3 text-xs">{TYPE_LABELS[item.foreclosureType ?? ""] ?? "—"}</td>
                        <td className="px-4 py-3 font-medium tabular-nums">{fmt$(item.upsetAmount)}</td>
                        <td className="px-4 py-3 text-xs tabular-nums">{fmtDate(item.currentSaleDate)}</td>
                        <td className="px-4 py-3"><RatingBadge rating={item.dealRating} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Page {page} of {totalPages} · {listQ.data?.total ?? 0} listings
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <DetailSheet listing={selected} open={!!selected} onClose={() => setSelected(null)} />
    </AdminLayout>
  );
}
