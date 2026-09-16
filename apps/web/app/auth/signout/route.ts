import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Forced sign-out for signed-in users the Data Access Layer turns away (deactivated/unprovisioned).
// Server Components cannot clear cookies, so they redirect here. Only known reasons are forwarded.
const FORWARDED_REASONS = new Set(["deactivated", "unprovisioned"]);

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  const reason = request.nextUrl.searchParams.get("reason");
  redirect(reason && FORWARDED_REASONS.has(reason) ? `/login?reason=${reason}` : "/login");
}
