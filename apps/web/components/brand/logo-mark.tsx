import { useId } from "react";

/**
 * The EmeilSG mark: a document with lines and a bar chart, and a leaf in front of it. The same drawing as
 * the browser icon (`app/icon.svg`); keep the two in step. Decorative by default — the name beside it is the
 * accessible label.
 */
export function LogoMark({ className }: { className?: string }) {
  // Gradient ids must be unique when the mark appears more than once on a page.
  const id = useId();
  const leaf = `${id}-leaf`;
  const bars = `${id}-bars`;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={leaf} x1="0.2" y1="1" x2="0.9" y2="0">
          <stop offset="0" stopColor="#1F8A3B" />
          <stop offset="0.55" stopColor="#4CAF3D" />
          <stop offset="1" stopColor="#9BCB3C" />
        </linearGradient>
        <linearGradient id={bars} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#0B3A78" />
          <stop offset="1" stopColor="#1F7FA6" />
        </linearGradient>
      </defs>
      <path
        d="M15 5h20l12 12v33a6 6 0 0 1-6 6H15a6 6 0 0 1-6-6V11a6 6 0 0 1 6-6z"
        fill="#FFFFFF"
        stroke="#0B3A78"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M35 5v8a4 4 0 0 0 4 4h8"
        fill="none"
        stroke="#0B3A78"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
      <g fill="none" stroke="#1F7FA6" strokeWidth="3.2" strokeLinecap="round">
        <path d="M17 19h13" />
        <path d="M17 26h17" />
        <path d="M17 33h12" />
      </g>
      <g fill={`url(#${bars})`}>
        <rect x="16" y="42" width="5" height="8" rx="0.8" />
        <rect x="23" y="38" width="5" height="12" rx="0.8" />
        <rect x="30" y="33" width="5" height="17" rx="0.8" />
      </g>
      <path
        d="M27 60c9-1 17-5 22-12 5-8 8-17 11-29-11 2-20 6-25 15-4 7-2 14 2 18-3 4-6 6-10 8z"
        fill={`url(#${leaf})`}
        stroke="#FFFFFF"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M30 58c10-5 19-15 25-31"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
