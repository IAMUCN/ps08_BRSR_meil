import "server-only";
import { createClient } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { publicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { protectedProcedure, router } from "@/lib/trpc/init";

const MIN_PASSWORD_LENGTH = 12;

function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

export const profileRouter = router({
  updateDisplayName: protectedProcedure
    .input(z.object({ displayName: z.string().trim().min(1, "Name is required.").max(200) }))
    .mutation(async ({ ctx, input }) => {
      await db().begin(async (tx) => {
        await tx`update public.users set display_name = ${input.displayName} where id = ${ctx.session.userId}`;
        await writeAudit(tx, {
          eventType: "user.display_name_changed",
          entityType: "user",
          entityId: ctx.session.userId,
          userId: ctx.session.userId,
          oldValue: { display_name: ctx.session.displayName },
          newValue: { display_name: input.displayName },
        });
      });
      return null;
    }),

  /** Requires the current password (.grill/phase-4-admin-foundation-decisions.md). */
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1, "Enter your current password."),
        newPassword: z.string(),
        confirmPassword: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.newPassword.length < MIN_PASSWORD_LENGTH) {
        badRequest(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      }
      if (input.newPassword !== input.confirmPassword) badRequest("New passwords do not match.");
      if (input.newPassword === input.currentPassword) {
        badRequest("Choose a password different from your current one.");
      }

      // Verify the current password on a throwaway client so the user's own session is untouched.
      const verifier = createClient(
        publicEnv.NEXT_PUBLIC_SUPABASE_URL,
        publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const { error: verifyError } = await verifier.auth.signInWithPassword({
        email: ctx.session.email,
        password: input.currentPassword,
      });
      if (verifyError) {
        badRequest(
          verifyError.code === "invalid_credentials"
            ? "Current password is incorrect."
            : "Your password could not be verified. Try again.",
        );
      }

      const supabase = await createSupabaseServerClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password: input.newPassword,
      });
      if (updateError) {
        badRequest(
          updateError.code === "weak_password"
            ? `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`
            : "Your password could not be changed. Try again.",
        );
      }
      // Ends every other session, including the verification sign-in above.
      await supabase.auth.signOut({ scope: "others" });

      await db().begin((tx) =>
        writeAudit(tx, {
          eventType: "user.password_changed",
          entityType: "user",
          entityId: ctx.session.userId,
          userId: ctx.session.userId,
        }),
      );
      return null;
    }),
});
