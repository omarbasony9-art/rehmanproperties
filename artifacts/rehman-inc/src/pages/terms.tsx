import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { MultiStepForm } from "@/components/marketing/multi-step-form";
import { useState } from "react";
import { useSEO } from "@/hooks/use-seo";
import { usePageContent } from "@/hooks/use-page-content";

export default function TermsPage() {
  const content = usePageContent("terms");
  useSEO(
    content.seoTitle || "Terms of Service | Rehman INC",
    content.seoDescription || "Terms of Service for Rehman INC.",
    { ogTitle: content.ogTitle || undefined, ogDescription: content.ogDescription || undefined, ogImage: content.ogImage || undefined }
  );
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar onOpenForm={() => setFormOpen(true)} />
      
      <main className="flex-1 pt-32 pb-24 container mx-auto px-4 max-w-4xl">
        <div className="mb-12">
          <h1 className="font-serif text-4xl md:text-5xl font-bold mb-4">{content.pageTitle}</h1>
          <p className="text-muted-foreground text-lg">Last Updated: {content.lastUpdated}</p>
        </div>

        <div className="prose prose-lg dark:prose-invert max-w-none font-sans text-muted-foreground">
          <div className="bg-muted p-6 rounded-lg mb-8 border border-border">
            <strong>Disclaimer:</strong> {content.disclaimer}
          </div>

          <h2 className="text-foreground font-serif">1. Acceptance of Terms</h2>
          <p>
            By accessing or using the Rehman INC website, you agree to be bound by these Terms of Service. If you do not agree to all the terms and conditions, you must not use our website or services.
          </p>

          <h2 className="text-foreground font-serif">2. Use of Website</h2>
          <p>
            This website is provided for informational purposes and to facilitate communication regarding potential real estate transactions. You agree to use the site only for lawful purposes and in a way that does not infringe upon the rights of others.
          </p>

          <h2 className="text-foreground font-serif">3. No Guarantees or Commitments</h2>
          <p>
            Submitting property information through our website does not obligate Rehman INC to make an offer, nor does it obligate you to accept any offer that may be made. All offers are subject to mutual agreement and the execution of a formal, written purchase contract. Rehman INC reserves the right to decline purchasing any property for any reason.
          </p>

          <h2 className="text-foreground font-serif">4. No Professional Advice</h2>
          <p>
            The content on this website and any communication from Rehman INC personnel should not be construed as legal, tax, financial, or accounting advice. You are strongly encouraged to consult with your own independent professional advisors before making any decisions regarding your real estate.
          </p>

          <h2 className="text-foreground font-serif">5. Intellectual Property</h2>
          <p>
            All content, logos, text, and graphics on this site are the property of Rehman INC and are protected by applicable intellectual property laws. You may not reproduce, distribute, or use these materials without our express written permission.
          </p>

          <h2 className="text-foreground font-serif">6. Limitation of Liability</h2>
          <p>
            In no event shall Rehman INC, its directors, employees, or agents be liable for any direct, indirect, incidental, consequential, or punitive damages arising out of your use of or inability to use this website.
          </p>

          <h2 className="text-foreground font-serif">7. Changes to Terms</h2>
          <p>
            We reserve the right to modify these Terms of Service at any time. We will indicate changes by updating the "Last Updated" date at the top of this page. Your continued use of the website following any changes constitutes your acceptance of the new Terms.
          </p>
        </div>
      </main>

      <Footer />
      <MultiStepForm open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
