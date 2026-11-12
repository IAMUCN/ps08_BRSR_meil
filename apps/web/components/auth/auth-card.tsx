import type { ReactNode } from "react";
import { LogoWordmark } from "@/components/brand/logo-mark";

/** Centered card used by the public auth screens (03_APP_FLOW.md §2.1). */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex flex-1 items-center justify-center p-6 outline-none"
    >
      <div className="w-full max-w-sm rounded-md border bg-card p-6 text-card-foreground">
        <p>
          <LogoWordmark className="h-6 w-auto" />
          <span className="sr-only">EmeilSG</span>
        </p>
        <h1 className="mt-1 text-2xl leading-8 font-semibold">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
        ) : null}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

const noticeTone = {
  info: "border-border bg-muted text-foreground",
  error: "border-destructive/40 bg-destructive/10 text-foreground",
} as const;

export function AuthNotice({
  tone,
  children,
}: {
  tone: keyof typeof noticeTone;
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`mb-4 rounded-sm border px-3 py-2 text-sm leading-5 ${noticeTone[tone]}`}
    >
      {children}
    </p>
  );
}
