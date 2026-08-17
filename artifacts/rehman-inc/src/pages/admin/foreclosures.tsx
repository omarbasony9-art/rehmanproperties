import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/layout/admin-layout";
import { useSEO } from "@/hooks/use-seo";
import { Button } from "@/components/ui/button";
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
  Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "@/lib/admin-api";
import { normalizeArray } from "@/lib/normalize-array";

const BASE = "/foreclosure-tracker/api";

// ─── Interfaces ───────────────────────────────────────────────────────────────

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
  approxJudgment: number | null;
  occupancyStatus: string | null;
  foreclosureType: string | null;
  priorsLiensTaxes: string | null;
  googleMapsUrl: string | null;
  zillowUrl: string | null;
  detailUrl: string | null;
  dealRating: string | null;
  dealScore: number | null;
  estimatedMarketValue: number | null;
  estimatedSpread: number | null;
  discountPercent: number | null;
  equityMultiple: number | null;
  warnings: string[];
  valuationStatus: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  lastChanged: string | null;
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

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type TabId = "all" | "under280k" | "extreme" | "major" | "strong" | "unknown";

const TABS: { id: TabId; label: string; params: Record<string, string> }[] = [
  { id: "all",      label: "All Listings",       params: {} },
  { id: "under280k",label: "Under $280K",        params: { maxUpset: "280000" } },
  { id: "extreme",  label: "Extreme Deals",      params: { rating: "EXTREME" } },
  { id: "major",    label: "Major Deals",        params: { rating: "MAJOR" } },
  { id: "strong",   label: "Strong Deals",       params: { rating: "STRONG" } },
  { id: "unknown",  label: "Unknown Valuation",  params: { unknownValuation: "true" } },
];

// ─── Style helpers ─────────────────────────────────────────────────────────────

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
  const d = new Date(s + (s.includes("T") ? "" : "T12:00:00"));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(s: string | null | undefined) {
  if (!s) return "Never";
  return new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RatingBadge({ rating }: { rating: string | null }) {
  const r = rating ?? "UNKNOWN";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${RATING_COLORS[r] ?? RATING_COLORS["UNKNOWN"]}`}>
      {r}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right truncate">{value ?? "—"}</span>
    </div>
  );
}

function DetailSheet({
  listing,
  open,
  onClose,
  onGetValue,
  valuating,
}: {
  listing: Listing | null;
  open: boolean;
  onClose: () => void;
  onGetValue: (l: Listing) => void;
  valuating: boolean;
}) {
  if (!listing) return null;
  const addr = [listing.streetAddress, listing.city, listing.state, listing.zipCode].filter(Boolean).join(", ");
  const hasMarketValue = listing.estimatedMarketValue != null;
  const canValue = !hasMarketValue || listing.valuationStatus === "NOT_FOUND";

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base font-semibold font-mono">{listing.sheriffNumber}</SheetTitle>
          {addr && <p className="text-sm text-muted-foreground">{addr}</p>}
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Rating + Score */}
          <div className="flex items-center gap-3 flex-wrap">
            <RatingBadge rating={listing.dealRating} />
            {listing.dealScore != null && (
              <span className="text-sm text-muted-foreground">Score: {listing.dealScore}/100</span>
            )}
            {listing.valuationStatus && listing.valuationStatus !== "UNKNOWN" && (
              <span className={`text-xs px-2 py-0.5 rounded border ${
                listing.valuationStatus === "SUCCESS" ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400" :
                listing.valuationStatus === "NOT_FOUND" ? "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400" :
                "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400"
              }`}>
                {listing.valuationStatus}
              </span>
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
              ["Upset Amount",    fmt$(listing.upsetAmount)],
              ["Market Value",    hasMarketValue ? fmt$(listing.estimatedMarketValue) : "Not valued yet"],
              ["Potential Spread", hasMarketValue ? fmt$(listing.estimatedSpread) : "—"],
              ["Discount",        listing.discountPercent != null ? `${listing.discountPercent.toFixed(1)}%` : "—"],
            ].map(([label, val]) => (
              <div key={label} className="rounded-md bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-sm font-semibold mt-0.5 ${val === "Not valued yet" ? "text-muted-foreground italic" : ""}`}>{val as string}</p>
              </div>
            ))}
          </div>

          {/* Get Property Value button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={() => onGetValue(listing)}
            disabled={valuating}
          >
            {valuating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {valuating ? "Fetching valuation…" : "Get Property Value"}
          </Button>

          {/* Property Info */}
          <div className="space-y-2 text-sm">
            <Row label="Type"        value={TYPE_LABELS[listing.foreclosureType ?? ""] ?? listing.foreclosureType ?? "—"} />
            <Row label="Plaintiff"   value={listing.plaintiffName} />
            <Row label="Defendant"   value={listing.defendantName} />
            <Row label="Sale Date"   value={fmtDate(listing.currentSaleDate)} />
            <Row label="Court Case"  value={listing.courtCaseNumber} />
            <Row label="Occupancy"   value={listing.occupancyStatus} />
            <Row label="Priors/Liens" value={listing.priorsLiensTaxes ? listing.priorsLiensTaxes.slice(0, 200) + (listing.priorsLiensTaxes.length > 200 ? "…" : "") : null} />
            <Row label="First Seen"  value={fmtDateTime(listing.firstSeen)} />
            <Row label="Last Seen"   value={fmtDateTime(listing.lastSeen)} />
          </div>

          {/* External Links */}
          <div className="flex gap-4">
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
            {listing.detailUrl && (
              <a href={listing.detailUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="w-3.5 h-3.5" /> CivilView
              </a>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const LIMIT = 50;

export default function AdminForeclosures() {
  useSEO("Foreclosures | Rehman INC Admin", "Admin Portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab]     = useState<TabId>("all");
  const [page, setPage]   = useState(1);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [valuatingId, setValuatingId] = useState<string | null>(null);

  const healthQ = useQuery<Health>({
    queryKey: ["fc-health"],
    queryFn: () => fetch(`${BASE}/health`).then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0]!;
  const params = new URLSearchParams({
    page:  String(page),
    limit: String(LIMIT),
    ...activeTab.params,
  });

  const listQ = useQuery<ListResponse>({
    queryKey: ["fc-listings", tab, page],
    queryFn: () => fetch(`${BASE}/foreclosures?${params}`).then((r) => r.json()),
  });

  const listings   = normalizeArray<Listing>(listQ.data, ["items"]);
  const totalPages = Math.ceil((listQ.data?.total ?? 0) / LIMIT);

  const handleTabChange = (id: TabId) => { setTab(id); setPage(1); };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await adminFetch("/api/admin/foreclosure-refresh", { method: "POST" });
      toast({ title: "Refresh started", description: "CivilView scrape is running in the background." });
      setTimeout(() => { healthQ.refetch(); listQ.refetch(); }, 8000);
    } catch (err: unknown) {
      toast({ title: "Refresh failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  };

  const handleGetValue = async (listing: Listing) => {
    const apiKey = true; // checked server-side
    if (!apiKey) return;
    setValuatingId(listing.sheriffNumber);
    try {
      const resp = await fetch(`${BASE}/foreclosures/${listing.sheriffNumber}/valuation`, { method: "POST" });
      const data = await resp.json() as { valuationStatus?: string; estimatedMarketValue?: number; error?: string };
      if (!resp.ok) {
        toast({ title: "Valuation failed", description: data.error ?? "Unknown error", variant: "destructive" });
        return;
      }
      if (data.valuationStatus === "NOT_FOUND") {
        toast({ title: "Property not found", description: "RentCast could not identify this property." });
      } else if (data.estimatedMarketValue) {
        toast({ title: "Valuation complete", description: `Market value: ${fmt$(data.estimatedMarketValue)}` });
      }
      // Refresh listings and update selected
      await queryClient.invalidateQueries({ queryKey: ["fc-listings"] });
      if (selected?.sheriffNumber === listing.sheriffNumber) {
        // Re-fetch to update the sheet
        const updated = await fetch(`${BASE}/foreclosures/${listing.sheriffNumber}`).then((r) => r.json()) as Listing;
        setSelected(updated);
      }
    } catch (err) {
      toast({ title: "Valuation error", description: err instanceof Error ? err.message : "Network error", variant: "destructive" });
    } finally {
      setValuatingId(null);
    }
  };

  const health = healthQ.data;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
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
              ["Total Listings", String(health.listingCount)],
              ["Watch List",     String(health.majorDeals)],
              ["Last Refresh",   fmtDateTime(health.lastRefresh)],
              ["Status",         health.status === "ok" ? "Online" : "Error"],
            ].map(([label, val]) => (
              <div key={label} className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold mt-0.5 truncate">{val}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 border-b">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors rounded-t-md -mb-px border-b-2 ${
                tab === t.id
                  ? "border-primary text-primary bg-background"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-card overflow-hidden">
          {listQ.isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : listQ.isError ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <p className="text-sm font-medium text-destructive">Unable to load listings.</p>
              <p className="text-xs">Check that the Foreclosure Tracker service is running.</p>
            </div>
          ) : listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <p className="text-sm">No listings found.</p>
              {tab === "all" && <p className="text-xs">Click "Refresh CivilView" to import data.</p>}
              {(tab === "extreme" || tab === "major" || tab === "strong") && (
                <p className="text-xs">No {tab} deals yet — run valuations to score properties.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <th className="px-3 py-3 whitespace-nowrap">Rating</th>
                    <th className="px-3 py-3 whitespace-nowrap">Sheriff #</th>
                    <th className="px-3 py-3 whitespace-nowrap">Sale Date</th>
                    <th className="px-3 py-3">Address</th>
                    <th className="px-3 py-3 whitespace-nowrap">Type</th>
                    <th className="px-3 py-3 whitespace-nowrap">Upset Amt</th>
                    <th className="px-3 py-3 whitespace-nowrap">Market Value</th>
                    <th className="px-3 py-3 whitespace-nowrap">Spread</th>
                    <th className="px-3 py-3 whitespace-nowrap">Disc %</th>
                    <th className="px-3 py-3 whitespace-nowrap">Score</th>
                    <th className="px-3 py-3">Warnings</th>
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
                        <td className="px-3 py-2.5"><RatingBadge rating={item.dealRating} /></td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">{item.sheriffNumber}</td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap tabular-nums">{fmtDate(item.currentSaleDate)}</td>
                        <td className="px-3 py-2.5 max-w-[200px] truncate">{addr || "—"}</td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap">{TYPE_LABELS[item.foreclosureType ?? ""] ?? "—"}</td>
                        <td className="px-3 py-2.5 font-medium tabular-nums whitespace-nowrap">{fmt$(item.upsetAmount)}</td>
                        <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                          {item.estimatedMarketValue != null
                            ? fmt$(item.estimatedMarketValue)
                            : <span className="text-muted-foreground italic text-xs">Not valued yet</span>}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">{fmt$(item.estimatedSpread)}</td>
                        <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                          {item.discountPercent != null ? `${item.discountPercent.toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                          {item.dealScore != null ? item.dealScore : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-xs max-w-[140px]">
                          {item.warnings?.length > 0 ? (
                            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              {item.warnings.length} warning{item.warnings.length > 1 ? "s" : ""}
                            </span>
                          ) : "—"}
                        </td>
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

      <DetailSheet
        listing={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        onGetValue={handleGetValue}
        valuating={valuatingId === selected?.sheriffNumber}
      />
    </AdminLayout>
  );
}
