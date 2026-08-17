import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { MultiStepForm } from "@/components/marketing/multi-step-form";
import { EditorialPageHero } from "@/components/layout/page-hero";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useSEO } from "@/hooks/use-seo";
import { usePageContent } from "@/hooks/use-page-content";

// ── Hardcoded fallback FAQs (shown when D1 has no published FAQs yet) ────────
const FALLBACK_FAQS = [
  {
    category: "About the Process",
    items: [
      { q: "How does Rehman INC determine an offer?", a: "Our team evaluates the property based on its location, size, current condition, required repairs, and other relevant market factors like recent comparable sales. We combine these elements to arrive at a fair cash offer." },
      { q: "What happens after I submit my property information?", a: "A member of our team will review your submission and reach out using your preferred contact method to discuss the property in more detail. If it sounds like a potential fit, we'll schedule a time to view it or make an initial offer." },
      { q: "How quickly can the process move?", a: "The timeline depends on your specific needs. Because we buy with cash and don't rely on traditional bank financing, we can often close in a matter of weeks, or even days if necessary. Alternatively, if you need more time to move, we can schedule a later closing date." },
      { q: "Am I obligated to accept an offer?", a: "Absolutely not. Any offer we make carries zero obligation. You are completely free to decline if it doesn't align with your goals." },
      { q: "Are there any fees or commissions?", a: "No. Unlike a traditional sale where you pay 5-6% in agent commissions and various closing costs, our offer is what you receive. We cover the typical closing costs associated with the transaction." },
      { q: "Do I need to be present for a closing?", a: "In most cases, no. Closings can often be handled remotely through a reputable title company or attorney via mail-away closing documents, saving you a trip to an office." },
    ],
  },
  {
    category: "About the Property",
    items: [
      { q: "Do I need to repair my house before selling?", a: "No. We consider properties in any condition. The current state of the property is factored into our evaluation, saving you the time, hassle, and upfront capital required for renovations." },
      { q: "What types of properties does Rehman INC consider?", a: "We purchase single-family homes, multi-family properties (duplexes, triplexes, etc.), condos, townhouses, and occasionally raw land or commercial real estate." },
      { q: "Can I sell a property that has tenants?", a: "Yes. We regularly purchase properties with existing tenants in place. We will review the current lease agreements and evaluate the situation on a case-by-case basis." },
    ],
  },
  {
    category: "Specific Situations",
    items: [
      { q: "Can I sell a property I inherited?", a: "Yes. Inherited properties often come with complexities, especially if they require probate or have deferred maintenance. We have experience working through these situations with heirs and estate representatives." },
      { q: "What if my property is in foreclosure?", a: "If you are facing foreclosure, a direct cash sale can sometimes be executed quickly enough to pay off the bank and avoid the foreclosure going on your permanent record. Time is of the essence in these scenarios." },
      { q: "What if I owe more than the house is worth?", a: "If your mortgage balance exceeds the property's value, it may require a 'short sale' negotiated with your lender. While more complex, we can discuss the specifics of your situation to see if we can help." },
    ],
  },
];

type DbFaq = { id: number; question: string; answer: string; sortOrder: number };

export default function FaqPage() {
  const content = usePageContent("faq");
  useSEO(
    content.seoTitle || "Frequently Asked Questions | Rehman INC",
    content.seoDescription || "Find answers to common questions about selling your property directly to Rehman INC for cash.",
    { ogTitle: content.ogTitle || undefined, ogDescription: content.ogDescription || undefined, ogImage: content.ogImage || undefined }
  );

  const [formOpen, setFormOpen] = useState(false);

  const { data: dbFaqs = [] } = useQuery<DbFaq[]>({
    queryKey: ["site-faqs"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/site/faqs");
        if (!res.ok) return [];
        return res.json();
      } catch {
        return [];
      }
    },
    staleTime: 0,
    gcTime: 5 * 60_000,
  });

  const hasDynamicFaqs = dbFaqs.length > 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar onOpenForm={() => setFormOpen(true)} />

      <EditorialPageHero
        eyebrow={content.heroEyebrow}
        title={content.heroHeadline}
        description={content.heroSubtext}
        showLines
      />

      {/* FAQ CONTENT */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 max-w-4xl">
          {hasDynamicFaqs ? (
            // ── D1-driven FAQs (flat list, sorted by sort_order) ──────────────
            <Accordion type="single" collapsible className="w-full space-y-4">
              {dbFaqs.map((faq, j) => (
                <AccordionItem
                  key={faq.id}
                  value={`faq-${faq.id}`}
                  className="border border-border rounded-lg px-6 bg-card"
                >
                  <AccordionTrigger className="text-left font-serif text-xl py-6 hover:no-underline hover:text-primary transition-colors">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-lg leading-relaxed pb-6">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            // ── Fallback: hardcoded categorised FAQs ──────────────────────────
            FALLBACK_FAQS.map((category, i) => (
              <div key={i} className="mb-16 last:mb-0">
                <h2 className="font-serif text-3xl font-bold mb-8 border-b border-border pb-4">
                  {category.category}
                </h2>
                <Accordion type="single" collapsible className="w-full space-y-4">
                  {category.items.map((faq, j) => (
                    <AccordionItem
                      key={j}
                      value={`item-${i}-${j}`}
                      className="border border-border rounded-lg px-6 bg-card"
                    >
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
            ))
          )}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-20 bg-primary">
        <div className="container mx-auto px-4 text-center">
          <h2 className="font-serif text-4xl font-bold text-primary-foreground mb-4">Still Have Questions?</h2>
          <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto text-lg">
            We're happy to discuss your specific situation.
          </p>
          <Button
            size="lg"
            onClick={() => setFormOpen(true)}
            className="bg-background text-foreground hover:bg-background/90 h-14 px-10 text-lg"
          >
            Start a Conversation
          </Button>
        </div>
      </section>

      <Footer />

      <MultiStepForm open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
