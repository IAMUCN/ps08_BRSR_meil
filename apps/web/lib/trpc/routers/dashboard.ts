import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { protectedProcedure, router } from "@/lib/trpc/init";

export type OpenPeriod = {
  id: string;
  label: string;
  submissionOpensOn: string | null;
  submissionClosesOn: string | null;
};

export const dashboardRouter = router({
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
