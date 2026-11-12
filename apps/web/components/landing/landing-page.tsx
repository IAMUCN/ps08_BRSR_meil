import "@/app/landing.css";
import { LandingNavbar } from "@/components/landing/navbar";
import { HeroSection } from "@/components/landing/hero-section";
import { TrustBadgesSection } from "@/components/landing/trust-badges-section";
import { ProblemSection } from "@/components/landing/problem-section";
import { ProcessStepsSection } from "@/components/landing/process-steps-section";
import { ProductInActionSection } from "@/components/landing/product-in-action-section";
import { TraceabilitySection } from "@/components/landing/traceability-section";
import { ContributorsSection } from "@/components/landing/contributors-section";
import { PerformanceSection } from "@/components/landing/performance-section";
import { SecuritySection } from "@/components/landing/security-section";
import { WhatIsBrsrSection } from "@/components/landing/what-is-brsr-section";
import { FaqSection } from "@/components/landing/faq-section";
import { InfrastructureSection } from "@/components/landing/infrastructure-section";
import { CtaFooterSection } from "@/components/landing/cta-footer-section";
import { MotionProvider } from "@/components/landing/motion-provider";

export function LandingPage() {
  return (
    <MotionProvider>
      <div className="landing-page min-h-screen overflow-x-clip bg-white font-sans text-slate-900">
        <LandingNavbar />
        <main id="main-content" tabIndex={-1} className="outline-none">
          <HeroSection />
          <TrustBadgesSection />
          <ProblemSection />
          <ProcessStepsSection />
          <ProductInActionSection />
          <TraceabilitySection />
          <ContributorsSection />
          <PerformanceSection />
          <SecuritySection />
          <WhatIsBrsrSection />
          <FaqSection />
          <InfrastructureSection />
        </main>
        <CtaFooterSection />
      </div>
    </MotionProvider>
  );
}
