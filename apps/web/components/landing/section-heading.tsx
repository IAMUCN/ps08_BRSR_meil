import { BlurFade } from "@/components/ui/blur-fade";

export function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <BlurFade inView className="mx-auto mb-8 sm:mb-12 max-w-2xl text-center">
      <p className="mb-2 sm:mb-3 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.14em] text-[#313490]">
        {eyebrow}
      </p>
      <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 leading-tight">
        {title}
      </h2>
      {children && (
        <p className="mt-2.5 sm:mt-3 text-sm sm:text-base lg:text-lg leading-relaxed text-slate-600">
          {children}
        </p>
      )}
    </BlurFade>
  );
}
