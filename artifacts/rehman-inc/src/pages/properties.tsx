import { useState } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { MultiStepForm } from "@/components/marketing/multi-step-form";
import { EditorialPageHero } from "@/components/layout/page-hero";
import { Button } from "@/components/ui/button";
import { Building, Home, Map, TreePine } from "lucide-react";
import { useSEO } from "@/hooks/use-seo";

export default function PropertiesPage() {
  useSEO(
    "Properties | Rehman INC",
    "View the types of properties we consider purchasing. We invest in single-family homes, multi-family units, and land in any condition."
  );
  
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar onOpenForm={() => setFormOpen(true)} />
      
      <EditorialPageHero
        eyebrow="Our Portfolio"
        title="Real Estate We Acquire and Manage."
        description="Explore the types of properties that fit the Rehman INC investment strategy."
        bgImage={`${import.meta.env.BASE_URL}property-3.jpg`}
      />

      {/* EMPTY STATE */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 max-w-4xl text-center">
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
      </section>

      {/* WHAT WE CONSIDER */}
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
          <Button size="lg" onClick={() => setFormOpen(true)} className="bg-background text-foreground hover:bg-background/90 h-14 px-10 text-lg">
            Get My Cash Offer
          </Button>
        </div>
      </section>

      <Footer />
      
      <MultiStepForm open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
