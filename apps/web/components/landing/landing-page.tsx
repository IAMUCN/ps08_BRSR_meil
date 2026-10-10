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
        {/* 1. Hero: Core Thesis & Interactive Capability Roll */}
        <HeroSection />

        {/* 2. Enterprise Context: MEIL 5 Heavy Infrastructure Verticals (Dams, Highways, Energy, Manufacturing, Hydrocarbons) */}
        <InfrastructureSection />

        {/* 3. Regulatory Alignment & Evidence-First Architecture */}
        <WhatIsBrsrSection />

        {/* 4. Core System Pillars & Invariants */}
        <TrustBadgesSection />

        {/* 5. Evidence-to-BRSR Digital Thread Pipeline */}
        <ProcessStepsSection />

        {/* 6. Product in Action: Split-Pane Human Verification Interface */}
        <ProductInActionSection />

        {/* 7. Multi-Tier Governance: 6 Contributor Roles */}
        <ContributorsSection />

        {/* 8. Executive Monitoring: BRSR Readiness & Scope Consolidation */}
        <PerformanceSection />

        {/* Previous ordering preserved in comments for reference:
        <WhatIsBrsrSection />
        <TrustBadgesSection />
        <ProcessStepsSection />
        <ProductInActionSection />
        <PerformanceSection />
        <ContributorsSection />
        <InfrastructureSection />
        */}
      </main>
      <CtaFooterSection />
    </div>
  );
}
