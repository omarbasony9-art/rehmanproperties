import { useState } from "react";
import { Link } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { MultiStepForm } from "@/components/marketing/multi-step-form";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useSEO } from "@/hooks/use-seo";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function HowItWorksPage() {
  useSEO(
    "How It Works | Rehman INC",
    "Learn about our straightforward process for buying your property directly. No agents, no showings, no obligations."
  );
  
  const [formOpen, setFormOpen] = useState(false);

  const steps = [
    {
      title: "Tell us about your property",
      desc: "Submit your address and answer a few initial questions about the property's condition and your current situation."
    },
    {
      title: "Submit property details",
      desc: "Fill out the inquiry form with details about bedrooms, bathrooms, overall condition, and your reason for selling."
    },
    {
      title: "Upload photos if desired",
      desc: "This step is optional, but providing current photos helps our team understand the property better and evaluate it faster."
    },
    {
      title: "Rehman INC reviews the property",
      desc: "Our team evaluates the property's location, current condition, market factors, and required repairs."
    },
    {
      title: "We contact the homeowner",
      desc: "We will reach out to you using your preferred contact method within a reasonable timeframe to discuss the property."
    },
    {
      title: "Discuss an offer if the property is a fit",
      desc: "If the property aligns with our criteria, we'll have a straightforward conversation about a cash offer with no obligation."
    },
    {
      title: "Flexible next steps",
      desc: "If you choose to accept, we can close on your timeline. We work around your schedule to make the transition as smooth as possible."
    }
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar onOpenForm={() => setFormOpen(true)} />
      
      {/* PAGE HERO */}
      <section className="pt-32 pb-16 bg-foreground text-background">
        <div className="container mx-auto px-4">
          <h1 className="font-serif text-5xl md:text-6xl font-bold mb-6">How It Works</h1>
          <p className="text-xl text-background/70 max-w-2xl">
            A straightforward, direct approach to selling your property without the usual complications.
          </p>
        </div>
      </section>

      {/* PROCESS SECTION */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex justify-between items-center mb-16">
            <h2 className="font-serif text-3xl md:text-4xl font-bold">The Process</h2>
            <Button onClick={() => setFormOpen(true)} className="hidden md:flex">
              Get My Cash Offer
            </Button>
          </div>
          
          <div className="space-y-12 relative before:absolute before:inset-0 before:ml-[28px] md:before:ml-[34px] before:-translate-x-px md:before:translate-x-0 before:h-full before:w-0.5 before:bg-border/60">
            {steps.map((step, i) => (
              <div key={i} className="relative flex items-start gap-6 md:gap-10">
                <div className="w-14 h-14 md:w-16 md:h-16 shrink-0 rounded-full bg-background border-2 border-primary flex items-center justify-center text-primary font-bold text-xl relative z-10 shadow-sm">
                  {i + 1}
                </div>
                <div className="pt-2 md:pt-4">
                  <h3 className="text-2xl font-bold mb-3 font-serif">{step.title}</h3>
                  <p className="text-muted-foreground text-lg leading-relaxed max-w-2xl">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center md:text-left">
            <Button size="lg" onClick={() => setFormOpen(true)} className="h-14 px-8 text-lg">
              Get My Cash Offer <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ TEASER */}
      <section className="py-24 bg-muted/30 border-y border-border">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl md:text-4xl font-bold mb-4">Common Questions</h2>
            <p className="text-muted-foreground">A few things property owners often ask us.</p>
          </div>
          
          <Accordion type="single" collapsible className="w-full space-y-4 mb-12">
            <AccordionItem value="q1" className="border border-border rounded-lg px-6 bg-card">
              <AccordionTrigger className="text-left font-serif text-lg py-5 hover:no-underline hover:text-primary transition-colors">
                Do I need to repair my house before selling?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-base leading-relaxed pb-5">
                No. We consider properties in their current condition. You do not need to clean, paint, or repair anything before we evaluate it.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q2" className="border border-border rounded-lg px-6 bg-card">
              <AccordionTrigger className="text-left font-serif text-lg py-5 hover:no-underline hover:text-primary transition-colors">
                Am I obligated to accept an offer?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-base leading-relaxed pb-5">
                Absolutely not. Requesting an offer is completely free and carries zero obligation. We present the offer, and you decide if it works for you.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          
          <div className="text-center">
            <Button variant="outline" size="lg" asChild>
              <Link href="/faq">View All FAQs</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-24 bg-primary">
        <div className="container mx-auto px-4 text-center">
          <h2 className="font-serif text-4xl font-bold text-primary-foreground mb-4">Ready To Talk?</h2>
          <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto text-lg">
            No pressure, no obligation. See if your property is a good fit.
          </p>
          <Button 
            size="lg" 
            onClick={() => setFormOpen(true)} 
            className="bg-background text-foreground hover:bg-background/90 h-14 px-10 text-lg shadow-lg"
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
