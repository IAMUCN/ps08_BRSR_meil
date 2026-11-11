import { useId } from "react";

/**
 * The EmeilSG mark (owner's logo, 2026-11-11: `EmeilSG_Logo/EmeilSG_fanned_icon.svg`): three fanned documents,
 * the front one with a bar chart, and a red tick. The same drawing as `app/icon.svg` and
 * `public/brand/emeilsg-icon.svg`; keep them in step. Decorative by default — the name beside it is the
 * accessible label.
 */
export function LogoMark({ className }: { className?: string }) {
  // Gradient ids must be unique when the mark appears more than once on a page.
  const id = useId();
  const indigo = `${id}-indigo`;
  const red = `${id}-red`;
  const page = "M32 14H60L72 26V74Q72 80 66 80H32Q26 80 26 74V20Q26 14 32 14Z";
  const fold = "M60 14V22Q60 26 64 26H72Z";
  const front = "M32 16H60L72 28V76Q72 82 66 82H32Q26 82 26 76V22Q26 16 32 16Z";
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
      <g transform="rotate(-16 50 88)">
        <path d={page} fill="#8E8CDA" fillOpacity=".55" />
        <path d={fold} fill="#8E8CDA" />
      </g>
      <g transform="rotate(13 50 88)">
        <path d={page} fill={`url(#${indigo})`} />
        <path d={fold} fill="#8E8CDA" />
      </g>
      <path d={front} fill="#37358F" fillOpacity=".16" transform="translate(3 4)" />
      <path d={front} fill="#fff" stroke="#37358F" strokeWidth="4" strokeLinejoin="round" />
      <path d="M60 16V24Q60 28 64 28H72Z" fill="#8E8CDA" />
      <rect x="34" y="62" width="8" height="12" rx="2.5" fill="#8E8CDA" />
      <rect x="45" y="52" width="8" height="22" rx="2.5" fill={`url(#${indigo})`} />
      <rect x="56" y="42" width="8" height="32" rx="2.5" fill={`url(#${red})`} />
      <path
        d="M34 32H56M34 40H48"
        stroke="#8E8CDA"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="72" cy="78" r="13" fill="#EA102C" />
      <path
        d="M65.88 78L70.47 82.59L78.88 72.65"
        stroke="#fff"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * The EmeilSG wordmark (owner's logo, 2026-11-11: `EmeilSG_Logo/EmeilSG_title.svg`): "E" and "SG" in red,
 * "meil" in indigo, a red leaf for the dot of the i. Width follows the height (556 x 130). The link or heading
 * around it carries the name for screen readers.
 */
export function LogoWordmark({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- a small static SVG; next/image adds nothing here
  return <img src="/brand/emeilsg-wordmark.svg" alt="" className={className} draggable={false} />;
}
