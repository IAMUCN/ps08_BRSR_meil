import Image from "next/image";

/**
 * Tracey AI chatbot avatar (owner's SVG asset: `chatbot_logo.svg`).
 * Rendered in both mobile and desktop floating action buttons and in the chat panel header.
 */
export function TraceyMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/chatbot-logo.svg"
      alt=""
      aria-hidden="true"
      width={48}
      height={48}
      priority
      className={
        className
          ? `${className} object-contain select-none pointer-events-none`
          : "size-8 object-contain select-none pointer-events-none"
      }
    />
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
