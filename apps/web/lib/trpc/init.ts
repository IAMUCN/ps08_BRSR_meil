import "server-only";
import { initTRPC, TRPCError } from "@trpc/server";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { getSessionContext } from "@/lib/auth/session";

// Internal typed API (02_TRD.md §5, §22). Identity always comes from the server session resolved by the
// Data Access Layer — never from client-supplied fields (supabase/SCHEMA_DEVIATIONS.md D1).

export async function createTRPCContext() {
  return { session: await getSessionContext() };
}

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/** Requires an active, provisioned user; narrows `ctx.session` to that user's resolved scope. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.session.status !== "active") {
    throw new TRPCError({ code: "UNAUTHORIZED", message: AUTH_MESSAGES.expired });
  }
  return next({ ctx: { session: ctx.session.session } });
});

/** Requires a specific permission code from the caller's roles (seeded catalogue, migration 0009). */
export function permissionProcedure(permission: string) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!ctx.session.permissions.includes(permission)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You don't have permission to do that." });
    }
    return next();
  });
}
