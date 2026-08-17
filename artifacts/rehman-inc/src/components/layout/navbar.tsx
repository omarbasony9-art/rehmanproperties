import { Link, useLocation } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";
import { Menu, X, ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

// "Why Us" dropdown items
const WHY_US_ITEMS = [
  { name: "Why Rehman INC", href: "/why-us" },
  { name: "FAQ", href: "/faq" },
];

export function Navbar({ onOpenForm }: { onOpenForm: () => void }) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [whyUsExpanded, setWhyUsExpanded] = useState(false); // mobile
  const [dropdownOpen, setDropdownOpen] = useState(false);   // desktop
  const [location] = useLocation();

  // Ref-based close timer so mouse can travel from trigger → dropdown
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openDropdown = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setDropdownOpen(true);
  }, []);

  const scheduleClose = useCallback(() => {
    closeTimer.current = setTimeout(() => setDropdownOpen(false), 150);
  }, []);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close everything on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setWhyUsExpanded(false);
    setDropdownOpen(false);
  }, [location]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest("[data-whyus-dropdown]")) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [dropdownOpen]);

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  // A link is "why-us-active" if on /why-us or /faq
  const isWhyUsActive = isActive("/why-us") || isActive("/faq");

  const mainLinks = [
    { name: "Home", href: "/" },
    { name: "Sell Your House", href: "/sell-your-house" },
    { name: "How It Works", href: "/how-it-works" },
    // "Why Us" is handled separately (dropdown)
    { name: "Properties", href: "/properties" },
    { name: "Contact", href: "/contact" },
  ];

  // Mobile flat links — Why Us section rendered separately inline
  const mobileLinksBeforeWhyUs = mainLinks.slice(0, 3); // Home, Sell, How It Works
  const mobileLinksAfterWhyUs  = mainLinks.slice(3);    // Properties, Contact

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

            {/* ── Desktop Nav ── */}
            <nav className="hidden lg:flex items-center gap-0.5 mx-6 xl:mx-10">

              {/* Links before Why Us */}
              {mainLinks.slice(0, 3).map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`relative px-3 xl:px-4 py-2 text-[13px] xl:text-sm font-medium tracking-wide transition-colors duration-150 rounded-sm whitespace-nowrap ${
                    isActive(link.href) ? "text-white" : "text-white/65 hover:text-white"
                  }`}
                >
                  {link.name}
                  {isActive(link.href) && (
                    <span className="absolute bottom-0 left-3 xl:left-4 right-3 xl:right-4 h-[2px] bg-primary rounded-full" />
                  )}
                </Link>
              ))}

              {/* Why Us dropdown trigger */}
              <div
                className="relative"
                data-whyus-dropdown
                onMouseEnter={openDropdown}
                onMouseLeave={scheduleClose}
              >
                <Link
                  href="/why-us"
                  className={`relative flex items-center gap-1 px-3 xl:px-4 py-2 text-[13px] xl:text-sm font-medium tracking-wide transition-colors duration-150 rounded-sm whitespace-nowrap select-none ${
                    isWhyUsActive ? "text-white" : "text-white/65 hover:text-white"
                  }`}
                >
                  Why Us
                  <ChevronDown
                    size={13}
                    strokeWidth={2.2}
                    className={`mt-px transition-transform duration-200 ${dropdownOpen ? "rotate-180" : "rotate-0"}`}
                  />
                  {isWhyUsActive && (
                    <span className="absolute bottom-0 left-3 xl:left-4 right-3 xl:right-4 h-[2px] bg-primary rounded-full" />
                  )}
                </Link>

                {/* Dropdown panel */}
                <div
                  data-whyus-dropdown
                  onMouseEnter={openDropdown}
                  onMouseLeave={scheduleClose}
                  className={`absolute top-full left-0 mt-1 w-48 transition-all duration-150 origin-top ${
                    dropdownOpen
                      ? "opacity-100 scale-y-100 pointer-events-auto"
                      : "opacity-0 scale-y-95 pointer-events-none"
                  }`}
                  style={{ transformOrigin: "top center" }}
                >
                  {/* Bridge gap so mouse can travel from trigger to panel */}
                  <div className="h-1 w-full" />
                  <div className="bg-[hsl(220,18%,9%)] border border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
                    {WHY_US_ITEMS.map((item, i) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-2 px-4 py-3 text-[13px] font-medium tracking-wide transition-colors duration-150 group ${
                          i < WHY_US_ITEMS.length - 1 ? "border-b border-white/8" : ""
                        } ${
                          isActive(item.href)
                            ? "text-primary bg-white/4"
                            : "text-white/75 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <span
                          className={`w-1 h-1 rounded-full flex-shrink-0 transition-colors duration-150 ${
                            isActive(item.href) ? "bg-primary" : "bg-white/25 group-hover:bg-primary"
                          }`}
                        />
                        {item.name}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>

              {/* Links after Why Us */}
              {mainLinks.slice(3).map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`relative px-3 xl:px-4 py-2 text-[13px] xl:text-sm font-medium tracking-wide transition-colors duration-150 rounded-sm whitespace-nowrap ${
                    isActive(link.href) ? "text-white" : "text-white/65 hover:text-white"
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

      {/* ── Mobile Menu ── */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-[hsl(220,20%,5%)] flex flex-col">
          {/* Mobile Header */}
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

              {/* Links before Why Us */}
              {mobileLinksBeforeWhyUs.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between py-4 border-b border-white/10 text-lg font-medium transition-colors ${
                    isActive(link.href) ? "text-primary" : "text-white/75 hover:text-white"
                  }`}
                >
                  {link.name}
                  <ArrowRight
                    size={16}
                    className={`opacity-40 ${isActive(link.href) ? "text-primary opacity-100" : ""}`}
                  />
                </Link>
              ))}

              {/* Why Us — expandable */}
              <div className="border-b border-white/10">
                {/* Why Us trigger row */}
                <button
                  onClick={() => setWhyUsExpanded((v) => !v)}
                  className={`w-full flex items-center justify-between py-4 text-lg font-medium transition-colors ${
                    isWhyUsActive ? "text-primary" : "text-white/75 hover:text-white"
                  }`}
                >
                  <Link
                    href="/why-us"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMobileMenuOpen(false);
                    }}
                    className="flex-1 text-left"
                  >
                    Why Us
                  </Link>
                  <ChevronDown
                    size={18}
                    strokeWidth={2}
                    className={`transition-transform duration-200 ml-2 ${whyUsExpanded ? "rotate-180" : "rotate-0"} ${
                      isWhyUsActive ? "text-primary opacity-100" : "opacity-40"
                    }`}
                  />
                </button>

                {/* Sub-items */}
                {whyUsExpanded && (
                  <div className="pb-2 pl-4 flex flex-col gap-0">
                    {WHY_US_ITEMS.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 py-3 text-base font-medium transition-colors border-t border-white/6 ${
                          isActive(item.href)
                            ? "text-primary"
                            : "text-white/60 hover:text-white"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            isActive(item.href) ? "bg-primary" : "bg-white/30"
                          }`}
                        />
                        {item.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Links after Why Us */}
              {mobileLinksAfterWhyUs.map((link, i) => (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between py-4 text-lg font-medium transition-colors ${
                    i < mobileLinksAfterWhyUs.length - 1 ? "border-b border-white/10" : "border-transparent"
                  } ${
                    isActive(link.href) ? "text-primary" : "text-white/75 hover:text-white"
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
