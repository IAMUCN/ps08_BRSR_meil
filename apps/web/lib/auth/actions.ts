"use server";

import { redirect } from "next/navigation";
import { endSessions } from "@/lib/auth/session-limits";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** §4.2 Logout: invalidate the Supabase session (on every device), then return to /login. */
export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await endSessions(user.id);
  await supabase.auth.signOut();
  redirect("/login");
}
