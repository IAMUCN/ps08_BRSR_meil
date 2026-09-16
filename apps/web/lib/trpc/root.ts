import "server-only";
import { protectedProcedure, router } from "@/lib/trpc/init";

export const appRouter = router({
  session: router({
    /** The signed-in user's identity, roles, permissions and org-scope assignments. */
    me: protectedProcedure.query(({ ctx }) => ctx.session),
  }),
});

export type AppRouter = typeof appRouter;
