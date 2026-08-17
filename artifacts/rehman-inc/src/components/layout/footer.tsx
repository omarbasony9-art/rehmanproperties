import { Link } from "wouter";
import { Instagram, Mail, Phone } from "lucide-react";
import { useSiteConfig, instagramHandle, phoneHref } from "@/hooks/use-site-config";
import { usePageContent } from "@/hooks/use-page-content";

export function Footer() {
  const cfg = useSiteConfig();
  const footer = usePageContent("footer");

  const igHandle = instagramHandle(cfg.instagram_url);
  const copyright = footer.copyright || `© ${new Date().getFullYear()} ${cfg.company_name}. All rights reserved.`;
  const disclaimer = footer.disclaimer || "Rehman INC does not provide legal, tax, or financial advice.";
  const tagline =
    footer.tagline ||
    "We provide straightforward, no-obligation cash offers for properties in any condition. Skip the repairs, showings, and uncertainty of a traditional sale.";

  return (
    <footer className="bg-foreground text-background py-16">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">

          {/* Brand + contact */}
          <div className="md:col-span-2">
            <span className="font-serif text-2xl font-bold tracking-wider uppercase mb-4 block">
              {cfg.company_name}
            </span>
            <p className="text-background/70 max-w-md mb-6 leading-relaxed">
              {tagline}
            </p>

            {/* Contact details */}
            <div className="space-y-3 text-sm text-background/70 mb-6">
              {cfg.contact_name && (
                <p className="font-semibold text-background/90 text-base">{cfg.contact_name}</p>
              )}

              {cfg.contact_phone && (
                <a
                  href={phoneHref(cfg.contact_phone)}
                  className="flex items-center gap-2 hover:text-secondary transition-colors"
                >
                  <Phone className="w-4 h-4 shrink-0" />
                  {cfg.contact_phone}
                </a>
              )}

              {cfg.contact_email && (
                <a
                  href={`mailto:${cfg.contact_email}`}
                  className="flex items-center gap-2 hover:text-secondary transition-colors"
                >
                  <Mail className="w-4 h-4 shrink-0" />
                  {cfg.contact_email}
                </a>
              )}

              {cfg.instagram_url && (
                <a
                  href={cfg.instagram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 hover:text-secondary transition-colors"
                >
                  <Instagram className="w-4 h-4 shrink-0" />
                  {igHandle}
                </a>
              )}
            </div>

            <p className="text-xs text-background/40">{disclaimer}</p>
          </div>

          {/* Explore links */}
          <div>
            <h4 className="font-bold mb-6 text-lg tracking-wide uppercase">Explore</h4>
            <ul className="space-y-4 text-background/80">
              <li><Link href="/sell-your-house" className="hover:text-secondary transition-colors block">Sell Your House</Link></li>
              <li><Link href="/how-it-works" className="hover:text-secondary transition-colors block">How It Works</Link></li>
              <li><Link href="/why-us" className="hover:text-secondary transition-colors block">Why Us</Link></li>
              <li><Link href="/properties" className="hover:text-secondary transition-colors block">Properties</Link></li>
              <li><Link href="/faq" className="hover:text-secondary transition-colors block">FAQ</Link></li>
              <li><Link href="/contact" className="hover:text-secondary transition-colors block">Contact</Link></li>
            </ul>
          </div>

          {/* Legal links */}
          <div>
            <h4 className="font-bold mb-6 text-lg tracking-wide uppercase">Legal</h4>
            <ul className="space-y-4 text-background/80">
              <li><Link href="/privacy" className="hover:text-secondary transition-colors block">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-secondary transition-colors block">Terms of Service</Link></li>
              <li><Link href="/admin" className="hover:text-secondary transition-colors block">Admin Access</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-background/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-background/50 text-sm">{copyright}</p>
          {cfg.instagram_url && (
            <a
              href={cfg.instagram_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-background/50 text-sm hover:text-secondary transition-colors"
            >
              <Instagram className="w-4 h-4" />
              {igHandle}
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
