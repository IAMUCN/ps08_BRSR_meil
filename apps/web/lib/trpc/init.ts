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

/**
 * The /admin area: a Super Admin or an Administrator. A procedure built on this must keep what it reads and
 * writes inside the caller's org scope itself (lib/auth/scope.ts) — the guard only says who may ask.
 */
export const adminAreaProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.session.isAdmin && !ctx.session.isOrgAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You don't have permission to do that." });
  }
  return next();
});

/** Super Admin only: group-wide pages with no dedicated permission code (e.g. OCR Monitoring, §2.2). */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.session.isAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You don't have permission to do that." });
  }
  return next();
});

/** Requires a specific permission code from the caller's roles (seeded catalogue, migration 0009). */
export function permissionProcedure(permission: string) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!ctx.session.isAdmin && !ctx.session.permissions.includes(permission)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You don't have permission to do that." });
    }
    return next();
  });
}
