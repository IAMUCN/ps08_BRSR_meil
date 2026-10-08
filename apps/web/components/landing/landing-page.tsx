"use client";

import "@/app/landing.css";
import { LandingNavbar } from "@/components/landing/navbar";
import { HeroSection } from "@/components/landing/hero-section";
import { WhatIsBrsrSection } from "@/components/landing/what-is-brsr-section";
import { TrustBadgesSection } from "@/components/landing/trust-badges-section";
import { ProcessStepsSection } from "@/components/landing/process-steps-section";
import { ProductInActionSection } from "@/components/landing/product-in-action-section";
import { PerformanceSection } from "@/components/landing/performance-section";
import { ContributorsSection } from "@/components/landing/contributors-section";
import { InfrastructureSection } from "@/components/landing/infrastructure-section";
import { CtaFooterSection } from "@/components/landing/cta-footer-section";
import { AgentationToolbar } from "@/components/landing/agentation-toolbar";

export function LandingPage() {
  return (
    <div className="landing-page bg-white text-slate-900 font-sans min-h-screen">
      <AgentationToolbar />
      <LandingNavbar />
      <main>
        <HeroSection />
        <WhatIsBrsrSection />
        <TrustBadgesSection />
        <ProcessStepsSection />
        <ProductInActionSection />
        <PerformanceSection />
        <ContributorsSection />
        <InfrastructureSection />
      </main>
      <CtaFooterSection />
    </div>
  );
}
