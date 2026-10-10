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
    <BlurFade inView className="mx-auto mb-12 max-w-2xl text-center">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#313490]">
        {eyebrow}
      </p>
      <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        {title}
      </h2>
      {children && (
        <p className="mt-3 text-base leading-relaxed text-slate-600 sm:text-lg">{children}</p>
      )}
    </BlurFade>
  );
}
