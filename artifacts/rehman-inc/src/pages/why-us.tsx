import { useState } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { MultiStepForm } from "@/components/marketing/multi-step-form";
import { SplitPageHero } from "@/components/layout/page-hero";
import { Button } from "@/components/ui/button";
import { ArrowRight, X, Check } from "lucide-react";
import { useSEO } from "@/hooks/use-seo";

export default function WhyUsPage() {
  useSEO(
    "Why Rehman INC | Direct Property Buyers",
    "Discover why property owners choose Rehman INC for a straightforward, direct property sale without the usual hassles."
  );
  
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar onOpenForm={() => setFormOpen(true)} />
      
      <SplitPageHero
        eyebrow="Why Rehman INC"
        title="Real Estate. Direct Conversations. Clear Decisions."
        description="We provide property owners with an alternative to the traditional listing process."
        ctaLabel="Tell Us About Your Property"
        onCtaClick={() => setFormOpen(true)}
        image={`${import.meta.env.BASE_URL}property-2.jpg`}
        imageAlt="Investment property"
        imageLeft
      />

      {/* COMPARISON LAYOUT */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4">A Clear Comparison</h2>
            <p className="text-lg text-muted-foreground">Understanding the differences between a traditional market sale and a direct sale to Rehman INC.</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 md:gap-12">
            {/* Traditional Sale */}
            <div className="bg-muted/30 border border-border p-8 md:p-10 rounded-lg">
              <h3 className="text-2xl font-serif font-bold mb-8 flex items-center gap-3 text-muted-foreground">
                <X className="w-6 h-6" /> Traditional Home Sale
              </h3>
              <ul className="space-y-6">
                {[
                  "Repairs Required: You must fix issues before listing.",
                  "Agent Commissions: A percentage of your sale goes to fees.",
                  "Open Houses: Strangers constantly walking through your home.",
                  "Financing Uncertainty: Buyers' loans can fall through last minute.",
                  "Unpredictable Timeline: Your house could sit on the market for months.",
                  "Multiple Negotiations: Haggling over price, repairs, and closing costs.",
                  "Closing Cost Surprises: Hidden fees at the signing table."
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-4 text-foreground/70 text-lg">
                    <div className="mt-1.5 shrink-0 w-2 h-2 rounded-full bg-muted-foreground"></div>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            
            {/* Rehman INC */}
            <div className="bg-primary/5 border border-primary/30 p-8 md:p-10 rounded-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full -translate-y-16 translate-x-16"></div>
              <h3 className="text-2xl font-serif font-bold mb-8 flex items-center gap-3 text-primary">
                <Check className="w-6 h-6" /> Selling to Rehman INC
              </h3>
              <ul className="space-y-6">
                {[
                  "As-Is Purchase: We buy it exactly as it stands.",
                  "No Agent Fees: What we offer is what you get.",
                  "No Showings: Complete privacy, no open houses.",
                  "Cash Purchase: No relying on bank financing.",
                  "Flexible Timeline: We close on the date you choose.",
                  "One Direct Conversation: A straightforward, single negotiation.",
                  "Clear Process: No surprises, just a simple transaction."
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-4 text-foreground/90 text-lg font-medium">
                    <Check className="mt-1 shrink-0 w-5 h-5 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* WHO WE WORK WITH */}
      <section className="py-24 bg-muted/40 border-y border-border">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="font-serif text-3xl md:text-4xl font-bold mb-8">Who We Work With</h2>
          <div className="prose prose-lg prose-p:text-muted-foreground max-w-none">
            <p>
              Rehman INC works directly with property owners who prioritize simplicity, speed, and certainty over the traditional listing process. Our clients come from all walks of life and find themselves in various situations.
            </p>
            <p>
              Whether you're dealing with an inherited property, facing major repair costs you can't afford, managing a difficult rental situation, relocating for work, or simply wanting to downsize without the hassle of staging and showings—we provide a viable alternative. We purchase single-family homes, multi-family properties, townhouses, and condos in nearly any condition.
            </p>
          </div>
        </div>
      </section>

      {/* HOW WE DETERMINE AN OFFER */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="font-serif text-3xl md:text-4xl font-bold mb-8">How We Determine Our Offer</h2>
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                Our approach to evaluating a property is completely transparent. We look at four primary factors to arrive at a fair, sensible cash offer:
              </p>
              <ul className="space-y-4">
                <li className="flex flex-col">
                  <span className="font-bold text-foreground">1. Location & Market</span>
                  <span className="text-muted-foreground">Current trends, comparable recent sales, and neighborhood data.</span>
                </li>
                <li className="flex flex-col">
                  <span className="font-bold text-foreground">2. Current Condition</span>
                  <span className="text-muted-foreground">The age and state of the property's major systems.</span>
                </li>
                <li className="flex flex-col">
                  <span className="font-bold text-foreground">3. Required Repairs</span>
                  <span className="text-muted-foreground">The estimated cost of renovations needed to update the property.</span>
                </li>
                <li className="flex flex-col">
                  <span className="font-bold text-foreground">4. Post-Repair Value</span>
                  <span className="text-muted-foreground">What the property will likely be worth once fully renovated.</span>
                </li>
              </ul>
            </div>
            <div className="bg-muted p-8 rounded-lg border border-border">
              <h3 className="font-serif text-xl font-bold mb-4">The Result</h3>
              <p className="text-muted-foreground mb-6">
                By factoring in these elements, we calculate an offer that makes sense for our investment criteria while providing you with a fast, reliable exit from the property without the costs of holding and repairing it yourself.
              </p>
              <Button onClick={() => setFormOpen(true)} className="w-full">
                Request an Evaluation
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-20 bg-primary">
        <div className="container mx-auto px-4 text-center">
          <h2 className="font-serif text-4xl font-bold text-primary-foreground mb-4">Ready To Talk?</h2>
          <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto text-lg">No pressure, no obligation.</p>
          <Button size="lg" onClick={() => setFormOpen(true)} className="bg-background text-foreground hover:bg-background/90 h-14 px-10 text-lg">
            Get My Cash Offer <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </section>

      <Footer />
      
      <MultiStepForm open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
