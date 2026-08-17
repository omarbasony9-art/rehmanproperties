import { useState } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { MultiStepForm } from "@/components/marketing/multi-step-form";
import { LightPageHero } from "@/components/layout/page-hero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Phone, Instagram, CheckCircle } from "lucide-react";
import { useSEO } from "@/hooks/use-seo";
import { useSubmitInquiry } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useSiteConfig, instagramHandle, phoneHref } from "@/hooks/use-site-config";
import { usePageContent } from "@/hooks/use-page-content";

export default function ContactPage() {
  const content = usePageContent("contact");
  useSEO(
    content.seoTitle || "Contact Us | Rehman INC",
    content.seoDescription || "Get in touch with Rehman INC to discuss your property or ask questions about our cash buying process.",
    { ogTitle: content.ogTitle || undefined, ogDescription: content.ogDescription || undefined, ogImage: content.ogImage || undefined }
  );

  const cfg = useSiteConfig();

  const [formOpen, setFormOpen] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { toast } = useToast();
  const submitInquiry = useSubmitInquiry();

  const [formData, setFormData] = useState({
    propertyAddress: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    message: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.firstName || !formData.email || !formData.message) {
      toast({
        title: "Missing Information",
        description: "Please fill out all required fields.",
        variant: "destructive",
      });
      return;
    }

    submitInquiry.mutate(
      {
        data: {
          address: formData.propertyAddress || "General Inquiry",
          city: "N/A",
          state: "N/A",
          zip: "00000",
          fullName: `${formData.firstName}${formData.lastName ? " " + formData.lastName : ""}`,
          email: formData.email,
          phone: formData.phone || "N/A",
          preferredContact: "email",
          contactConsent: true,
          sellingReason: formData.message,
          sellingTimeline: "just_exploring",
          source: "contact_form",
        },
      },
      {
        onSuccess: () => {
          setIsSuccess(true);
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
        onError: () => {
          toast({
            title: "Error",
            description: "There was a problem submitting your message. Please try again.",
            variant: "destructive",
          });
        },
      }
    );
  };

  const igHandle = instagramHandle(cfg.instagram_url);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar onOpenForm={() => setFormOpen(true)} />

      <LightPageHero
        eyebrow={content.heroEyebrow}
        title={content.heroHeadline}
        description={content.heroSubtext}
        ctaLabel="Get Started"
        onCtaClick={() => setFormOpen(true)}
      />

      {/* INTRO — shown only when CMS provides text */}
      {content.intro && (
        <section className="pt-12 pb-0 bg-background">
          <div className="container mx-auto px-4 max-w-4xl text-center">
            <p className="text-lg text-muted-foreground leading-relaxed">{content.intro}</p>
          </div>
        </section>
      )}

      {/* CONTACT SECTION */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex flex-col lg:flex-row gap-16">

            {/* Form Column */}
            <div className="lg:w-2/3">
              {isSuccess ? (
                <div className="bg-primary/5 border border-primary/20 p-12 rounded-xl text-center">
                  <CheckCircle className="w-16 h-16 text-primary mx-auto mb-6" />
                  <h2 className="font-serif text-3xl font-bold mb-4">Message Sent</h2>
                  <p className="text-lg text-muted-foreground mb-8">
                    Thank you for reaching out. A member of our team will review your message and get back to you shortly.
                  </p>
                  <Button
                    onClick={() => {
                      setIsSuccess(false);
                      setFormData({ propertyAddress: "", firstName: "", lastName: "", email: "", phone: "", message: "" });
                    }}
                    variant="outline"
                  >
                    Send Another Message
                  </Button>
                </div>
              ) : (
                <>
                  <h2 className="font-serif text-3xl font-bold mb-6">Send a Message</h2>
                  <p className="text-muted-foreground mb-8">
                    Please provide some basic information and let us know how we can help. If you're inquiring about a specific property, including the address will help us prepare before we respond.
                  </p>

                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label htmlFor="firstName" className="text-sm font-medium">First Name *</label>
                        <Input
                          id="firstName" name="firstName" required
                          value={formData.firstName} onChange={handleChange}
                          className="h-12 bg-background border-border"
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="lastName" className="text-sm font-medium">Last Name</label>
                        <Input
                          id="lastName" name="lastName"
                          value={formData.lastName} onChange={handleChange}
                          className="h-12 bg-background border-border"
                        />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label htmlFor="email" className="text-sm font-medium">Email Address *</label>
                        <Input
                          id="email" name="email" type="email" required
                          value={formData.email} onChange={handleChange}
                          className="h-12 bg-background border-border"
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="phone" className="text-sm font-medium">Phone Number</label>
                        <Input
                          id="phone" name="phone" type="tel"
                          value={formData.phone} onChange={handleChange}
                          className="h-12 bg-background border-border"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="propertyAddress" className="text-sm font-medium">Property Address (Optional)</label>
                      <Input
                        id="propertyAddress" name="propertyAddress"
                        value={formData.propertyAddress} onChange={handleChange}
                        className="h-12 bg-background border-border"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="message" className="text-sm font-medium">Message *</label>
                      <Textarea
                        id="message" name="message" required rows={5}
                        value={formData.message} onChange={handleChange}
                        className="bg-background border-border resize-none"
                      />
                    </div>

                    <div className="text-sm text-muted-foreground pb-4">
                      By submitting this form, you consent to being contacted by {cfg.company_name} via email or phone regarding your inquiry.
                    </div>

                    <Button type="submit" disabled={submitInquiry.isPending} className="h-14 px-8 text-lg w-full md:w-auto">
                      {submitInquiry.isPending ? "Sending..." : "Submit Message"}
                    </Button>
                  </form>
                </>
              )}
            </div>

            {/* Info Column */}
            <div className="lg:w-1/3">
              <div className="bg-muted/40 border border-border p-8 rounded-xl">
                <h3 className="font-serif text-2xl font-bold mb-2">Contact Information</h3>
                {cfg.contact_name && (
                  <p className="text-lg font-semibold text-foreground mb-8">{cfg.contact_name}</p>
                )}

                <div className="space-y-6 mb-10">
                  {cfg.contact_phone && (
                    <a href={phoneHref(cfg.contact_phone)} className="flex items-center gap-4 group">
                      <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                        <Phone className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Phone</p>
                        <span className="text-foreground font-medium group-hover:text-primary transition-colors">
                          {cfg.contact_phone}
                        </span>
                      </div>
                    </a>
                  )}

                  {cfg.contact_email && (
                    <a href={`mailto:${cfg.contact_email}`} className="flex items-center gap-4 group">
                      <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                        <Mail className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Email</p>
                        <span className="text-foreground font-medium group-hover:text-primary transition-colors break-all">
                          {cfg.contact_email}
                        </span>
                      </div>
                    </a>
                  )}

                  {cfg.instagram_url && (
                    <a
                      href={cfg.instagram_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-4 group"
                    >
                      <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                        <Instagram className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Instagram</p>
                        <span className="text-foreground font-medium group-hover:text-primary transition-colors">
                          {igHandle}
                        </span>
                      </div>
                    </a>
                  )}
                </div>

                <div className="space-y-4 pt-8 border-t border-border">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    For the fastest evaluation, use our direct offer form.
                  </p>
                  <Button variant="outline" onClick={() => setFormOpen(true)} className="w-full">
                    Get My Cash Offer
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />

      <MultiStepForm open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
