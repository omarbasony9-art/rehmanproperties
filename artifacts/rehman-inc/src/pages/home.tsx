import { useState, useEffect } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { MultiStepForm } from "@/components/marketing/multi-step-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowRight, CheckCircle, Home, Calendar, ThumbsUp, DollarSign, Building, Wrench, Shield, Search, X } from "lucide-react";
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
    // Optional Analytics Setup
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
            src="/attached_assets/generated_images/hero-home.jpg" 
            alt="Luxury home at evening" 
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

      {/* TRUST SECTION */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4 text-foreground">A Simpler Way to Sell Your Property</h2>
            <div className="w-24 h-1 bg-primary mx-auto"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { title: "Sell As-Is", desc: "Leave the repairs to us. We buy properties in their current condition, saving you time and capital.", icon: Wrench },
              { title: "Skip Open Houses", desc: "Maintain your privacy. No weekend showings, no staging, and no endless stream of strangers.", icon: Home },
              { title: "Flexible Timeline", desc: "Need to close quickly or need time to move? We work around your schedule, not the other way around.", icon: Calendar },
              { title: "Straightforward Process", desc: "Direct communication with our team. No hidden fees or last-minute financing fall-throughs.", icon: ThumbsUp }
            ].map((feature, i) => (
              <div key={i} className="bg-card border border-border p-8 rounded-xl hover-elevate transition-all duration-300 group text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="py-24 bg-muted/30 border-y border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row gap-16 items-center">
            <div className="md:w-1/3">
              <h2 className="font-serif text-4xl md:text-5xl font-bold mb-6">How It Works</h2>
              <p className="text-lg text-muted-foreground mb-8">
                Our process is designed to be transparent, efficient, and entirely built around your needs.
              </p>
              <Button size="lg" onClick={() => setFormOpen(true)} className="h-14 px-8 text-lg hidden md:inline-flex shadow-md">
                Start Now
              </Button>
            </div>
            
            <div className="md:w-2/3 space-y-12 relative before:absolute before:inset-0 before:ml-[28px] md:before:ml-[34px] before:-translate-x-px md:before:translate-x-0 before:h-full before:w-0.5 before:bg-border/60">
              {[
                { step: "01", title: "Tell Us About Your Property", desc: "Enter your address and answer a few quick questions about the property's condition and your selling goals." },
                { step: "02", title: "We Review The Property", desc: "Our experienced team evaluates the property's location, current condition, and relevant market details to determine a fair cash offer." },
                { step: "03", title: "Review Your Offer", desc: "If the property is a fit, we'll contact you to discuss next steps. There is absolutely no obligation to accept." }
              ].map((item, i) => (
                <div key={i} className="relative flex items-start gap-6">
                  <div className="w-14 h-14 md:w-16 md:h-16 shrink-0 rounded-full bg-background border-2 border-primary flex items-center justify-center text-primary font-bold text-xl relative z-10 shadow-sm">
                    {item.step}
                  </div>
                  <div className="pt-2 md:pt-4">
                    <h3 className="text-2xl font-bold mb-3 font-serif">{item.title}</h3>
                    <p className="text-muted-foreground text-lg leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* WHY US / COMPARISON */}
      <section id="why-us" className="py-24 bg-foreground text-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4 text-background">Selling Doesn't Have To Be Complicated.</h2>
            <div className="w-24 h-1 bg-secondary mx-auto"></div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <div className="bg-background/5 border border-background/10 p-8 md:p-12 rounded-xl">
              <h3 className="text-2xl font-serif font-bold mb-8 flex items-center gap-3 text-background/60">
                <X className="w-6 h-6" /> Traditional Sale
              </h3>
              <ul className="space-y-6">
                {["Costly Repairs Required", "Inconvenient Open Houses", "Staging & Prep Costs", "Financing Uncertainty", "Longer, Unpredictable Timeline", "Endless Showings"].map((item, i) => (
                  <li key={i} className="flex items-start gap-4 text-background/70 text-lg">
                    <div className="mt-1 shrink-0 w-5 h-5 rounded-full bg-background/20 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-background/50"></div>
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="bg-background text-foreground border border-primary p-8 md:p-12 rounded-xl relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-16 translate-x-16"></div>
              <h3 className="text-2xl font-serif font-bold mb-8 flex items-center gap-3 text-primary">
                <CheckCircle className="w-6 h-6" /> Rehman INC
              </h3>
              <ul className="space-y-6">
                {["Sell As-Is (No Repairs)", "No Open Houses", "Simple, Direct Process", "Clear Communication", "Flexible Timeline", "No Obligation Offers"].map((item, i) => (
                  <li key={i} className="flex items-start gap-4 text-foreground/80 text-lg font-medium">
                    <CheckCircle className="mt-0.5 shrink-0 w-6 h-6 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* SITUATIONS */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4">Whatever The Situation, Let's Talk.</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">We work with property owners navigating a variety of circumstances.</p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 max-w-5xl mx-auto">
            {["Inherited Property", "Major Repairs Needed", "Relocation", "Downsizing", "Vacant Property", "Problem Tenants", "Unwanted Rental", "Divorce", "Foreclosure Concerns", "Fire or Water Damage", "Job Loss", "Ready To Sell"].map((sit, i) => (
              <div key={i} className="bg-muted/40 border border-border p-4 md:p-6 rounded-lg text-center font-medium hover:border-primary/50 transition-colors">
                {sit}
              </div>
            ))}
          </div>
          
          <p className="text-center text-sm text-muted-foreground mt-12 max-w-xl mx-auto">
            *Rehman INC provides direct real estate purchasing services and does not provide legal, tax, or financial advice.
          </p>
        </div>
      </section>

      {/* PROPERTIES */}
      <section id="properties" className="py-24 bg-muted/20 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
            <div>
              <h2 className="font-serif text-4xl md:text-5xl font-bold mb-4">Properties We Consider</h2>
              <p className="text-lg text-muted-foreground max-w-xl">We evaluate a wide range of properties across various markets.</p>
            </div>
            <Button variant="outline" size="lg" className="shrink-0" onClick={() => setFormOpen(true)}>
              Submit Your Property
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Example Property Cards (Content Placeholder) */}
            {[
              { img: "/attached_assets/generated_images/property-1.jpg", type: "Single Family", location: "Sample Market" },
              { img: "/attached_assets/generated_images/property-2.jpg", type: "Townhouse", location: "Sample Market" },
              { img: "/attached_assets/generated_images/property-3.jpg", type: "Single Family", location: "Sample Market" },
            ].map((prop, i) => (
              <div key={i} className="group cursor-pointer rounded-xl overflow-hidden border border-border bg-card shadow-sm hover-elevate transition-all duration-300">
                <div className="aspect-[4/3] overflow-hidden relative">
                  <div className="absolute top-4 left-4 z-10 bg-background/90 backdrop-blur-sm px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-md border border-border">
                    {prop.type}
                  </div>
                  <img 
                    src={prop.img} 
                    alt={prop.type} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 via-transparent to-transparent opacity-60"></div>
                  <div className="absolute bottom-4 left-4 right-4 z-10 text-white">
                    <p className="font-semibold text-lg">{prop.location}</p>
                    <p className="text-white/70 text-sm flex items-center gap-1"><Search className="w-3 h-3" /> Representative Example</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 bg-background">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="font-serif text-3xl md:text-5xl font-bold mb-4">Frequently Asked Questions</h2>
          </div>
          
          <Accordion type="single" collapsible className="w-full space-y-4">
            {[
              { q: "Do I need to repair my house before selling?", a: "No. We consider properties in any condition. The current state of the property is factored into our evaluation, saving you the time, hassle, and upfront capital required for renovations." },
              { q: "How is an offer determined?", a: "Our team evaluates the property based on its location, size, current condition, required repairs, and other relevant market factors." },
              { q: "Am I obligated to accept an offer?", a: "Absolutely not. Any offer we make carries zero obligation. You are completely free to decline if it doesn't align with your goals." },
              { q: "Can I sell a property with tenants?", a: "Yes. We consider properties with existing tenants in place. Each situation is evaluated individually." },
              { q: "What types of properties does Rehman INC consider?", a: "We consider single-family homes, multi-family properties, condos, townhouses, land, and other residential property types." },
              { q: "What happens after I submit my property?", a: "A member of our team will review your submission and reach out using your preferred contact method to discuss the property in more detail." },
              { q: "How quickly can the process move?", a: "Timeline depends on the specific property and your situation. We pride ourselves on being flexible and working around your needs, whether you need to close quickly or require more time." },
            ].map((faq, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border border-border rounded-lg px-6 bg-card">
                <AccordionTrigger className="text-left font-serif text-xl py-6 hover:no-underline hover:text-primary transition-colors">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-lg leading-relaxed pb-6">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-32 bg-primary relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay"></div>
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
