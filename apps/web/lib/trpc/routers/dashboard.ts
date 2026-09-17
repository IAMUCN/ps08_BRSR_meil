import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { permissionProcedure, protectedProcedure, router } from "@/lib/trpc/init";

export type OpenPeriod = {
  id: string;
  label: string;
  submissionOpensOn: string | null;
  submissionClosesOn: string | null;
};

export const dashboardRouter = router({
  /**
   * UI brief §13.1 header strip. Live counts, RLS-scoped as the signed-in Admin.
   * "Organizations" = subsidiary/entity nodes under the group.
   */
  headerCounts: permissionProcedure("monitoring.view").query(async () => {
    const supabase = await createSupabaseServerClient();
    const count = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
      const { count: value, error } = await query;
      if (error) throw error;
      return value ?? 0;
    };
    const [organizations, projects, activeUsers] = await Promise.all([
      count(
        supabase
          .from("org_units")
          .select("id", { count: "exact", head: true })
          .eq("unit_type", "subsidiary")
          .is("deleted_at", null),
      ),
      count(
        supabase
          .from("org_units")
          .select("id", { count: "exact", head: true })
          .eq("unit_type", "project")
          .is("deleted_at", null),
      ),
      count(
        supabase
          .from("users")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .is("deleted_at", null),
      ),
    ]);
    return { organizations, projects, activeUsers };
  }),

  /** The currently open reporting period (readable by every signed-in user). */
  openPeriod: protectedProcedure.query(async (): Promise<OpenPeriod | null> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("reporting_periods")
      .select("id, label, submission_opens_on, submission_closes_on")
      .eq("status", "open")
      .maybeSingle();
    if (error) throw error;
    return data
      ? {
          id: data.id,
          label: data.label,
          submissionOpensOn: data.submission_opens_on,
          submissionClosesOn: data.submission_closes_on,
        }
      : null;
  }),
});
