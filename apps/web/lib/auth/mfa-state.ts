import "server-only";
import { hasVerifiedTotp, mfaEnforced } from "@/lib/auth/mfa";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Whether the signed-in person has an authenticator app, and whether the platform requires one. */
export async function getMfaState(): Promise<{ enabled: boolean; required: boolean }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { enabled: hasVerifiedTotp(user?.factors), required: mfaEnforced() };
}
