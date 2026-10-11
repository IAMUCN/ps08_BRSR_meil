import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** UI brief §15.2: short explanation plus the next action, 48px line icon, never a bare "No data". */
export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
  link,
  nested,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
  action?: ReactNode;
  /** The usual next action: a page to go to. */
  link?: { href: string; label: string };
  /** Shown beneath the page's own header: the title is then a second-level heading, not the page's. */
  nested?: boolean;
}) {
  const Heading = nested ? "h2" : "h1";
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <Icon className="size-12 text-muted-foreground" strokeWidth={1.5} aria-hidden />
      <Heading className="text-xl leading-7 font-semibold">{title}</Heading>
      <p className="max-w-sm text-sm leading-5 text-muted-foreground">{message}</p>
      {action}
      {link ? (
        <Button asChild variant="outline">
          <Link href={link.href}>{link.label}</Link>
        </Button>
      ) : null}
    </div>
  );
}
