import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { MultiStepForm } from "@/components/marketing/multi-step-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, CheckCircle, Home, Calendar, ThumbsUp, Shield, Wrench } from "lucide-react";
import { useSEO } from "@/hooks/use-seo";

export default function HomePage() {
  useSEO(
    "Sell Your House for Cash | Rehman INC",
    "Skip the repairs and stress. Rehman INC buys houses directly from homeowners for cash in any condition. Get a straightforward, no-obligation cash offer today."
  );
  const [formOpen, setFormOpen] = useState(false);
  const [address, setAddress] = useState("");

  const handleGetStarted = (e: React.FormEvent) => {
    e.preventDefault();
    setFormOpen(true);
  };

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const source = searchParams.get('utm_source');
    const medium = searchParams.get('utm_medium');
    const campaign = searchParams.get('utm_campaign');
    
    if (source) sessionStorage.setItem('utm_source', source);
    if (medium) sessionStorage.setItem('utm_medium', medium);
    if (campaign) sessionStorage.setItem('utm_campaign', campaign);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20">
      <Navbar onOpenForm={() => setFormOpen(true)} />
      
      {/* HERO SECTION */}
      <section className="relative min-h-[90vh] flex items-center justify-center pt-20">
        <div className="absolute inset-0 z-0">
          <img 
            src={`${import.meta.env.BASE_URL}hero-home.jpg`}
            alt="Residential property" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-foreground/80 md:bg-foreground/60 bg-gradient-to-t from-background via-foreground/70 to-foreground/30"></div>
        </div>
        
        <div className="container mx-auto px-4 relative z-10 text-center flex flex-col items-center">
          <span className="inline-block py-1 px-3 rounded-full bg-primary/20 border border-primary/30 text-primary-foreground text-sm font-semibold tracking-wider uppercase mb-6 backdrop-blur-md">
            Direct Real Estate Investments
          </span>
          <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight text-white mb-6 leading-[1.1] max-w-4xl">
            Sell Your House for Cash.
          </h1>
          <h2 className="text-xl md:text-3xl font-medium text-white/90 mb-6 max-w-2xl">
            Skip the Repairs. Skip the Stress.
          </h2>
          <p className="text-lg md:text-xl text-white/80 mb-10 max-w-2xl leading-relaxed">
            Sell your property as-is and see if Rehman INC can provide a straightforward, no-obligation offer.
          </p>
          
          <div className="w-full max-w-xl bg-background/10 backdrop-blur-xl p-2 md:p-3 rounded-lg border border-white/20 shadow-2xl">
            <form onSubmit={handleGetStarted} className="flex flex-col md:flex-row gap-2">
              <Input 
                placeholder="Enter your property address..." 
                className="h-14 md:h-16 text-lg bg-background/90 text-foreground border-white/30 placeholder:text-muted-foreground"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
              />
              <Button type="submit" className="h-14 md:h-16 px-8 text-lg font-bold shadow-lg w-full md:w-auto shrink-0">
                GET MY CASH OFFER <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </form>
          </div>
          
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-12 max-w-4xl text-white/90">
            <div className="flex flex-col items-center text-center gap-2">
              <CheckCircle className="w-6 h-6 text-primary" />
              <span className="font-medium text-sm md:text-base">Sell As-Is</span>
            </div>
            <div className="flex flex-col items-center text-center gap-2">
              <Home className="w-6 h-6 text-primary" />
              <span className="font-medium text-sm md:text-base">No Open Houses</span>
            </div>
            <div className="flex flex-col items-center text-center gap-2">
              <Shield className="w-6 h-6 text-primary" />
              <span className="font-medium text-sm md:text-base">No Obligation</span>
            </div>
            <div className="flex flex-col items-center text-center gap-2">
              <Calendar className="w-6 h-6 text-primary" />
              <span className="font-medium text-sm md:text-base">Flexible Closing</span>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST SECTION - Clean text with dividers */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4 text-foreground">A Simpler Way to Sell Your Property</h2>
            <div className="w-24 h-1 bg-primary mx-auto"></div>
          </div>
          
          <div className="flex flex-col md:flex-row items-start justify-between gap-12 md:divide-x md:divide-border/60">
            {[
              { title: "Sell As-Is", desc: "Leave the repairs to us. We buy properties in their current condition." },
              { title: "Skip Open Houses", desc: "Maintain your privacy. No weekend showings, no staging." },
              { title: "Flexible Timeline", desc: "Need to close quickly or need time to move? We work around you." },
              { title: "Straightforward", desc: "Direct communication with our team. No hidden fees." }
            ].map((feature, i) => (
              <div key={i} className="flex-1 md:px-8 first:pl-0 last:pr-0">
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS PREVIEW */}
      <section className="py-24 bg-muted/30 border-y border-border">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="font-serif text-4xl md:text-5xl font-bold mb-6">How It Works</h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Our process is designed to be transparent, efficient, and entirely built around your needs.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-12 mb-16">
            {[
              { step: "01", title: "Tell Us About Your Property", desc: "Enter your address and answer a few quick questions." },
              { step: "02", title: "We Review The Details", desc: "Our experienced team evaluates the property to determine a fair offer." },
              { step: "03", title: "Discuss Next Steps", desc: "If it's a fit, we'll talk through options with no obligation." }
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-background border-2 border-primary flex items-center justify-center text-primary font-bold text-xl mb-6 shadow-sm">
                  {item.step}
                </div>
                <h3 className="text-xl font-bold mb-3 font-serif">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Link href="/how-it-works" className="inline-flex items-center text-primary font-semibold hover:text-primary/80 transition-colors text-lg">
              See Full Details <ArrowRight className="ml-2 w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* SITUATIONS */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4">Whatever The Situation, Let's Talk.</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">We work with property owners navigating a variety of circumstances.</p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 mb-16">
            {["Inherited Property", "Major Repairs Needed", "Relocation", "Downsizing", "Vacant Property", "Problem Tenants", "Foreclosure Concerns", "Divorce"].map((sit, i) => (
              <div key={i} className="py-4 border-b border-border text-center md:text-left font-medium">
                {sit}
              </div>
            ))}
          </div>
          
          <div className="text-center">
            <Button size="lg" asChild className="h-14 px-10 text-lg">
              <Link href="/sell-your-house">Sell Your House <ArrowRight className="ml-2 w-5 h-5" /></Link>
            </Button>
            <p className="text-center text-sm text-muted-foreground mt-8 max-w-xl mx-auto">
              *Rehman INC provides direct real estate purchasing services and does not provide legal, tax, or financial advice.
            </p>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-32 bg-primary relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 mix-blend-overlay" style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/cubes.png')" }}></div>
        <div className="container mx-auto px-4 relative z-10 text-center">
          <h2 className="font-serif text-4xl md:text-6xl font-bold text-primary-foreground mb-6">Ready To Talk About Your Property?</h2>
          <p className="text-xl text-primary-foreground/80 mb-12 max-w-2xl mx-auto">
            Enter your property address below to start the process. No pressure, no obligations.
          </p>
          
          <div className="w-full max-w-2xl mx-auto bg-background p-2 md:p-3 rounded-lg shadow-2xl flex flex-col md:flex-row gap-2">
            <Input 
              placeholder="Enter your property address..." 
              className="h-14 md:h-16 text-lg border-0 focus-visible:ring-0 shadow-none bg-transparent"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <Button onClick={handleGetStarted} className="h-14 md:h-16 px-8 text-lg font-bold w-full md:w-auto shrink-0 shadow-md">
              GET STARTED <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </section>

      <Footer />
      
      {/* Mobile sticky CTA */}
      <div className="md:hidden fixed bottom-0 left-0 w-full p-4 bg-background/90 backdrop-blur-md border-t border-border z-40">
        <Button size="lg" className="w-full h-14 text-lg font-bold shadow-xl" onClick={() => setFormOpen(true)}>
          Get My Cash Offer
        </Button>
      </div>

      <MultiStepForm 
        open={formOpen} 
        onOpenChange={setFormOpen} 
        initialAddress={address}
      />
    </div>
  );
}
