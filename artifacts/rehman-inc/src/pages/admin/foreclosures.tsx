import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/layout/admin-layout";
import { useSEO } from "@/hooks/use-seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2, RefreshCw, MapPin, ExternalLink as ExternalLinkIcon, AlertTriangle,
  ChevronLeft, ChevronRight, Sparkles, RotateCcw,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { normalizeArray } from "@/lib/normalize-array";

const BASE = "/api/foreclosures";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Listing {
  sheriffNumber: string;
  county: string;
  courtCaseNumber: string | null;
  currentSaleDate: string | null;
  originalSaleDate: string | null;
  plaintiff: string | null;
  defendant: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  upsetAmount: number | null;
  approxJudgment: number | null;
  occupancyStatus: string | null;
  foreclosureType: string | null;
  priorsLiensTaxes: string | null;
  // Links
  googleMapsUrl: string | null;
  zillowUrl: string | null;
  redfinPropertyUrl: string | null;
  zillowPropertyUrl: string | null;
  detailUrl: string | null;
  // Valuation — Zillow
  zillowEstimate: number | null;
  zillowStatus: string;
  // Valuation — Redfin
  redfinEstimate: number | null;
  redfinStatus: string;
  // Market value
  estimatedMarketValue: number | null;
  marketValueSource: string;
  // Deal
  estimatedSpread: number | null;
  discountPercent: number | null;
  equityMultiple: number | null;
  dealRating: string;
  dealScore: number | null;
  dealWarnings: string[];
  // Timestamps
  firstSeen: string | null;
  lastUpdated: string | null;
  isNew: boolean;
}

interface ListResponse {
  total: number;
  rows: Listing[];
}

interface Stats {
  atlantic: number;
  capeMay: number;
  extreme: number;
  major: number;
  strong: number;
  under280: number;
  lastUpdated: string | null;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type TabId = "all" | "under280k" | "extreme" | "major" | "strong";

const TABS: { id: TabId; label: string; params: Record<string, string> }[] = [
  { id: "all",       label: "All Listings",  params: {} },
  { id: "under280k", label: "Under $280K",   params: { upsetMax: "280000" } },
  { id: "extreme",   label: "Extreme Deals", params: { deal: "EXTREME" } },
  { id: "major",     label: "Major Deals",   params: { deal: "MAJOR" } },
  { id: "strong",    label: "Strong Deals",  params: { deal: "STRONG" } },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RATING_COLORS: Record<string, string> = {
  EXTREME: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400",
  MAJOR:   "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400",
  STRONG:  "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400",
  NORMAL:  "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300",
  UNKNOWN: "bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-800 dark:text-slate-400",
};

const TYPE_LABELS: Record<string, string> = {
  tax_foreclosure:      "Tax",
  lien_foreclosure:     "Lien",
  mortgage_foreclosure: "Mortgage",
  unknown:              "—",
};

const SOURCE_LABELS: Record<string, string> = {
  CONSERVATIVE_ZILLOW_REDFIN: "Conservative (Zillow & Redfin)",
  ZILLOW: "Zillow",
  REDFIN: "Redfin",
  NONE:   "—",
};

function fmt$(n: number | null | undefined) {
  if (n == null) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s + (s.includes("T") ? "" : "T12:00:00")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(s: string | null | undefined) {
  if (!s) return "Never";
  return new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function RatingBadge({ rating }: { rating: string }) {
  const r = rating ?? "UNKNOWN";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${RATING_COLORS[r] ?? RATING_COLORS["UNKNOWN"]}`}>
      {r}
    </span>
  );
}

function ValCell({ value, label }: { value: number | null; label?: string }) {
  if (value == null) return <span className="text-muted-foreground/60 italic text-xs">—</span>;
  return <span>{label}{fmt$(value)}</span>;
}

// ─── Redfin Modal ─────────────────────────────────────────────────────────────

function RedfinModal({
  listing,
  open,
  onClose,
  onSaved,
}: {
  listing: Listing | null;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: Listing) => void;
}) {
  const { toast } = useToast();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  if (!listing) return null;

  const handleSave = async () => {
    const n = parseFloat(value.replace(/[$,]/g, ""));
    if (isNaN(n) || n <= 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const resp = await fetch(`${BASE}/listings/${listing.sheriffNumber}/redfin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ estimate: n }),
      });
      if (!resp.ok) {
        const err = await resp.json() as { error?: string };
        toast({ title: "Error", description: err.error ?? "Failed to save", variant: "destructive" });
        return;
      }
      toast({ title: "Redfin estimate saved", description: `$${n.toLocaleString()}` });
      const data = await resp.json() as { listing?: Listing };
      const refreshed = data.listing ?? (await fetch(`${BASE}/listings/${listing.sheriffNumber}`, { credentials: "include" }).then((r) => r.json()) as Listing);
      onSaved(refreshed);
      onClose();
    } catch (err) {
      toast({ title: "Network error", description: err instanceof Error ? err.message : "Unknown", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enter Redfin Estimate</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Enter the Redfin estimate for <span className="font-mono font-semibold">{listing.sheriffNumber}</span>.
          {listing.redfinPropertyUrl && (
            <> <a href={listing.redfinPropertyUrl} target="_blank" rel="noreferrer" className="text-primary underline">Open Redfin search</a> to look it up.</>
          )}
        </p>
        <Input
          placeholder="e.g. 325000"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save Estimate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail Sheet ─────────────────────────────────────────────────────────────

function DetailSheet({
  listing,
  open,
  onClose,
  onZillowRefresh,
  onRedfinEntry,
  onRecalculate,
  zillowLoading,
  recalcLoading,
}: {
  listing: Listing | null;
  open: boolean;
  onClose: () => void;
  onZillowRefresh: (l: Listing) => void;
  onRedfinEntry: (l: Listing) => void;
  onRecalculate: (l: Listing) => void;
  zillowLoading: boolean;
  recalcLoading: boolean;
}) {
  if (!listing) return null;
  const addr = [listing.address, listing.city, listing.state, listing.zipCode].filter(Boolean).join(", ");
  const warnings = listing.dealWarnings ?? [];

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-mono text-sm">{listing.sheriffNumber}</SheetTitle>
          {addr && <p className="text-sm text-muted-foreground">{addr}</p>}
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Rating + Score */}
          <div className="flex items-center gap-3 flex-wrap">
            <RatingBadge rating={listing.dealRating} />
            {listing.dealScore != null
              ? <span className="text-sm font-semibold">{listing.dealScore} / 100</span>
              : <span className="text-sm text-muted-foreground">No score yet</span>}
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 space-y-1">
              {warnings.map((w) => (
                <div key={w} className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {w.replace(/_/g, " ")}
                </div>
              ))}
            </div>
          )}

          {/* Valuation section */}
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="text-sm font-semibold">Valuation</h3>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Zillow Zestimate</p>
                <p className={`font-medium mt-0.5 ${listing.zillowEstimate == null ? "text-muted-foreground italic" : ""}`}>
                  {listing.zillowEstimate != null ? fmt$(listing.zillowEstimate) : listing.zillowStatus}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Redfin Estimate</p>
                <p className={`font-medium mt-0.5 ${listing.redfinEstimate == null ? "text-muted-foreground italic" : ""}`}>
                  {listing.redfinEstimate != null ? fmt$(listing.redfinEstimate) : listing.redfinStatus}
                </p>
              </div>
              <div className="col-span-2 bg-muted/50 rounded-md p-2">
                <p className="text-xs text-muted-foreground">Market Value Used</p>
                <p className="font-semibold text-base mt-0.5">
                  {listing.estimatedMarketValue != null ? fmt$(listing.estimatedMarketValue) : <span className="text-muted-foreground italic">Not valued yet</span>}
                </p>
                {listing.marketValueSource !== "NONE" && (
                  <p className="text-xs text-muted-foreground mt-0.5">{SOURCE_LABELS[listing.marketValueSource] ?? listing.marketValueSource}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Upset Amount</p>
                <p className="font-medium mt-0.5">{fmt$(listing.upsetAmount) ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Potential Spread</p>
                <p className={`font-medium mt-0.5 ${listing.estimatedSpread != null && listing.estimatedSpread > 0 ? "text-green-600 dark:text-green-400" : ""}`}>
                  {listing.estimatedSpread != null ? `+${fmt$(listing.estimatedSpread)}` : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Discount</p>
                <p className="font-medium mt-0.5">
                  {listing.discountPercent != null ? `${listing.discountPercent.toFixed(1)}%` : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Equity Multiple</p>
                <p className="font-medium mt-0.5">
                  {listing.equityMultiple != null ? `${listing.equityMultiple.toFixed(2)}x` : "—"}
                </p>
              </div>
            </div>

            {/* Valuation action buttons */}
            <div className="flex gap-2 flex-wrap pt-1">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onZillowRefresh(listing)} disabled={zillowLoading}>
                {zillowLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Refresh Zillow
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onRedfinEntry(listing)}>
                {listing.redfinEstimate ? "Update Redfin" : "Enter Redfin"}
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => onRecalculate(listing)} disabled={recalcLoading}>
                {recalcLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Recalculate
              </Button>
            </div>
          </div>

          {/* Property details */}
          <div className="space-y-2 text-sm">
            {[
              ["Type",       TYPE_LABELS[listing.foreclosureType ?? ""] ?? listing.foreclosureType ?? "—"],
              ["Plaintiff",  listing.plaintiff],
              ["Defendant",  listing.defendant],
              ["Sale Date",  fmtDate(listing.currentSaleDate)],
              ["Court Case", listing.courtCaseNumber],
              ["Occupancy",  listing.occupancyStatus],
              ["First Seen", fmtDateTime(listing.firstSeen)],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">{label}</span>
                <span className="text-right truncate">{val ?? "—"}</span>
              </div>
            ))}
            {listing.priorsLiensTaxes && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Priors/Liens</span>
                <span className="text-right text-xs line-clamp-3 max-w-[260px]">{listing.priorsLiensTaxes}</span>
              </div>
            )}
          </div>

          {/* External links */}
          <div className="flex gap-4 flex-wrap">
            {listing.googleMapsUrl && <PropLink label="Maps" href={listing.googleMapsUrl} icon={<MapPin className="w-3.5 h-3.5" />} />}
            {(listing.zillowPropertyUrl ?? listing.zillowUrl) && <PropLink label="Zillow" href={listing.zillowPropertyUrl ?? listing.zillowUrl!} icon={<ExternalLinkIcon className="w-3.5 h-3.5" />} />}
            {listing.redfinPropertyUrl && <PropLink label="Redfin" href={listing.redfinPropertyUrl} icon={<ExternalLinkIcon className="w-3.5 h-3.5" />} />}
            {listing.detailUrl && <PropLink label="CivilView" href={listing.detailUrl} icon={<ExternalLinkIcon className="w-3.5 h-3.5" />} />}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PropLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
      {icon} {label}
    </a>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const LIMIT = 50;

export default function AdminForeclosures() {
  useSEO("Foreclosures | Rehman INC Admin", "Admin Portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab]     = useState<TabId>("all");
  const [page, setPage]   = useState(1);
  const [county, setCounty] = useState<string>("all");
  const [sortBy,  setSortBy]  = useState<string>("upset");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Listing | null>(null);
  const [redfinTarget, setRedfinTarget] = useState<Listing | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [zillowLoadingId, setZillowLoadingId]   = useState<string | null>(null);
  const [recalcLoadingId, setRecalcLoadingId]   = useState<string | null>(null);

  const statsQ = useQuery<Stats>({
    queryKey: ["fc-stats"],
    queryFn: () => fetch(`${BASE}/stats`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0]!;
  const params = new URLSearchParams({
    limit: String(LIMIT),
    sort: sortBy, order: sortDir,
    offset: String((page - 1) * LIMIT),
    ...activeTab.params,
    ...(county !== "all" ? { county } : {}),
  });

  const listQ = useQuery<ListResponse>({
    queryKey: ["fc-listings", tab, page, sortBy, sortDir, county],
    queryFn: () => fetch(`${BASE}/listings?${params}`, { credentials: "include" }).then((r) => r.json()),
  });

  const listings   = normalizeArray<Listing>(listQ.data, ["rows"]);
  const totalPages = Math.ceil((listQ.data?.total ?? 0) / LIMIT);
  const stats      = statsQ.data;
  // Map stats to a health-like shape for the stat cards
  const health = stats ? {
    status: "ok",
    lastRefresh: stats.lastUpdated,
    listingCount: (stats.atlantic ?? 0) + (stats.capeMay ?? 0),
    majorDeals: (stats.extreme ?? 0) + (stats.major ?? 0) + (stats.strong ?? 0),
  } : undefined;

  const handleTabChange = (id: TabId) => { setTab(id); setPage(1); };
  const handleCountyChange = (c: string) => { setCounty(c); setPage(1); };

  const handleSort = (col: string) => {
    if (col === sortBy) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
    setPage(1);
  };

  function SortTh({ col, label, className }: { col: string; label: string; className?: string }) {
    const active = sortBy === col;
    const Icon = active ? (sortDir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
    return (
      <th
        className={`px-3 py-3 text-left whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors ${active ? "text-foreground" : ""} ${className ?? ""}`}
        onClick={() => handleSort(col)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <Icon className={`w-3 h-3 ${active ? "opacity-100" : "opacity-40"}`} />
        </span>
      </th>
    );
  }

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Fire both county syncs; await both so the button stays disabled until done
      await Promise.allSettled([
        fetch(`${BASE}/sync/atlantic`, { method: "POST", credentials: "include" }),
        fetch(`${BASE}/sync/cape-may`, { method: "POST", credentials: "include" }),
      ]);
      toast({ title: "Sync complete", description: "CivilView data refreshed." });
      statsQ.refetch();
      listQ.refetch();
    } catch (err) {
      toast({ title: "Refresh failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  };

  const refreshListing = async (sheriffNumber: string): Promise<Listing | null> => {
    try {
      return await fetch(`${BASE}/listings/${sheriffNumber}`, { credentials: "include" }).then((r) => r.json()) as Listing;
    } catch { return null; }
  };

  const handleZillowRefresh = async (listing: Listing) => {
    setZillowLoadingId(listing.sheriffNumber);
    try {
      const resp = await fetch(`${BASE}/listings/${listing.sheriffNumber}/valuate`, { method: "POST", credentials: "include" });
      const data = await resp.json() as { outcome?: string; listing?: Listing; error?: string };
      if (!resp.ok) {
        toast({ title: "Valuation error", description: data.error ?? "Unknown error", variant: "destructive" });
        return;
      }
      toast({ title: "Valuation complete", description: `Status: ${data.outcome ?? "done"}` });
      await queryClient.invalidateQueries({ queryKey: ["fc-listings"] });
      if (data.listing) setSelected(data.listing);
      else { const updated = await refreshListing(listing.sheriffNumber); if (updated) setSelected(updated); }
    } catch (err) {
      toast({ title: "Valuation error", description: err instanceof Error ? err.message : "Unknown", variant: "destructive" });
    } finally {
      setZillowLoadingId(null);
    }
  };

  const handleRecalculate = async (listing: Listing) => {
    setRecalcLoadingId(listing.sheriffNumber);
    try {
      const resp = await fetch(`${BASE}/listings/${listing.sheriffNumber}/recalculate`, { method: "POST", credentials: "include" });
      const data = await resp.json() as { listing?: Listing; error?: string };
      if (!resp.ok) {
        toast({ title: "Recalculate failed", description: data.error, variant: "destructive" }); return;
      }
      toast({ title: "Deal recalculated" });
      await queryClient.invalidateQueries({ queryKey: ["fc-listings"] });
      if (data.listing) setSelected(data.listing);
      else { const updated = await refreshListing(listing.sheriffNumber); if (updated) setSelected(updated); }
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown", variant: "destructive" });
    } finally {
      setRecalcLoadingId(null);
    }
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
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

        {/* Stats */}
        {health && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ["Total Listings", String(health.listingCount ?? "—")],
              ["Watch List",     String(health.majorDeals ?? "—")],
              ["Last Refresh",   fmtDateTime(health.lastRefresh)],
              ["Status",         health.status === "ok" ? "Online" : "Degraded"],
            ].map(([label, val]) => (
              <div key={label} className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold mt-0.5 truncate">{val}</p>
              </div>
            ))}
          </div>
        )}

        {/* Setup callout — only shown when no properties have been valued */}
        {health && health.listingCount > 0 && health.majorDeals === 0 &&
          listings.every((l) => l.dealRating === "UNKNOWN") && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 flex gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-800 dark:text-amber-300">Valuation not configured</p>
              <p className="text-amber-700 dark:text-amber-400 mt-0.5">
                All {health.listingCount} listings show "Not valued" because no Zillow API key is set.
                Add <code className="bg-amber-100 dark:bg-amber-800/50 px-1 rounded font-mono text-xs">ZILLOW_RAPIDAPI_KEY</code> to
                your Replit secrets, then click a property → <strong>Refresh Zillow</strong> to value it, or use the bulk refresh endpoint.
                You can also enter Redfin estimates manually on any property.
              </p>
            </div>
          </div>
        )}

        {/* County filter — sits above the tab bar */}
        <div className="flex items-center gap-2">
          <label htmlFor="county-select" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            County
          </label>
          <select
            id="county-select"
            value={county}
            onChange={(e) => handleCountyChange(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2.5 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All Counties</option>
            <option value="Atlantic">Atlantic County</option>
            <option value="Cape May">Cape May County</option>
          </select>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 border-b">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => handleTabChange(t.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors rounded-t-md -mb-px border-b-2 ${
                tab === t.id
                  ? "border-primary text-primary bg-background"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-card overflow-hidden">
          {listQ.isLoading ? (
            <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : listQ.isError ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <p className="text-sm text-destructive">Unable to load foreclosure listings.</p>
              <p className="text-xs text-muted-foreground">
                {listQ.error instanceof Error ? listQ.error.message : "Network error — check the browser console for details."}
              </p>
            </div>
          ) : listings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <p className="text-sm">No listings found.</p>
              {tab === "all" && <p className="text-xs">Click "Refresh CivilView" to import data.</p>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <th className="px-3 py-3 text-left whitespace-nowrap">Deal</th>
                    <SortTh col="score"    label="Score" />
                    <SortTh col="sheriff"  label="Sheriff #" />
                    <SortTh col="date"     label="Sale Date" />
                    <th className="px-3 py-3 text-left whitespace-nowrap">Address</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">County</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Type</th>
                    <SortTh col="upset"    label="Upset" />
                    <th className="px-3 py-3 text-left whitespace-nowrap">Zillow</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Redfin</th>
                    <SortTh col="market"   label="Market Value" />
                    <SortTh col="spread"   label="Spread" />
                    <SortTh col="discount" label="Disc %" />
                    <th className="px-3 py-3 text-left whitespace-nowrap">Warnings</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {listings.map((item) => {
                    const addr = [item.address, item.city].filter(Boolean).join(", ");
                    const w = item.dealWarnings ?? [];
                    return (
                      <tr key={item.sheriffNumber} onClick={() => setSelected(item)}
                        className="hover:bg-muted/40 cursor-pointer transition-colors">
                        <td className="px-3 py-2.5"><RatingBadge rating={item.dealRating} /></td>
                        <td className="px-3 py-2.5 tabular-nums font-semibold">
                          {item.dealScore != null ? item.dealScore : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">{item.sheriffNumber}</td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap tabular-nums">{fmtDate(item.currentSaleDate)}</td>
                        <td className="px-3 py-2.5 max-w-[180px] truncate">{addr || "—"}</td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">{item.county ?? "Atlantic"}</td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap">{TYPE_LABELS[item.foreclosureType ?? ""] ?? "—"}</td>
                        <td className="px-3 py-2.5 tabular-nums whitespace-nowrap font-medium">{fmt$(item.upsetAmount) ?? "—"}</td>
                        <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                          <ValCell value={item.zillowEstimate} />
                        </td>
                        <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                          <ValCell value={item.redfinEstimate} />
                        </td>
                        {/* Market value — visually distinct */}
                        <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                          {item.estimatedMarketValue != null
                            ? <span className="font-semibold text-foreground">{fmt$(item.estimatedMarketValue)}</span>
                            : <span className="text-muted-foreground/60 italic text-xs">Not valued</span>}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                          {item.estimatedSpread != null
                            ? <span className={item.estimatedSpread > 0 ? "text-green-600 dark:text-green-400 font-medium" : "text-red-500"}>
                                {item.estimatedSpread > 0 ? "+" : ""}{fmt$(item.estimatedSpread)}
                              </span>
                            : <span className="text-muted-foreground/60 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                          {item.discountPercent != null
                            ? `${item.discountPercent.toFixed(1)}%`
                            : <span className="text-muted-foreground/60 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {w.length > 0
                            ? <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                {w.length}
                              </span>
                            : "—"}
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
            <span className="text-muted-foreground">Page {page} of {totalPages} · {listQ.data?.total ?? 0} listings</span>
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
        onZillowRefresh={handleZillowRefresh}
        onRedfinEntry={(l) => { setRedfinTarget(l); }}
        onRecalculate={handleRecalculate}
        zillowLoading={zillowLoadingId === selected?.sheriffNumber}
        recalcLoading={recalcLoadingId === selected?.sheriffNumber}
      />

      <RedfinModal
        listing={redfinTarget}
        open={!!redfinTarget}
        onClose={() => setRedfinTarget(null)}
        onSaved={(updated) => {
          setRedfinTarget(null);
          setSelected(updated);
          queryClient.invalidateQueries({ queryKey: ["fc-listings"] });
        }}
      />
    </AdminLayout>
  );
}
