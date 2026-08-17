import { Link } from "wouter";
import { useState, useEffect } from "react";
import { Menu, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navbar({ onOpenForm }: { onOpenForm: () => void }) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { name: "How It Works", href: "/#how-it-works" },
    { name: "Why Us", href: "/#why-us" },
    { name: "Properties", href: "/#properties" },
    { name: "FAQ", href: "/#faq" },
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
            <span className="font-serif text-xl md:text-2xl font-bold tracking-wider uppercase">
              Rehman INC
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.name}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center">
            <Button
              onClick={onOpenForm}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-5 rounded-sm"
            >
              Get My Cash Offer <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden p-2 text-foreground"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-background border-b border-border shadow-lg py-4 px-4 flex flex-col gap-4">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              className="text-lg font-medium text-foreground py-2 border-b border-border/50"
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.name}
            </a>
          ))}
          <Button
            onClick={() => {
              onOpenForm();
              setMobileMenuOpen(false);
            }}
            className="mt-2 w-full bg-primary text-primary-foreground py-6 text-lg"
          >
            Get My Cash Offer
          </Button>
        </div>
      )}
    </header>
  );
}
