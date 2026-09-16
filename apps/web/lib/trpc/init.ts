import "server-only";
import { initTRPC, TRPCError } from "@trpc/server";
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
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { session: ctx.session.session } });
});
