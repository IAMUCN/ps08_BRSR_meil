import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// UI brief §15.3: say what happened and what to do next. "/" sends a signed-in user to their own dashboard.
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md rounded-md border bg-card p-6 text-center">
        <FileQuestion
          className="mx-auto size-12 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden
        />
        <h1 className="mt-3 text-xl leading-7 font-semibold">Page not found</h1>
        <p className="mt-2 text-sm leading-5">
          This link may be out of date, or the record it pointed to no longer exists.
        </p>
        <Button asChild className="mt-4">
          <Link href="/">Go to your dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
