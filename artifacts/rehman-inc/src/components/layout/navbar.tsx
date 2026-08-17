import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Menu, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navbar({ onOpenForm }: { onOpenForm: () => void }) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { name: "Home", href: "/" },
    { name: "Sell Your House", href: "/sell-your-house" },
    { name: "How It Works", href: "/how-it-works" },
    { name: "Why Us", href: "/why-us" },
    { name: "Properties", href: "/properties" },
    { name: "FAQ", href: "/faq" },
    { name: "Contact", href: "/contact" },
  ];

  return (
    <header
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-background/90 backdrop-blur-md border-b border-border shadow-sm py-3"
          : "bg-transparent py-5"
      }`}
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-serif text-xl md:text-2xl font-bold tracking-wider uppercase text-foreground">
              Rehman INC
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  location === link.href ? "text-primary font-semibold" : "text-foreground/80"
                }`}
              >
                {link.name}
              </Link>
            ))}
          </nav>

          <div className="hidden lg:flex items-center">
            <Button
              onClick={onOpenForm}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-5 rounded-sm"
            >
              Get My Cash Offer <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="lg:hidden p-2 text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 top-[72px] z-40 bg-background overflow-y-auto border-t border-border flex flex-col px-4 py-6 h-[calc(100vh-72px)]">
          <div className="flex flex-col gap-2 flex-grow">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className={`text-2xl font-serif py-4 border-b border-border/50 transition-colors block ${
                  location === link.href ? "text-primary font-bold" : "text-foreground"
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.name}
              </Link>
            ))}
          </div>
          <div className="mt-8 pb-8">
            <Button
              onClick={() => {
                onOpenForm();
                setMobileMenuOpen(false);
              }}
              className="w-full bg-primary text-primary-foreground py-6 text-xl font-serif h-auto"
            >
              Get My Cash Offer
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
