import "server-only";
import { protectedProcedure, router } from "@/lib/trpc/init";
import { dashboardRouter } from "@/lib/trpc/routers/dashboard";
import { registerRouter } from "@/lib/trpc/routers/register";
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
import { brsrTablesRouter } from "@/lib/trpc/routers/brsr-tables";
import { chatRouter } from "@/lib/trpc/routers/chat";
import { consolidationRouter } from "@/lib/trpc/routers/consolidation";
import { recordsRouter } from "@/lib/trpc/routers/records";
import { reportsRouter } from "@/lib/trpc/routers/reports";
import { reportForwardingRouter } from "@/lib/trpc/routers/report-forwarding";
import { validationRouter } from "@/lib/trpc/routers/validation";
import { verificationRouter } from "@/lib/trpc/routers/verification";
import { rolesRouter } from "@/lib/trpc/routers/roles";
import { scopeRouter } from "@/lib/trpc/routers/scope";
import { forecastRouter } from "@/lib/trpc/routers/forecast";
import { simulatorRouter } from "@/lib/trpc/routers/simulator";
import { deadlinesRouter } from "@/lib/trpc/routers/deadlines";
import { usersRouter } from "@/lib/trpc/routers/users";
import { carbonCreditsRouter } from "@/lib/trpc/routers/carbonCredits";
import { carbonLinksRouter } from "@/lib/trpc/routers/carbon-links";
import { analyticsRouter } from "@/lib/trpc/routers/analytics";
import { searchRouter } from "@/lib/trpc/routers/search";
import { helpRouter } from "@/lib/trpc/routers/help";
import { demoRequestsRouter } from "@/lib/trpc/routers/demo-requests";
// The decision-intelligence routers (e333e9b); their registration was lost in a later merge.
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
  register: registerRouter,
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
  brsrTables: brsrTablesRouter,
  consolidation: consolidationRouter,
  records: recordsRouter,
  reports: reportsRouter,
  reportForwarding: reportForwardingRouter,
  audit: auditRouter,
  chat: chatRouter,
  carbonCredits: carbonCreditsRouter,
  carbonLinks: carbonLinksRouter,
  analytics: analyticsRouter,
  search: searchRouter,
  help: helpRouter,
  demoRequests: demoRequestsRouter,
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
