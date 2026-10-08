'use client';

import { useState, useEffect, useRef } from 'react';

const categories = [
  {
    name: "Irrigation",
    image: "/landing/infrastructure-water.jpg",
  },
  {
    name: "Transport",
    image: "/landing/infrastructure-transport.jpg",
  },
  {
    name: "Power & Energy",
    image: "/landing/infrastructure-power.jpg",
  },
  {
    name: "Manufacturing",
    image: "/landing/infrastructure-manufacturing.jpg",
  },
  {
    name: "Oil, Gas & Hydrocarbons",
    image: "/landing/infrastructure-oil-gas.jpg",
  },
];

export function InfrastructureSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const cardsContainerRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(0);
  const lastScrollTime = useRef(0);

  // Keep ref synchronized with state for native wheel listener
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  // Hijack wheel events ONLY inside the cards container range
  useEffect(() => {
    const cardsEl = cardsContainerRef.current;
    if (!cardsEl) return;

    const handleWheel = (e: WheelEvent) => {
      // Ignore tiny micro-scrolls
      if (Math.abs(e.deltaY) < 14) return;

      const now = Date.now();
      const currentIdx = activeIndexRef.current;
      const isScrollingDown = e.deltaY > 0;

      if (isScrollingDown) {
        if (currentIdx < categories.length - 1) {
          // Scroll through cards instead of the page
          e.preventDefault();
          if (now - lastScrollTime.current > 700) {
            lastScrollTime.current = now;
            setActiveIndex(currentIdx + 1);
          }
        }
        // When on last card (currentIdx === 4), scrolling down continues normal page scroll
      } else {
        if (currentIdx > 0) {
          // Scroll through cards backwards instead of the page
          e.preventDefault();
          if (now - lastScrollTime.current > 700) {
            lastScrollTime.current = now;
            setActiveIndex(currentIdx - 1);
          }
        }
        // When on first card (currentIdx === 0), scrolling up continues normal page scroll
      }
    };

    cardsEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => cardsEl.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        
        {/* Section Heading */}
        <div className="text-center mb-14">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-slate-950 tracking-tight">
            Built for a More Sustainable Infrastructure Future
          </h2>
          <p className="text-base sm:text-lg text-slate-600 mt-2 max-w-3xl mx-auto leading-relaxed">
            From dams and highways to power, manufacturing and energy systems — TraceESG supports MEIL&apos;s diverse portfolio with a unified ESG data platform.
          </p>
        </div>

        {/* 5 Infrastructure Cards in Expanding Flexbox Accordion with decreased spacing */}
        <div
          ref={cardsContainerRef}
          className="flex items-stretch gap-1.5 sm:gap-2 h-[400px] sm:h-[460px] max-w-6xl mx-auto w-full"
        >
          {categories.map((cat, idx) => {
            const isActive = activeIndex === idx;

            return (
              <div
                key={idx}
                onClick={() => setActiveIndex(idx)}
                className={`group relative rounded-2xl overflow-hidden cursor-pointer select-none border border-slate-200/80 shadow-sm hover:shadow-md ${
                  isActive ? "active" : ""
                }`}
                style={{
                  flex: isActive ? "6 1 0%" : "1 1 0%",
                  transition: "flex 0.85s cubic-bezier(0.16, 1, 0.3, 1)",
                  backgroundImage: `url(${cat.image})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                {/* Subtle dark gradient overlay concentrated at the bottom for text legibility */}
                <div
                  className={`absolute inset-0 pointer-events-none transition-colors duration-700 ${
                    isActive
                      ? "bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-transparent"
                      : "bg-gradient-to-t from-slate-950/85 via-slate-950/50 to-slate-950/20"
                  }`}
                />

                {/* Animated Text Container: Vertical written top-to-bottom at bottom of closed card, unrolls ACW to bottom-left when open */}
                <div
                  className="absolute z-10 pointer-events-none whitespace-nowrap"
                  style={{
                    bottom: isActive ? "28px" : "110px",
                    left: isActive ? "28px" : "50%",
                    transform: isActive ? "translate(0, 0) rotate(0deg)" : "translate(-50%, 50%) rotate(90deg)",
                    transformOrigin: "center center",
                    transition:
                      "bottom 0.85s cubic-bezier(0.16, 1, 0.3, 1), left 0.85s cubic-bezier(0.16, 1, 0.3, 1), transform 0.85s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                >
                  <span className="inline-block font-bold text-white text-xs sm:text-sm lg:text-base tracking-wider uppercase drop-shadow-md select-none">
                    {cat.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Interactive Indicator Pills */}
        <div className="flex items-center justify-center gap-2 mt-6">
          {categories.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveIndex(idx)}
              aria-label={`Go to slide ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all duration-500 cursor-pointer ${
                activeIndex === idx
                  ? "w-8 bg-slate-900"
                  : "w-2 bg-slate-300 hover:bg-slate-400"
              }`}
            />
          ))}
        </div>

      </div>
    </section>
  );
}
