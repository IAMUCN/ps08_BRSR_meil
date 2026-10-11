"use client";

import React, { useRef, type PropsWithChildren } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, MotionValue, useMotionValue, useSpring, useTransform } from "motion/react";
import type { MotionProps } from "motion/react";

import { cn } from "@/lib/utils";

export interface DockProps extends VariantProps<typeof dockVariants> {
  className?: string;
  iconSize?: number;
  iconMagnification?: number;
  disableMagnification?: boolean;
  iconDistance?: number;
  direction?: "top" | "middle" | "bottom";
  children: React.ReactNode;
}

const DEFAULT_SIZE = 40;
const DEFAULT_MAGNIFICATION = 60;
const DEFAULT_DISTANCE = 140;
const DEFAULT_DISABLEMAGNIFICATION = false;

const dockVariants = cva("mx-auto flex items-center justify-center", {
  variants: {
    variant: {
      default:
        "supports-backdrop-blur:bg-white/10 supports-backdrop-blur:dark:bg-black/10 h-[58px] w-max gap-2 rounded-2xl border p-2 backdrop-blur-md",
      bare: "w-auto bg-transparent border-none p-0 shadow-none",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

const Dock = React.forwardRef<HTMLDivElement, DockProps>(
  (
    {
      className,
      children,
      iconSize = DEFAULT_SIZE,
      iconMagnification = DEFAULT_MAGNIFICATION,
      disableMagnification = DEFAULT_DISABLEMAGNIFICATION,
      iconDistance = DEFAULT_DISTANCE,
      direction = "middle",
      variant,
      ...props
    },
    ref,
  ) => {
    const mouseX = useMotionValue(Infinity);

    const renderChildren = () => {
      return React.Children.map(children, (child) => {
        if (React.isValidElement<Record<string, unknown>>(child)) {
          return React.cloneElement(child, {
            ...child.props,
            mouseX: mouseX,
            size: iconSize,
            magnification: iconMagnification,
            disableMagnification: disableMagnification,
            distance: iconDistance,
          });
        }
        return child;
      });
    };

    return (
      <motion.div
        ref={ref}
        onMouseMove={(e) => mouseX.set(e.pageX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        {...props}
        className={cn(dockVariants({ variant, className }), {
          "items-start": direction === "top",
          "items-center": direction === "middle",
          "items-end": direction === "bottom",
        })}
      >
        {renderChildren()}
      </motion.div>
    );
  },
);

Dock.displayName = "Dock";

export interface DockIconProps extends Omit<
  MotionProps & React.HTMLAttributes<HTMLDivElement>,
  "children"
> {
  size?: number;
  magnification?: number;
  disableMagnification?: boolean;
  distance?: number;
  mouseX?: MotionValue<number>;
  className?: string;
  children?: React.ReactNode;
  props?: PropsWithChildren;
}

const DockIcon = ({
  size = DEFAULT_SIZE,
  magnification = DEFAULT_MAGNIFICATION,
  disableMagnification,
  distance = DEFAULT_DISTANCE,
  mouseX,
  className,
  children,
  ...props
}: DockIconProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const padding = Math.max(6, size * 0.2);
  const defaultMouseX = useMotionValue(Infinity);

  const distanceCalc = useTransform(mouseX ?? defaultMouseX, (val: number) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  const targetSize = disableMagnification ? size : magnification;

  const sizeTransform = useTransform(
    distanceCalc,
    [-distance, 0, distance],
    [size, targetSize, size],
  );

  const scaleSize = useSpring(sizeTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  return (
    <motion.div
      ref={ref}
      style={{ width: scaleSize, height: scaleSize, padding }}
      className={cn(
        "flex aspect-square cursor-pointer items-center justify-center rounded-full",
        disableMagnification && "hover:bg-muted-foreground transition-colors",
        className,
      )}
      {...props}
    >
      <div>{children}</div>
    </motion.div>
  );
};

DockIcon.displayName = "DockIcon";

export interface DockItemProps extends Omit<
  MotionProps & React.HTMLAttributes<HTMLDivElement>,
  "children"
> {
  distance?: number;
  maxScale?: number;
  mouseX?: MotionValue<number>;
  size?: number;
  magnification?: number;
  disableMagnification?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const DockItem = ({
  distance = DEFAULT_DISTANCE,
  maxScale = 1.18,
  mouseX,
  size,
  magnification,
  disableMagnification = false,
  className,
  children,
  ...props
}: DockItemProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const defaultMouseX = useMotionValue(Infinity);

  const distanceCalc = useTransform(mouseX ?? defaultMouseX, (val: number) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  const effectiveMaxScale = disableMagnification ? 1 : maxScale;

  const scaleTransform = useTransform(
    distanceCalc,
    [-distance, 0, distance],
    [1, effectiveMaxScale, 1],
  );

  const yTransform = useTransform(
    distanceCalc,
    [-distance, 0, distance],
    [0, disableMagnification ? 0 : -2, 0],
  );

  const scale = useSpring(scaleTransform, {
    mass: 0.1,
    stiffness: 160,
    damping: 14,
  });

  const y = useSpring(yTransform, {
    mass: 0.1,
    stiffness: 160,
    damping: 14,
  });

  return (
    <motion.div
      ref={ref}
      style={{ scale, y }}
      className={cn("cursor-pointer select-none origin-center", className)}
      {...props}
    >
      {children}
    </motion.div>
  );
};

DockItem.displayName = "DockItem";

export { Dock, DockIcon, DockItem, dockVariants };
