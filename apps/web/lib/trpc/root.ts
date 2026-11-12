import "server-only";
import { protectedProcedure, router } from "@/lib/trpc/init";
import { dashboardRouter } from "@/lib/trpc/routers/dashboard";
import { bundlesRouter } from "@/lib/trpc/routers/bundles";
import { documentsRouter } from "@/lib/trpc/routers/documents";
import { factorsRouter } from "@/lib/trpc/routers/factors";
import { notificationsRouter } from "@/lib/trpc/routers/notifications";
import { ocrRouter } from "@/lib/trpc/routers/ocr";
import { organizationRouter } from "@/lib/trpc/routers/organization";
import { profileRouter } from "@/lib/trpc/routers/profile";
import { reportingPeriodsRouter } from "@/lib/trpc/routers/reporting-periods";
import { approvalsRouter } from "@/lib/trpc/routers/approvals";
import { auditRouter } from "@/lib/trpc/routers/audit";
import { brsrRouter } from "@/lib/trpc/routers/brsr";
import { chatRouter } from "@/lib/trpc/routers/chat";
import { consolidationRouter } from "@/lib/trpc/routers/consolidation";
import { recordsRouter } from "@/lib/trpc/routers/records";
import { reportsRouter } from "@/lib/trpc/routers/reports";
import { validationRouter } from "@/lib/trpc/routers/validation";
import { verificationRouter } from "@/lib/trpc/routers/verification";
import { rolesRouter } from "@/lib/trpc/routers/roles";
import { scopeRouter } from "@/lib/trpc/routers/scope";
import { forecastRouter } from "@/lib/trpc/routers/forecast";
import { simulatorRouter } from "@/lib/trpc/routers/simulator";
import { deadlinesRouter } from "@/lib/trpc/routers/deadlines";
import { usersRouter } from "@/lib/trpc/routers/users";
import { carbonCreditsRouter } from "@/lib/trpc/routers/carbonCredits";
import { featuresRouter } from "@/lib/trpc/routers/features";
import { rulesRouter } from "@/lib/trpc/routers/rules";
import { suggestionsRouter } from "@/lib/trpc/routers/suggestions";
import { risksRouter } from "@/lib/trpc/routers/risks";
import { recommendationsRouter } from "@/lib/trpc/routers/recommendations";
import { aiGatewayRouter } from "@/lib/trpc/routers/ai-gateway";
import { ragRouter } from "@/lib/trpc/routers/rag";
import { predictiveRouter } from "@/lib/trpc/routers/predictive";

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
  bundles: bundlesRouter,
  ocr: ocrRouter,
  notifications: notificationsRouter,
  verification: verificationRouter,
  validation: validationRouter,
  approvals: approvalsRouter,
  factors: factorsRouter,
  scope: scopeRouter,
  forecast: forecastRouter,
  simulator: simulatorRouter,
  deadlines: deadlinesRouter,
  brsr: brsrRouter,
  consolidation: consolidationRouter,
  records: recordsRouter,
  reports: reportsRouter,
  audit: auditRouter,
  chat: chatRouter,
  carbonCredits: carbonCreditsRouter,
  features: featuresRouter,
  rules: rulesRouter,
  suggestions: suggestionsRouter,
  risks: risksRouter,
  recommendations: recommendationsRouter,
  aiGateway: aiGatewayRouter,
  rag: ragRouter,
  predictive: predictiveRouter,
});

export type AppRouter = typeof appRouter;
