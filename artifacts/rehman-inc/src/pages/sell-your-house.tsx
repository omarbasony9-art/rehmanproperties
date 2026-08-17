import { useState } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { MultiStepForm } from "@/components/marketing/multi-step-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Check } from "lucide-react";
import { useSEO } from "@/hooks/use-seo";

export default function SellYourHousePage() {
  useSEO(
    "Sell Your House | Rehman INC",
    "Request a straightforward cash offer for your property. No repairs, no agents, no showings."
  );
  
  const [formOpen, setFormOpen] = useState(false);
  const [address, setAddress] = useState("");

  const handleGetStarted = (e: React.FormEvent) => {
    e.preventDefault();
    setFormOpen(true);
  };

  const situations = [
    "Inherited Property",
    "Major Repairs Needed",
    "Relocation",
    "Downsizing",
    "Vacant Property",
    "Problem Tenants",
    "Foreclosure Concerns",
    "Divorce",
    "Fire or Water Damage",
    "Job Loss or Financial Hardship",
    "Estate Sale",
    "Ready to Downsize"
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar onOpenForm={() => setFormOpen(true)} />
      
      {/* HERO */}
      <section className="pt-32 pb-24 bg-foreground text-background">
        <div className="container mx-auto px-4 text-center">
          <h1 className="font-serif text-5xl md:text-7xl font-bold mb-6 max-w-4xl mx-auto leading-tight">
            Ready to Sell Your House?
          </h1>
          <p className="text-xl text-background/70 max-w-2xl mx-auto mb-12">
            Get a direct cash offer for your property in any condition. No repairs, no showings, no agents.
          </p>
          
          <div className="w-full max-w-2xl mx-auto bg-background/10 backdrop-blur-md p-2 rounded-lg border border-background/20">
            <form onSubmit={handleGetStarted} className="flex flex-col md:flex-row gap-2">
              <Input 
                placeholder="Enter your property address..." 
                className="h-14 md:h-16 text-lg bg-background/90 text-foreground border-transparent placeholder:text-muted-foreground focus-visible:ring-0"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
              <Button type="submit" className="h-14 md:h-16 px-8 text-lg font-bold w-full md:w-auto shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground">
                Start Inquiry <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </form>
          </div>
        </div>
      </section>

      {/* BENEFITS STRIP */}
      <section className="py-12 bg-muted/40 border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row flex-wrap justify-center gap-6 md:gap-12">
            {[
              "No Repairs Required — As-is purchases, whatever the condition.",
              "No Agent Fees — Keep more of the final offer.",
              "No Showings — Maintain your privacy.",
              "Flexible Closing — We work on your timeline."
            ].map((benefit, i) => (
              <div key={i} className="flex items-start gap-3 max-w-xs">
                <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span className="font-medium text-muted-foreground">{benefit}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SITUATIONS SECTION */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="mb-12">
            <h2 className="font-serif text-3xl md:text-4xl font-bold mb-4">Situations We Help With</h2>
            <p className="text-lg text-muted-foreground">Every property and homeowner situation is unique. We have experience working through a wide variety of circumstances.</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-x-12 gap-y-4">
            {situations.map((sit, i) => (
              <div key={i} className="py-4 border-b border-border text-lg text-foreground/80 font-medium">
                {sit}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROMINENT INQUIRY SECTION */}
      <section className="py-32 bg-foreground text-background border-t border-background/10">
        <div className="container mx-auto px-4 text-center max-w-3xl">
          <h2 className="font-serif text-4xl md:text-5xl font-bold mb-6">Start Your Inquiry</h2>
          <p className="text-xl text-background/70 mb-12">
            It takes just a few minutes to provide the details we need to begin our review.
          </p>
          
          <form onSubmit={handleGetStarted} className="flex flex-col sm:flex-row gap-4 justify-center">
            <Input 
              placeholder="Your property address..." 
              className="h-16 text-lg bg-background text-foreground border-0 max-w-md w-full focus-visible:ring-2 focus-visible:ring-primary"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <Button type="submit" className="h-16 px-10 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground">
              Continue
            </Button>
          </form>
        </div>
      </section>

      {/* WHAT TO EXPECT */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 max-w-5xl text-center">
          <h2 className="font-serif text-3xl md:text-4xl font-bold mb-16">What to Expect</h2>
          
          <div className="grid md:grid-cols-3 gap-12">
            <div>
              <div className="text-4xl font-serif text-primary/30 font-bold mb-4">1</div>
              <h3 className="text-xl font-bold mb-3">Brief Form</h3>
              <p className="text-muted-foreground">Tell us about the property's condition and features. No extensive details needed.</p>
            </div>
            <div>
              <div className="text-4xl font-serif text-primary/30 font-bold mb-4">2</div>
              <h3 className="text-xl font-bold mb-3">Property Review</h3>
              <p className="text-muted-foreground">Our team reviews the market data and your provided information promptly.</p>
            </div>
            <div>
              <div className="text-4xl font-serif text-primary/30 font-bold mb-4">3</div>
              <h3 className="text-xl font-bold mb-3">Direct Conversation</h3>
              <p className="text-muted-foreground">We reach out to discuss a potential offer and answer any questions.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-20 bg-primary">
        <div className="container mx-auto px-4 text-center">
          <h2 className="font-serif text-4xl font-bold text-primary-foreground mb-4">Ready To Talk?</h2>
          <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto">No pressure, no obligation.</p>
          <Button size="lg" onClick={() => setFormOpen(true)} className="bg-background text-foreground hover:bg-background/90 h-14 px-10 text-lg">
            Get My Cash Offer
          </Button>
        </div>
      </section>

      <Footer />
      
      <MultiStepForm 
        open={formOpen} 
        onOpenChange={setFormOpen} 
        initialAddress={address}
      />
    </div>
  );
}
