import "server-only";
import { protectedProcedure, router } from "@/lib/trpc/init";
import { dashboardRouter } from "@/lib/trpc/routers/dashboard";
import { documentsRouter } from "@/lib/trpc/routers/documents";
import { factorsRouter } from "@/lib/trpc/routers/factors";
import { notificationsRouter } from "@/lib/trpc/routers/notifications";
import { ocrRouter } from "@/lib/trpc/routers/ocr";
import { organizationRouter } from "@/lib/trpc/routers/organization";
import { profileRouter } from "@/lib/trpc/routers/profile";
import { reportingPeriodsRouter } from "@/lib/trpc/routers/reporting-periods";
import { approvalsRouter } from "@/lib/trpc/routers/approvals";
import { brsrRouter } from "@/lib/trpc/routers/brsr";
import { validationRouter } from "@/lib/trpc/routers/validation";
import { verificationRouter } from "@/lib/trpc/routers/verification";
import { rolesRouter } from "@/lib/trpc/routers/roles";
import { scopeRouter } from "@/lib/trpc/routers/scope";
import { usersRouter } from "@/lib/trpc/routers/users";

export const appRouter = router({
  session: router({
    /** The signed-in user's identity, roles, permissions and org-scope assignments. */
    me: protectedProcedure.query(({ ctx }) => ctx.session),
  }),
  dashboard: dashboardRouter,
  organization: organizationRouter,
  users: usersRouter,
  roles: rolesRouter,
  reportingPeriods: reportingPeriodsRouter,
  profile: profileRouter,
  documents: documentsRouter,
  ocr: ocrRouter,
  notifications: notificationsRouter,
  verification: verificationRouter,
  validation: validationRouter,
  approvals: approvalsRouter,
  factors: factorsRouter,
  scope: scopeRouter,
  brsr: brsrRouter,
});

export type AppRouter = typeof appRouter;
