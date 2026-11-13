# EmeilSG landing page — design brief (from Antigravity handoff)

Role: lead frontend/UI engineer for the EmeilSG landing page (MEIL BRSR platform). Goal: refine, elevate and
polish — visual polish, thoughtful motion (`motion/react` + CSS, no layout shift), responsive balance
(mobile/tablet/ultra-wide), consistency with the existing palette and custom cursor.

## Business context
MEIL: irrigation & water, transport & highways, power & renewables, heavy manufacturing, oil & gas.
EmeilSG is evidence-first: upload source documents → OCR/LLM extraction with confidence → human verification →
deterministic Scope 1/2/3 engines → BRSR indicator mapping and reports.

## Design system
- Tone: authoritative, trustworthy, clean B2B SaaS (Vercel/Linear polish meets enterprise sustainability).
- Colors: navy `#0f172a`; MEIL indigo `#313490` (brand, accents, cursor); action red `#E91029` / `#dc2626` (CTAs);
  green `#16a34a` / `#10b981` (verified); neutrals `#ffffff`, `#f8fafc`, border `#e2e8f0`.
- Type: Inter (UI), Lora (editorial headings), JetBrains Mono (metrics, units).
- Custom SVG cursor sitewide: indigo arrow (default), blue glow (hover), I-beam (inputs), red prohibition (disabled);
  native cursor suppressed. Do not break it.

## Stack
Next.js 16 App Router + Turbopack, React 19, Tailwind v4, `motion/react`, Magic UI (`Pointer`, `Dock`),
`lucide-react`. Server Components by default; `"use client"` only where needed.

## Files
- Entry: `apps/web/app/page.tsx` (redirects signed-in users), `layout.tsx` (fonts, `CustomCursor`, toaster),
  `globals.css`, `landing.css` (keyframes, card deck).
- Sections in `apps/web/components/landing/`, in order: `landing-page.tsx` (assembler), `navbar.tsx` +
  `navbar-dock.tsx`, `hero-section.tsx`, `trust-badges-section.tsx`, `what-is-brsr-section.tsx`,
  `process-steps-section.tsx`, `product-in-action-section.tsx`, `capability-card.tsx` + `performance-section.tsx`,
  `contributors-section.tsx`, `infrastructure-section.tsx`, `cta-footer-section.tsx`.
- UI: `components/ui/custom-cursor.tsx`, `components/ui/button.tsx`, `registry/magicui/pointer.tsx`,
  `registry/magicui/dock.tsx`.
