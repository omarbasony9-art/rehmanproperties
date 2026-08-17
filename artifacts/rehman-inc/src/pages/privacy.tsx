import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { MultiStepForm } from "@/components/marketing/multi-step-form";
import { useState } from "react";
import { useSEO } from "@/hooks/use-seo";

export default function PrivacyPage() {
  useSEO("Privacy Policy | Rehman INC", "Privacy Policy for Rehman INC.");
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar onOpenForm={() => setFormOpen(true)} />
      
      <main className="flex-1 pt-32 pb-24 container mx-auto px-4 max-w-4xl">
        <div className="mb-12">
          <h1 className="font-serif text-4xl md:text-5xl font-bold mb-4">Privacy Policy</h1>
          <p className="text-muted-foreground text-lg">Last Updated: October 2026</p>
        </div>

        <div className="prose prose-lg dark:prose-invert max-w-none font-sans text-muted-foreground">
          <div className="bg-muted p-6 rounded-lg mb-8 border border-border">
            <strong>Disclaimer:</strong> This page describes our privacy practices and is for informational purposes only. It does not constitute legal advice.
          </div>

          <h2 className="text-foreground font-serif">1. Information We Collect</h2>
          <p>
            When you use the Rehman INC website or submit a property inquiry, we may collect the following types of information:
          </p>
          <ul>
            <li><strong>Contact Information:</strong> Your name, email address, phone number, and preferred contact method.</li>
            <li><strong>Property Details:</strong> Address, property type, condition, repair needs, occupancy status, and your reasons or timeline for selling.</li>
            <li><strong>Photos:</strong> Any property photos you choose to upload through our optional secure upload feature.</li>
            <li><strong>Technical Data:</strong> IP addresses, browser types, and standard web analytics data (such as pages visited and referring sources like UTM parameters).</li>
          </ul>

          <h2 className="text-foreground font-serif">2. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul>
            <li>Evaluate properties for potential cash offers.</li>
            <li>Contact you regarding your inquiry or property submission.</li>
            <li>Understand market trends and improve our website and services.</li>
            <li>Comply with legal obligations.</li>
          </ul>
          <p>
            By submitting your information, you agree that a representative of Rehman INC may contact you via phone call, text message (SMS), or email to discuss your property.
          </p>

          <h2 className="text-foreground font-serif">3. Information Sharing & Disclosure</h2>
          <p>
            We do not sell your personal data to third parties. We may share your information with trusted service providers who assist us in operating our website, conducting our business, or evaluating properties (such as secure storage providers or CRM systems), as long as those parties agree to keep this information confidential.
          </p>

          <h2 className="text-foreground font-serif">4. Data Security</h2>
          <p>
            We implement appropriate security measures to maintain the safety of your personal information. Uploaded property photos are stored securely using enterprise-grade object storage solutions. However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
          </p>

          <h2 className="text-foreground font-serif">5. Your Rights</h2>
          <p>
            You may request to review, update, or delete the personal information we hold about you by contacting us. You may also opt-out of future communications at any time by following the unsubscribe instructions in our emails or by replying "STOP" to text messages.
          </p>

          <h2 className="text-foreground font-serif">6. Contact Us</h2>
          <p>
            If you have any questions regarding this privacy policy, you may contact us at Aliproperties91@gmail.com.
          </p>
        </div>
      </main>

      <Footer />
      <MultiStepForm open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
