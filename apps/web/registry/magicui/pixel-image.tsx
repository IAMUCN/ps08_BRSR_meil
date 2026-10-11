/* eslint-disable react-hooks/set-state-in-effect -- vendored Magic UI component */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Grid = {
  rows: number;
  cols: number;
};

const DEFAULT_GRIDS: Record<string, Grid> = {
  "6x4": { rows: 4, cols: 6 },
  "8x8": { rows: 8, cols: 8 },
  "8x3": { rows: 3, cols: 8 },
  "4x6": { rows: 6, cols: 4 },
  "3x8": { rows: 8, cols: 3 },
};

type PredefinedGridKey = keyof typeof DEFAULT_GRIDS;

export interface PixelImageProps {
  src: string;
  alt?: string;
  grid?: PredefinedGridKey;
  customGrid?: Grid;
  grayscaleAnimation?: boolean;
  pixelFadeInDuration?: number; // in ms
  maxAnimationDelay?: number; // in ms
  colorRevealDelay?: number; // in ms
  className?: string;
  imgClassName?: string;
}

// Deterministic pseudo-random generator to avoid random shifts
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

export const PixelImage = ({
  src,
  alt = "Pixel image",
  grid = "6x4",
  grayscaleAnimation = true,
  pixelFadeInDuration = 1000,
  maxAnimationDelay = 1200,
  colorRevealDelay = 1300,
  customGrid,
  className,
  imgClassName,
}: PixelImageProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [showColor, setShowColor] = useState(false);

  const MIN_GRID = 1;
  const MAX_GRID = 16;

  const { rows, cols } = useMemo(() => {
    const isValidGrid = (gridConfig?: Grid) => {
      if (!gridConfig) return false;
      const { rows, cols } = gridConfig;
      return (
        Number.isInteger(rows) &&
        Number.isInteger(cols) &&
        rows >= MIN_GRID &&
        cols >= MIN_GRID &&
        rows <= MAX_GRID &&
        cols <= MAX_GRID
      );
    };

    return isValidGrid(customGrid) ? customGrid! : (DEFAULT_GRIDS[grid] ?? { rows: 4, cols: 6 });
  }, [customGrid, grid]);

  // Client-side mount flag to prevent SSR hydration mismatches
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Trigger animation once mounted and intersected
  useEffect(() => {
    if (!isMounted) return;
    const el = containerRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      const colorTimeout = setTimeout(() => {
        setShowColor(true);
      }, colorRevealDelay);
      return () => clearTimeout(colorTimeout);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          setTimeout(() => {
            setShowColor(true);
          }, colorRevealDelay);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, [isMounted, colorRevealDelay]);

  const pieces = useMemo(() => {
    const total = rows * cols;
    return Array.from({ length: total }, (_, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;

      const left = Math.round((col * 10000) / cols) / 100;
      const right = Math.round(((col + 1) * 10000) / cols) / 100;
      const top = Math.round((row * 10000) / rows) / 100;
      const bottom = Math.round(((row + 1) * 10000) / rows) / 100;

      const clipPath = `polygon(${left}% ${top}%, ${right}% ${top}%, ${right}% ${bottom}%, ${left}% ${bottom}%)`;
      const delay = Math.round(pseudoRandom(index) * maxAnimationDelay);

      return {
        clipPath,
        delay,
      };
    });
  }, [rows, cols, maxAnimationDelay]);

  // SSR and initial hydration fallback: simple clean image to ensure zero hydration mismatch
  if (!isMounted) {
    return (
      <div
        ref={containerRef}
        className={cn(
          "relative select-none",
          className ?? "h-72 w-72 md:h-96 md:w-96 rounded-[2.5rem] overflow-hidden",
        )}
      >
        <img
          src={src}
          alt={alt}
          className={cn(
            "w-full h-full object-cover",
            imgClassName,
            grayscaleAnimation ? "grayscale" : "",
          )}
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative select-none",
        className ?? "h-72 w-72 md:h-96 md:w-96 rounded-[2.5rem] overflow-hidden",
      )}
    >
      {pieces.map((piece, index) => (
        <div
          key={index}
          className={cn(
            "absolute inset-0 transition-all ease-out",
            isVisible ? "opacity-100" : "opacity-0",
          )}
          style={{
            clipPath: piece.clipPath,
            transitionDelay: `${piece.delay}ms`,
            transitionDuration: `${pixelFadeInDuration}ms`,
          }}
        >
          <img
            src={src}
            alt={`${alt} piece ${index + 1}`}
            className={cn(
              "w-full h-full object-cover",
              imgClassName,
              grayscaleAnimation && (showColor ? "grayscale-0" : "grayscale"),
            )}
            style={{
              transition: grayscaleAnimation
                ? `filter ${pixelFadeInDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`
                : "none",
            }}
            draggable={false}
          />
        </div>
      ))}
    </div>
  );
};
