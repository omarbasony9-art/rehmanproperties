import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="bg-foreground text-background py-16">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div className="md:col-span-2">
            <span className="font-serif text-2xl font-bold tracking-wider uppercase mb-6 block">
              Rehman INC
            </span>
            <p className="text-background/70 max-w-md mb-6 leading-relaxed">
              We provide straightforward, no-obligation cash offers for properties in any condition. Skip the repairs, showings, and uncertainty of a traditional sale.
            </p>
            <p className="text-sm text-background/50">
              Disclaimer: Rehman INC does not provide legal, tax, or financial advice.
            </p>
          </div>
          
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
          
          <div>
            <h4 className="font-bold mb-6 text-lg tracking-wide uppercase">Legal</h4>
            <ul className="space-y-4 text-background/80">
              <li><Link href="/privacy" className="hover:text-secondary transition-colors block">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-secondary transition-colors block">Terms of Service</Link></li>
              <li><Link href="/admin" className="hover:text-secondary transition-colors block">Admin Access</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-background/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-background/50 text-sm">
            &copy; {new Date().getFullYear()} Rehman INC. All rights reserved.
          </p>
          <div className="flex gap-6">
            <span className="text-background/50 text-sm">Contact: Aliproperties91@gmail.com</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
