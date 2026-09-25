import { Navbar } from "@/components/maxxen/Navbar";
import { Hero } from "@/components/maxxen/Hero";
import VelocityTicker from "@/components/maxxen/motion/VelocityTicker";
import LogoMarquee from "@/components/maxxen/LogoMarquee";
import StatsStrip from "@/components/maxxen/StatsStrip";
import { ProductSection } from "@/components/maxxen/ProductSection";
import { Testimonial } from "@/components/maxxen/Testimonial";
import MiniTestimonials from "@/components/maxxen/MiniTestimonials";
import { HowItWorks } from "@/components/maxxen/HowItWorks";
import { SecuritySection } from "@/components/maxxen/SecuritySection";
import { FaqSection } from "@/components/maxxen/FaqSection";
import { ProductPhilosophy } from "@/components/maxxen/ProductPhilosophy";
import { FinalCTA } from "@/components/maxxen/FinalCTA";
import { Footer } from "@/components/maxxen/Footer";
import Preloader from "@/components/maxxen/motion/Preloader";
import CustomCursor from "@/components/maxxen/motion/CustomCursor";
import Starfield from "@/components/maxxen/motion/Starfield";
import ScrollProgress from "@/components/maxxen/ScrollProgress";

/**
 * MAXXEN — Build something remarkable. (Y2K liquid-chrome edition)
 *
 * Global chrome layers first (preloader curtain, custom cursor, starfield,
 * scroll progress), then the section run:
 * Hero → VelocityTicker → LogoMarquee → StatsStrip → Product → Testimonial →
 * MiniTestimonials → How it works → Security → FAQ → Philosophy → FinalCTA.
 *
 * Note: the root div intentionally carries no background — <body> paints the
 * black canvas so the fixed -z-10 Starfield stays visible behind everything.
 */
export default function Home() {
  return (
    <div className="flex min-h-screen flex-col text-foreground">
      <Preloader />
      <CustomCursor />
      <Starfield />
      <ScrollProgress />
      <Navbar />
      <main className="flex-1">
        <Hero />
        <VelocityTicker />
        <LogoMarquee />
        <StatsStrip />
        <ProductSection />
        <Testimonial />
        <MiniTestimonials />
        <HowItWorks />
        <SecuritySection />
        <FaqSection />
        <ProductPhilosophy />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
