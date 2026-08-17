import { Link } from "wouter";
import { Instagram, Mail, Phone } from "lucide-react";

const INSTAGRAM_URL =
  "https://www.instagram.com/ali_monopoly/?utm_source=ig_web_button_share_sheet";

export function Footer() {
  return (
    <footer className="bg-foreground text-background py-16">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">

          {/* Brand + contact */}
          <div className="md:col-span-2">
            <span className="font-serif text-2xl font-bold tracking-wider uppercase mb-4 block">
              Rehman INC
            </span>
            <p className="text-background/70 max-w-md mb-6 leading-relaxed">
              We provide straightforward, no-obligation cash offers for properties in any condition. Skip the repairs, showings, and uncertainty of a traditional sale.
            </p>

            {/* Contact details */}
            <div className="space-y-3 text-sm text-background/70 mb-6">
              <p className="font-semibold text-background/90 text-base">Ali Rehman</p>

              <a
                href="tel:+16095821061"
                className="flex items-center gap-2 hover:text-secondary transition-colors"
              >
                <Phone className="w-4 h-4 shrink-0" />
                609-582-1061
              </a>

              <a
                href="mailto:Aliproperties91@gmail.com"
                className="flex items-center gap-2 hover:text-secondary transition-colors"
              >
                <Mail className="w-4 h-4 shrink-0" />
                Aliproperties91@gmail.com
              </a>

              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:text-secondary transition-colors"
              >
                <Instagram className="w-4 h-4 shrink-0" />
                @ali_monopoly
              </a>
            </div>

            <p className="text-xs text-background/40">
              Disclaimer: Rehman INC does not provide legal, tax, or financial advice.
            </p>
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
          <p className="text-background/50 text-sm">
            &copy; {new Date().getFullYear()} Rehman INC. All rights reserved.
          </p>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-background/50 text-sm hover:text-secondary transition-colors"
          >
            <Instagram className="w-4 h-4" />
            @ali_monopoly
          </a>
        </div>
      </div>
    </footer>
  );
}
