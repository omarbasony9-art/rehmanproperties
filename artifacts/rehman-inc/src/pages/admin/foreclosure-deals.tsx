import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/layout/admin-layout";
import { useSEO } from "@/hooks/use-seo";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  RefreshCw,
  MapPin,
  ExternalLink,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { adminFetch } from "@/lib/admin-api";
import { normalizeArray } from "@/lib/normalize-array";

const BASE = "/foreclosure-tracker/api";

// Matches the shape returned by formatDeal() in deals.ts
interface Deal {
  sheriffNumber: string;
  courtCaseNumber: string | null;
  currentSaleDate: string | null;
  plaintiffName: string | null;
  defendantName: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  upsetAmount: number | null;
  approxJudgment: number | null;
  marketValueUsed: number | null;
  marketValueSource: string | null;
  foreclosureType: string | null;
  dealRating: string;
  dealScore: number | null;
  estimatedSpread: number | null;
  discountPercent: number | null;
  equityMultiple: number | null;
  warnings: string[];
  occupancyStatus: string | null;
  detailUrl: string | null;
  googleMapsUrl: string | null;
  zillowUrl: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  yearBuilt: number | null;
  firstSeen: string | null;
  lastChanged: string | null;
  isNew: boolean;
}

interface DealsResponse {
  items: Deal[];
  count: number;
}

type Rating = "EXTREME" | "MAJOR" | "STRONG" | "NORMAL" | "all";

const RATING_CONFIG = {
  EXTREME: { bg: "bg-red-50 dark:bg-red-950/30",     border: "border-red-200 dark:border-red-800",   badge: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",   label: "Extreme Deal" },
  MAJOR:   { bg: "bg-orange-50 dark:bg-orange-950/30", border: "border-orange-200 dark:border-orange-800", badge: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300", label: "Major Deal" },
  STRONG:  { bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800", badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300", label: "Strong Deal" },
  NORMAL:  { bg: "bg-card",                          border: "border-border",                        badge: "bg-muted text-muted-foreground",                                       label: "Normal" },
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

function DealCard({ deal }: { deal: Deal }) {
  const cfg = RATING_CONFIG[deal.dealRating as keyof typeof RATING_CONFIG] ?? RATING_CONFIG.NORMAL;
  const addr = [deal.streetAddress, deal.city, deal.state].filter(Boolean).join(", ");

  return (
    <div className={`rounded-lg border p-5 ${cfg.bg} ${cfg.border} space-y-4`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${cfg.badge}`}>{cfg.label}</span>
            {deal.dealScore != null && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> {deal.dealScore}/100
              </span>
            )}
            {deal.isNew && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-primary text-primary-foreground">NEW</span>
            )}
          </div>
          <p className="text-sm font-semibold mt-1.5">{addr || deal.sheriffNumber}</p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{deal.sheriffNumber}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">Upset</p>
          <p className="text-base font-bold tabular-nums">{fmt$(deal.upsetAmount)}</p>
        </div>
      </div>

      {/* Financials */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md bg-background/60 border border-border/50 p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Market Value</p>
          <p className="text-sm font-semibold tabular-nums mt-0.5">{fmt$(deal.marketValueUsed)}</p>
        </div>
        <div className="rounded-md bg-background/60 border border-border/50 p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Spread</p>
          <p className="text-sm font-semibold tabular-nums mt-0.5">{fmt$(deal.estimatedSpread)}</p>
        </div>
        <div className="rounded-md bg-background/60 border border-border/50 p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Discount</p>
          <p className="text-sm font-semibold mt-0.5">
            {deal.discountPercent != null ? `${deal.discountPercent.toFixed(1)}%` : "—"}
          </p>
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{TYPE_LABELS[deal.foreclosureType ?? ""] ?? "—"}</span>
        <span>Sale: {fmtDate(deal.currentSaleDate)}</span>
        {deal.occupancyStatus && <span>{deal.occupancyStatus}</span>}
      </div>

      {/* Warnings */}
      {deal.warnings.length > 0 && (
        <div className="space-y-1">
          {deal.warnings.map((w) => (
            <div key={w} className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {w.replace(/_/g, " ")}
            </div>
          ))}
        </div>
      )}

      {/* Links */}
      <div className="flex gap-3 pt-1">
        {deal.googleMapsUrl && (
          <a href={deal.googleMapsUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline">
            <MapPin className="w-3.5 h-3.5" /> Maps
          </a>
        )}
        {deal.zillowUrl && (
          <a href={deal.zillowUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="w-3.5 h-3.5" /> Zillow
          </a>
        )}
      </div>
    </div>
  );
}

const TABS: { value: Rating; label: string }[] = [
  { value: "all",     label: "All" },
  { value: "EXTREME", label: "Extreme" },
  { value: "MAJOR",   label: "Major" },
  { value: "STRONG",  label: "Strong" },
  { value: "NORMAL",  label: "Normal" },
];

export default function AdminForeclosureDeals() {
  useSEO("Foreclosure Deals | Rehman INC Admin", "Admin Portal");
  const { toast } = useToast();
  const [rating, setRating] = useState<Rating>("all");
  const [refreshing, setRefreshing] = useState(false);

  const params = new URLSearchParams();
  if (rating !== "all") params.set("rating", rating);

  const dealsQ = useQuery<DealsResponse>({
    queryKey: ["fc-deals", rating],
    queryFn: () => fetch(`${BASE}/deals?${params}`).then((r) => r.json()),
    refetchInterval: 120_000,
  });

  const newDealsQ = useQuery<DealsResponse>({
    queryKey: ["fc-deals-new"],
    queryFn: () => fetch(`${BASE}/deals/new`).then((r) => r.json()),
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await adminFetch("/api/admin/foreclosure-refresh", { method: "POST" });
      toast({ title: "Refresh started", description: "CivilView scrape is running in the background. New deals will appear in a few minutes." });
      setTimeout(() => { dealsQ.refetch(); newDealsQ.refetch(); }, 30_000);
    } catch (err: unknown) {
      toast({ title: "Refresh failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  };

  // Normalize: API returns { items: Deal[], count: number }.
  // normalizeArray handles bare arrays, keyed wrappers, errors, and undefined.
  const deals    = normalizeArray<Deal>(dealsQ.data,    ["items", "deals", "results"]);
  const newDeals = normalizeArray<Deal>(newDealsQ.data, ["items", "deals", "results"]);

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-serif font-bold">Watch List</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Foreclosure properties ranked by deal score
              {newDeals.length > 0 && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary text-primary-foreground">
                  {newDeals.length} new in 48h
                </span>
              )}
            </p>
          </div>
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline" size="sm">
            {refreshing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Refresh CivilView
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 flex-wrap border-b">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setRating(t.value)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                rating === t.value
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {dealsQ.isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : dealsQ.isError ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <p className="text-sm font-medium text-destructive">Unable to load deals.</p>
            <p className="text-xs">Check that the Foreclosure Tracker service is running.</p>
          </div>
        ) : deals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <p className="text-sm">No deals found.</p>
            <p className="text-xs">
              {rating !== "all"
                ? "Try a lower rating tier, or click Refresh CivilView to pull fresh data."
                : "Click Refresh CivilView to import data. Deal scoring requires a RentCast API key for market values."}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{deals.length} deal{deals.length !== 1 ? "s" : ""}</p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {deals.map((deal) => (
                <DealCard key={deal.sheriffNumber} deal={deal} />
              ))}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
