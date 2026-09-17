"use server";

import { redirect } from "next/navigation";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SetPasswordState = { error: string | null };

const MIN_PASSWORD_LENGTH = 12;

export async function setPassword(
  _previous: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirmation) return { error: "Passwords do not match." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?reason=link_invalid");

  // Supabase Auth enforces the same 12-character minimum server-side (supabase/config.toml).
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "weak_password") {
      return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
    }
    if (error.code === "same_password") {
      return { error: "Choose a password different from your current one." };
    }
    return { error: AUTH_MESSAGES.retry };
  }

  await supabase.auth.signOut();
  redirect("/login?reason=password_set");
}
