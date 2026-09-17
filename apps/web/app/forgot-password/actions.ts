"use server";

import { z } from "zod";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ResetRequestState =
  { status: "idle" } | { status: "sent" } | { status: "error"; message: string };

export async function requestPasswordReset(
  _previous: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const parsed = z.email().safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { status: "error", message: "Enter a valid email address." };

  // The email link is built from the Supabase Auth site URL and the recovery template.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data);

  // Supabase does not reveal whether the address exists; any error here is network/server/rate limit.
  if (error) return { status: "error", message: AUTH_MESSAGES.retry };
  return { status: "sent" };
}
