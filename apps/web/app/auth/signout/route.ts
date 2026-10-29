import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/redirects";
import { currentSessionId, endSessions } from "@/lib/auth/session-limits";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Forced sign-out for signed-in users the Data Access Layer turns away (deactivated, unprovisioned, or a
// sign-in past its time limit). Server Components cannot clear cookies, so they redirect here. Only known
// reasons are forwarded.
const FORWARDED_REASONS = new Set(["deactivated", "unprovisioned", "expired"]);

export async function GET(request: NextRequest) {
  const reason = request.nextUrl.searchParams.get("reason");
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (reason === "expired") {
    // Only this sign-in ran out: the person may be at work on another device.
    if (user) await endSessions(user.id, await currentSessionId(supabase));
    await supabase.auth.signOut({ scope: "local" });
    // Back to the page they were on once they sign in again; only paths inside the app are accepted.
    const next = safeNextPath(request.nextUrl.searchParams.get("next"));
    redirect(`/login?reason=expired${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  if (user) await endSessions(user.id);
  await supabase.auth.signOut();
  redirect(reason && FORWARDED_REASONS.has(reason) ? `/login?reason=${reason}` : "/login");
}
