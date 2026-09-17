import "server-only";
import { TRPCError } from "@trpc/server";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { createCallerFactory, createTRPCContext } from "@/lib/trpc/init";
import { appRouter } from "@/lib/trpc/root";

const createCaller = createCallerFactory(appRouter);

/** Server-side tRPC caller for Server Components and Server Actions — same procedures, same checks. */
export async function api() {
  return createCaller(await createTRPCContext());
}

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Runs a procedure from a Server Action. Procedure errors carry user-facing messages; anything unexpected
 * is logged server-side and reported generically.
 */
export async function runAction<T>(
  call: (caller: Awaited<ReturnType<typeof api>>) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await call(await api()) };
  } catch (error) {
    if (error instanceof TRPCError && error.code !== "INTERNAL_SERVER_ERROR") {
      return { ok: false, error: error.message };
    }
    console.error(error);
    return { ok: false, error: AUTH_MESSAGES.retry };
  }
}
