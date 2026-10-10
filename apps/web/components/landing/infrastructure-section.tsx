"use client";

import { useState, useEffect, useRef } from "react";

const categories = [
  {
    name: "IRRIGATION",
    image: "/landing/infrastructure-water.jpg",
  },
  {
    name: "TRANSPORT",
    image: "/landing/infrastructure-transport.jpg",
  },
  {
    name: "POWER & ENERGY",
    image: "/landing/infrastructure-power.jpg",
  },
  {
    name: "MANUFACTURING",
    image: "/landing/infrastructure-manufacturing.jpg",
  },
  {
    name: "OIL, HYDROCARBONS",
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

    cardsEl.addEventListener("wheel", handleWheel, { passive: false });
    return () => cardsEl.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <section id="infrastructure" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        {/* Section Heading */}
        <div className="text-center mb-14">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-slate-950 tracking-tight">
            Built for a More Sustainable Infrastructure Future
          </h2>
          <p className="text-base sm:text-lg text-slate-600 mt-2 max-w-3xl mx-auto leading-relaxed">
            From dams and highways to power, manufacturing and energy systems — TraceESG supports
            MEIL&apos;s diverse portfolio with a unified ESG data platform.
          </p>
        </div>

        {/* 5 Infrastructure Cards in Expanding Flexbox Accordion with decreased spacing */}
        <div
          ref={cardsContainerRef}
          className="infrastructure-cards-container flex items-stretch gap-1.5 sm:gap-2 h-[400px] sm:h-[460px] max-w-6xl mx-auto w-full"
          style={{
            ["--card-text-bottom" as string]: "28px",
          }}
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
                {/* Subtle bottom gradient: Appears only when the card opens for text legibility */}
                <div
                  className={`absolute bottom-0 left-0 right-0 h-32 sm:h-36 pointer-events-none transition-opacity duration-700 bg-gradient-to-t from-slate-950/80 via-slate-950/35 to-transparent ${
                    isActive ? "opacity-100" : "opacity-0"
                  }`}
                />
                <div
                  className="absolute z-10 pointer-events-none whitespace-nowrap"
                  style={{
                    bottom: "var(--card-text-bottom, 28px)",
                    left: isActive ? "28px" : "calc(50% + 7px)",
                    transform: isActive
                      ? "rotate(0deg) translate(0, 0)"
                      : "rotate(90deg) translate(-100%, 0)",
                    transformOrigin: "0 0",
                    transition:
                      "left 0.85s cubic-bezier(0.16, 1, 0.3, 1), transform 0.85s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                >
                  <span className="inline-block font-bold text-white text-xs sm:text-sm lg:text-base tracking-wider uppercase drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] select-none leading-none">
                    {cat.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile Pagination Indicator Dots */}
        <div className="sm:hidden flex items-center justify-center gap-2 mt-4">
          {categories.map((cat, idx) => (
            <button
              key={idx}
              onClick={() => setActiveIndex(idx)}
              className={`h-2 rounded-full transition-all duration-300 ${
                activeIndex === idx ? "w-6 bg-[#313490]" : "w-2 bg-slate-300"
              }`}
              aria-label={`Select ${cat.name}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
