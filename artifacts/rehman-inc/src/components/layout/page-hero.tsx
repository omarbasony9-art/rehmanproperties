import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

/* ─────────────────────────────────────────────
   Shared types
   ───────────────────────────────────────────── */
interface HeroBase {
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  children?: React.ReactNode;      // extra content injected below the description
}

/* ─────────────────────────────────────────────
   STYLE A — SPLIT HERO
   Dark left column (text) + property photo right
   Use for: Sell Your House, Why Us
   ───────────────────────────────────────────── */
interface SplitPageHeroProps extends HeroBase {
  image: string;
  imageAlt?: string;
  /** Flip image to the left side */
  imageLeft?: boolean;
}

export function SplitPageHero({
  eyebrow,
  title,
  description,
  ctaLabel,
  onCtaClick,
  image,
  imageAlt = "Property",
  imageLeft = false,
  children,
}: SplitPageHeroProps) {
  const textCol = (
    <div className="flex flex-col justify-center py-16 md:py-20 px-6 md:px-12 lg:px-16 max-w-2xl">
      <span className="text-primary text-xs font-semibold tracking-[0.18em] uppercase mb-5 block">
        {eyebrow}
      </span>
      <h1
        className="font-serif font-bold text-white leading-[1.1] mb-6"
        style={{ fontSize: "clamp(42px, 4.5vw, 68px)" }}
      >
        {title}
      </h1>
      <p className="text-white/60 leading-relaxed mb-8 max-w-lg" style={{ fontSize: "clamp(17px, 1.3vw, 20px)" }}>
        {description}
      </p>
      {children}
      {ctaLabel && onCtaClick && !children && (
        <div>
          <Button
            onClick={onCtaClick}
            size="lg"
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 h-12 rounded-sm tracking-wide shadow-lg shadow-primary/20"
          >
            {ctaLabel}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );

  const imageCol = (
    <div className="relative hidden md:block min-h-[420px] md:min-h-0">
      {/* Thin green vertical accent */}
      <div
        className={`absolute top-0 bottom-0 z-10 w-[3px] bg-primary ${imageLeft ? "right-0" : "left-0"}`}
      />
      <img
        src={image}
        alt={imageAlt}
        className="absolute inset-0 w-full h-full object-cover"
      />
      {/* Gradient fade toward text */}
      <div
        className={`absolute inset-0 ${
          imageLeft
            ? "bg-gradient-to-l from-[hsl(220,20%,5%)] via-[hsl(220,20%,5%)]/0 to-transparent"
            : "bg-gradient-to-r from-[hsl(220,20%,5%)] via-[hsl(220,20%,5%)]/0 to-transparent"
        }`}
      />
    </div>
  );

  return (
    <section className="bg-[hsl(220,20%,5%)] pt-20 overflow-hidden">
      <div className="grid md:grid-cols-[1fr_42%] min-h-[460px] md:min-h-[520px]">
        {imageLeft ? (
          <>
            {imageCol}
            {textCol}
          </>
        ) : (
          <>
            {textCol}
            {imageCol}
          </>
        )}
      </div>
      {/* Bottom rule */}
      <div className="h-px bg-white/8" />
    </section>
  );
}

/* ─────────────────────────────────────────────
   STYLE B — EDITORIAL HERO
   Dark full-width, left-aligned, architectural depth
   Use for: How It Works, FAQ
   ───────────────────────────────────────────── */
interface EditorialPageHeroProps extends HeroBase {
  /** Optional background image (faded) */
  bgImage?: string;
  /** Show geometric line decoration on the right */
  showLines?: boolean;
}

export function EditorialPageHero({
  eyebrow,
  title,
  description,
  ctaLabel,
  onCtaClick,
  bgImage,
  showLines = true,
  children,
}: EditorialPageHeroProps) {
  return (
    <section className="relative bg-[hsl(220,20%,4%)] pt-20 overflow-hidden">
      {/* Background photo (very faded) */}
      {bgImage && (
        <div className="absolute inset-0 pointer-events-none">
          <img src={bgImage} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.07]" aria-hidden />
          <div className="absolute inset-0 bg-gradient-to-r from-[hsl(220,20%,4%)] via-[hsl(220,20%,4%)]/70 to-transparent" />
        </div>
      )}

      {/* Geometric lines decoration */}
      {showLines && (
        <div className="absolute right-0 top-0 bottom-0 w-64 pointer-events-none hidden lg:block" aria-hidden>
          {/* Vertical rule */}
          <div className="absolute right-32 top-0 bottom-0 w-px bg-white/4" />
          <div className="absolute right-16 top-0 bottom-0 w-px bg-primary/20" />
          <div className="absolute right-0 top-0 bottom-0 w-px bg-white/4" />
          {/* Horizontal crossbar */}
          <div className="absolute bottom-0 right-0 w-full h-px bg-white/8" />
        </div>
      )}

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 md:px-12 lg:px-16 py-20 md:py-28">
        <div className="max-w-3xl">
          {/* Green top accent line */}
          <div className="w-10 h-[3px] bg-primary mb-8" />

          <span className="text-primary text-xs font-semibold tracking-[0.18em] uppercase mb-5 block">
            {eyebrow}
          </span>
          <h1
            className="font-serif font-bold text-white leading-[1.1] mb-6"
            style={{ fontSize: "clamp(42px, 4.5vw, 68px)" }}
          >
            {title}
          </h1>
          <p className="text-white/55 leading-relaxed max-w-xl mb-8" style={{ fontSize: "clamp(17px, 1.3vw, 20px)" }}>
            {description}
          </p>
          {children}
          {ctaLabel && onCtaClick && !children && (
            <Button
              onClick={onCtaClick}
              variant="outline"
              size="lg"
              className="border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground font-semibold px-8 h-12 rounded-sm tracking-wide"
            >
              {ctaLabel}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="h-px bg-white/8" />
    </section>
  );
}

/* ─────────────────────────────────────────────
   STYLE C — LIGHT HERO
   Warm off-white background, dark headline
   Use for: Properties, Contact
   ───────────────────────────────────────────── */
interface LightPageHeroProps extends HeroBase {
  /** Optional side image */
  image?: string;
  imageAlt?: string;
}

export function LightPageHero({
  eyebrow,
  title,
  description,
  ctaLabel,
  onCtaClick,
  image,
  imageAlt = "Property",
  children,
}: LightPageHeroProps) {
  return (
    <section className="bg-[hsl(40,20%,96%)] pt-20 border-b border-border overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-16">
        <div className={`grid ${image ? "md:grid-cols-[1fr_auto]" : ""} gap-8 items-end py-16 md:py-24`}>
          <div className="max-w-2xl">
            {/* Horizontal green accent */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-6 h-[2px] bg-primary" />
              <span className="text-primary text-xs font-semibold tracking-[0.18em] uppercase">
                {eyebrow}
              </span>
            </div>
            <h1
              className="font-serif font-bold text-foreground leading-[1.1] mb-6"
              style={{ fontSize: "clamp(42px, 4.5vw, 68px)" }}
            >
              {title}
            </h1>
            <p className="text-foreground/60 leading-relaxed max-w-xl mb-8" style={{ fontSize: "clamp(17px, 1.3vw, 20px)" }}>
              {description}
            </p>
            {children}
            {ctaLabel && onCtaClick && !children && (
              <Button
                onClick={onCtaClick}
                size="lg"
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 h-12 rounded-sm tracking-wide"
              >
                {ctaLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>

          {image && (
            <div className="hidden lg:block w-72 xl:w-80 aspect-[4/3] rounded-sm overflow-hidden relative self-end">
              <img src={image} alt={imageAlt} className="w-full h-full object-cover" />
              {/* Gold accent corner */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-[hsl(40,60%,50%)]" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
