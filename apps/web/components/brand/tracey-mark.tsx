import { useId } from "react";

/**
 * Tracey, the EmeilSG data analyst (owner's request, 2026-11-11). Her mark is drawn like the EmeilSG logo
 * (`components/brand/logo-mark.tsx`): the same indigo gradient, the three bars (lavender, indigo, red) and the
 * red tick circle, on a chat bubble instead of a document. Decorative; the name beside it is the label.
 */
export function TraceyMark({ className }: { className?: string }) {
  const id = useId();
  const indigo = `${id}-indigo`;
  const red = `${id}-red`;
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={indigo} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#37358F" />
          <stop offset="1" stopColor="#4B49B5" />
        </linearGradient>
        <linearGradient id={red} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#EA102C" />
          <stop offset="1" stopColor="#F2374D" />
        </linearGradient>
      </defs>
      {/* Shadow and bubble: a rounded rectangle with a tail at the lower left. */}
      <path
        d="M22 12H78Q90 12 90 24V58Q90 70 78 70H40L24 84V70H22Q10 70 10 58V24Q10 12 22 12Z"
        fill="#37358F"
        fillOpacity=".16"
        transform="translate(3 4)"
      />
      <path
        d="M22 12H78Q90 12 90 24V58Q90 70 78 70H40L24 84V70H22Q10 70 10 58V24Q10 12 22 12Z"
        fill={`url(#${indigo})`}
        stroke="#37358F"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* The logo's bars, on the bubble. */}
      <rect x="27" y="40" width="10" height="16" rx="3" fill="#8E8CDA" />
      <rect x="42" y="31" width="10" height="25" rx="3" fill="#fff" />
      <rect x="57" y="22" width="10" height="34" rx="3" fill={`url(#${red})`} />
      {/* The logo's red tick circle. */}
      <circle cx="76" cy="76" r="15" fill="#EA102C" stroke="#fff" strokeWidth="3" />
      <path
        d="M69 76L74 81L83.5 70.5"
        stroke="#fff"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * "Tracey" written like the EmeilSG title: bold, the first letter in the brand red on a light background. On the
 * app's coloured bars every letter takes the bar's text colour (`onBar`), as the title does there (owner's
 * decision, 2026-11-11), so the red never sits on the crimson Special theme.
 */
export function TraceyName({ className, onBar = false }: { className?: string; onBar?: boolean }) {
  return (
    <span className={className}>
      <span className={onBar ? undefined : "text-[#EA102C]"}>T</span>racey
    </span>
  );
}
