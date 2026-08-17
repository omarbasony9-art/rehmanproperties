import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Menu, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navbar({ onOpenForm }: { onOpenForm: () => void }) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  const navLinks = [
    { name: "Home", href: "/" },
    { name: "Sell Your House", href: "/sell-your-house" },
    { name: "How It Works", href: "/how-it-works" },
    { name: "Why Us", href: "/why-us" },
    { name: "Properties", href: "/properties" },
    { name: "FAQ", href: "/faq" },
    { name: "Contact", href: "/contact" },
  ];

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? "bg-[hsl(220,20%,5%)]/97 backdrop-blur-md border-b border-white/8 shadow-[0_2px_20px_rgba(0,0,0,0.4)]"
            : "bg-gradient-to-b from-black/60 to-transparent"
        }`}
      >
        <div className="max-w-[1400px] mx-auto px-4 md:px-8">
          <div className="flex items-center justify-between h-20">

            {/* Logo */}
            <Link href="/" className="flex items-center shrink-0 group">
              <img
                src={`${import.meta.env.BASE_URL}logo.png`}
                alt="Rehman INC Real Estate Investments"
                className="h-14 w-auto object-contain transition-opacity duration-200 group-hover:opacity-85"
                draggable={false}
              />
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-0.5 mx-6 xl:mx-10">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`relative px-3 xl:px-4 py-2 text-[13px] xl:text-sm font-medium tracking-wide transition-colors duration-150 rounded-sm whitespace-nowrap ${
                    isActive(link.href)
                      ? "text-white"
                      : "text-white/65 hover:text-white"
                  }`}
                >
                  {link.name}
                  {isActive(link.href) && (
                    <span className="absolute bottom-0 left-3 xl:left-4 right-3 xl:right-4 h-[2px] bg-primary rounded-full" />
                  )}
                </Link>
              ))}
            </nav>

            {/* Desktop CTA */}
            <div className="hidden lg:flex items-center shrink-0">
              <Button
                onClick={onOpenForm}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-5 xl:px-7 h-10 xl:h-11 text-sm rounded-sm tracking-wide shadow-lg shadow-primary/20 transition-all duration-200 hover:shadow-primary/30 hover:shadow-xl"
              >
                Get My Cash Offer
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            {/* Mobile Hamburger */}
            <button
              className="lg:hidden flex items-center justify-center w-10 h-10 text-white/80 hover:text-white transition-colors rounded-sm"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={22} strokeWidth={1.75} /> : <Menu size={22} strokeWidth={1.75} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-[hsl(220,20%,5%)] flex flex-col">
          {/* Mobile Header Row */}
          <div className="flex items-center justify-between px-4 h-20 border-b border-white/10">
            <Link href="/" onClick={() => setMobileMenuOpen(false)}>
              <img
                src={`${import.meta.env.BASE_URL}logo.png`}
                alt="Rehman INC Real Estate Investments"
                className="h-12 w-auto object-contain"
              />
            </Link>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="w-10 h-10 flex items-center justify-center text-white/70 hover:text-white"
              aria-label="Close menu"
            >
              <X size={22} strokeWidth={1.75} />
            </button>
          </div>

          {/* Mobile Links */}
          <nav className="flex-1 overflow-y-auto px-4 py-6">
            <div className="flex flex-col">
              {navLinks.map((link, i) => (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between py-4 border-b text-lg font-medium transition-colors ${
                    i === navLinks.length - 1 ? "border-transparent" : "border-white/10"
                  } ${
                    isActive(link.href)
                      ? "text-primary"
                      : "text-white/75 hover:text-white"
                  }`}
                >
                  {link.name}
                  <ArrowRight
                    size={16}
                    className={`opacity-40 ${isActive(link.href) ? "text-primary opacity-100" : ""}`}
                  />
                </Link>
              ))}
            </div>
          </nav>

          {/* Mobile CTA */}
          <div className="px-4 pb-8 pt-4 border-t border-white/10">
            <Button
              onClick={() => {
                onOpenForm();
                setMobileMenuOpen(false);
              }}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-14 text-base font-semibold rounded-sm tracking-wide"
            >
              Get My Cash Offer
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <p className="text-white/30 text-xs text-center mt-3">No obligation. No pressure.</p>
          </div>
        </div>
      )}
    </>
  );
}
