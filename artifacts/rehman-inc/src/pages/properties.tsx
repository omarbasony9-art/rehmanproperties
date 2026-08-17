import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { MultiStepForm } from "@/components/marketing/multi-step-form";
import { EditorialPageHero } from "@/components/layout/page-hero";
import { Button } from "@/components/ui/button";
import { Building, Home, Map, TreePine, MapPin, Tag } from "lucide-react";
import { useSEO } from "@/hooks/use-seo";
import { usePageContent } from "@/hooks/use-page-content";

type DbProperty = {
  id: number;
  title: string;
  displayAddress: string | null;
  propertyType: string | null;
  description: string | null;
  status: string;
  featured: boolean;
  sortOrder: number;
  imageKeys: string[];
};

export default function PropertiesPage() {
  const content = usePageContent("properties");
  useSEO(
    content.seoTitle || "Properties | Rehman INC",
    content.seoDescription || "View the types of properties we consider purchasing. We invest in single-family homes, multi-family units, and land in any condition.",
    { ogTitle: content.ogTitle || undefined, ogDescription: content.ogDescription || undefined, ogImage: content.ogImage || undefined }
  );

  const [formOpen, setFormOpen] = useState(false);

  const { data: dbProperties = [], isLoading } = useQuery<DbProperty[]>({
    queryKey: ["site-properties"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/site/properties");
        if (!res.ok) return [];
        return res.json();
      } catch {
        return [];
      }
    },
    staleTime: 0,
    gcTime: 5 * 60_000,
  });

  const hasProperties = dbProperties.length > 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar onOpenForm={() => setFormOpen(true)} />

      <EditorialPageHero
        eyebrow={content.heroEyebrow}
        title={content.heroHeadline}
        description={content.heroSubtext}
        bgImage={`${import.meta.env.BASE_URL}property-3.jpg`}
      />

      {/* PORTFOLIO SECTION */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 max-w-5xl">
          {isLoading ? (
            // Skeleton while loading
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-muted/30 border border-border rounded-xl overflow-hidden animate-pulse">
                  <div className="h-44 bg-muted/60" />
                  <div className="p-6 space-y-3">
                    <div className="h-5 bg-muted/60 rounded w-3/4" />
                    <div className="h-4 bg-muted/40 rounded w-1/2" />
                    <div className="h-4 bg-muted/40 rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : hasProperties ? (
            // ── D1-driven property cards ──────────────────────────────────────
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {dbProperties.map((prop) => (
                <div
                  key={prop.id}
                  className="bg-card border border-border rounded-xl overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Image placeholder / actual image */}
                  <div className="h-44 bg-muted/40 flex items-center justify-center overflow-hidden">
                    {prop.imageKeys && prop.imageKeys.length > 0 ? (
                      <img
                        src={`/api/photos/${prop.imageKeys[0]}`}
                        alt={prop.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <Building className="w-12 h-12 text-muted-foreground/40" />
                    )}
                  </div>

                  <div className="p-6 flex-1 flex flex-col gap-3">
                    {/* Type badge */}
                    {prop.propertyType && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-1 rounded-full w-fit">
                        <Tag className="w-3 h-3" />
                        {prop.propertyType}
                      </span>
                    )}

                    <h3 className="font-serif text-xl font-bold leading-snug">{prop.title}</h3>

                    {prop.displayAddress && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        {prop.displayAddress}
                      </p>
                    )}

                    {prop.description && (
                      <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3">
                        {prop.description}
                      </p>
                    )}

                    <div className="mt-auto pt-3">
                      <Button variant="outline" size="sm" onClick={() => setFormOpen(true)} className="w-full">
                        Inquire About This Property
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // ── Empty state ───────────────────────────────────────────────────
            <div className="text-center">
              <div className="bg-muted/30 border border-border rounded-xl p-12 md:p-20">
                <Building className="w-16 h-16 text-muted-foreground mx-auto mb-6 opacity-50" />
                <h2 className="font-serif text-3xl font-bold mb-4">Portfolio Update in Progress</h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
                  We are currently compiling our recent acquisitions and updating our digital portfolio. Our investments are updated periodically to reflect our latest activity across various markets. Please check back soon or contact our team to discuss specific markets and property types.
                </p>
                <Button size="lg" onClick={() => setFormOpen(true)} className="h-14 px-8 text-lg">
                  Submit Your Property
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* WHAT WE CONSIDER — always shown */}
      <section className="py-24 bg-muted/20 border-t border-border">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="font-serif text-3xl md:text-4xl font-bold mb-4">Properties We Consider</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Rehman INC evaluates a wide range of real estate assets. We are interested in properties regardless of their current physical condition or the situational challenges attached to them.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-background border border-border p-8 rounded-lg flex gap-6">
              <Home className="w-10 h-10 text-primary shrink-0" />
              <div>
                <h3 className="text-xl font-bold mb-2">Single-Family Homes</h3>
                <p className="text-muted-foreground">From starter homes to executive estates. We purchase single-family residences whether they are move-in ready, dated, or in need of total rehabilitation.</p>
              </div>
            </div>

            <div className="bg-background border border-border p-8 rounded-lg flex gap-6">
              <Building className="w-10 h-10 text-primary shrink-0" />
              <div>
                <h3 className="text-xl font-bold mb-2">Multi-Family Units</h3>
                <p className="text-muted-foreground">Duplexes, triplexes, and small apartment buildings. We evaluate multi-family properties fully vacant, partially rented, or fully occupied.</p>
              </div>
            </div>

            <div className="bg-background border border-border p-8 rounded-lg flex gap-6">
              <Map className="w-10 h-10 text-primary shrink-0" />
              <div>
                <h3 className="text-xl font-bold mb-2">Condos & Townhouses</h3>
                <p className="text-muted-foreground">Attached housing units of all sizes. We are experienced in navigating HOA requirements and association complexities.</p>
              </div>
            </div>

            <div className="bg-background border border-border p-8 rounded-lg flex gap-6">
              <TreePine className="w-10 h-10 text-primary shrink-0" />
              <div>
                <h3 className="text-xl font-bold mb-2">Land & Lots</h3>
                <p className="text-muted-foreground">Raw land, infill lots, and parcels suitable for development. We consider both residential and mixed-use zoned land.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-20 bg-primary">
        <div className="container mx-auto px-4 text-center">
          <h2 className="font-serif text-4xl font-bold text-primary-foreground mb-4">Have a Property to Discuss?</h2>
          <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto text-lg">No pressure, no obligation.</p>
          <Button
            size="lg"
            onClick={() => setFormOpen(true)}
            className="bg-background text-foreground hover:bg-background/90 h-14 px-10 text-lg"
          >
            Get My Cash Offer
          </Button>
        </div>
      </section>

      <Footer />

      <MultiStepForm open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
