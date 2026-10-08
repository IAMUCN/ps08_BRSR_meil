import "server-only";
import { TRPCError } from "@trpc/server";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/redirects";
import { createCallerFactory, createTRPCContext } from "@/lib/trpc/init";
import { appRouter } from "@/lib/trpc/root";

const createCaller = createCallerFactory(appRouter);

/** Server-side tRPC caller for Server Components and Server Actions — same procedures, same checks. */
export async function api() {
  return createCaller(await createTRPCContext());
}

/**
 * For a page that loads by an id from the URL: an unknown or malformed id shows the Not Found page, not the
 * server-error boundary (UI brief §15.3 — the message must match what happened).
 */
export async function orNotFound<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (
      error instanceof TRPCError &&
      (error.code === "NOT_FOUND" || error.code === "BAD_REQUEST")
    ) {
      notFound();
    }
    throw error;
  }
}

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Runs a procedure from a Server Action. Procedure errors carry user-facing messages; anything unexpected
 * is logged server-side and reported generically. An expired session goes to sign-in and back to the page
 * the action came from (03_APP_FLOW.md §3, §4.3).
 */
export async function runAction<T>(
  call: (caller: Awaited<ReturnType<typeof api>>) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await call(await api()) };
  } catch (error) {
    if (error instanceof TRPCError && error.code === "UNAUTHORIZED") {
      const from = (await headers()).get("referer");
      const next = safeNextPath(from ? new URL(from).pathname + new URL(from).search : null);
      redirect(`/login?reason=expired${next ? `&next=${encodeURIComponent(next)}` : ""}`);
    }
    if (error instanceof TRPCError && error.code !== "INTERNAL_SERVER_ERROR") {
      return { ok: false, error: error.message };
    }
    console.error(error);
    return { ok: false, error: AUTH_MESSAGES.retry };
  }
}
