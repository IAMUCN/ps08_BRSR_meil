import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { writeAudit } from "@/lib/audit";
import { deviceLabel } from "@/lib/auth/device-label";
import { postLoginPath, safeNextPath } from "@/lib/auth/redirects";
import { resolveSession } from "@/lib/auth/session";
import { SIGN_IN_MARKER, sessionIdFromAccessToken } from "@/lib/auth/session-cookie";
import { startSession } from "@/lib/auth/session-limits";
import { db } from "@/lib/db";
import { clientAddress } from "@/lib/security/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SESSION_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Where Google sends people back after "Continue with Google" (owner's request, 2026-11-12). Only an account
// an admin registered gets in, with the same rules as a password sign-in: deactivated accounts are refused,
// one sign-in per account (migration 0055), a temporary password still has to be changed. Anyone else is
// signed out again and told that sign-ups are not allowed and whom to contact.

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNextPath(params.get("next"));
  const back = (reason: string): never =>
    redirect(`/login?reason=${reason}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  const failure = (code: string | null, text: string | null): never => {
    const said = `${code ?? ""} ${text ?? ""}`.toLowerCase();
    // Sign-ups are off in Supabase Auth: an unknown Google address is refused there.
    if (said.includes("signup") || said.includes("not allowed")) back("not_registered");
    if (said.includes("banned")) back("deactivated");
    // The person closed Google's window: just back to the sign-in page.
    if (said.includes("access_denied")) redirect("/login");
    return back("google_failed");
  };

  const code = params.get("code");
  if (!code)
    failure(params.get("error_code") ?? params.get("error"), params.get("error_description"));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code!);
  if (error || !data.session) return failure(error?.code ?? null, error?.message ?? null);
  const user = data.user;

  const [profile] = await db()<{ is_active: boolean }[]>`
    select is_active from public.users where id = ${user.id} and deleted_at is null`;
  if (!profile) {
    await supabase.auth.signOut({ scope: "local" });
    // With sign-ups switched on in Supabase Auth, Google would have made a new account for an unknown
    // address just now: it is removed again, so nothing is left behind.
    const fresh =
      Date.now() - new Date(user.created_at).getTime() < 10 * 60_000 &&
      (user.identities ?? []).every((identity) => identity.provider === "google");
    if (fresh) await createSupabaseAdminClient().auth.admin.deleteUser(user.id);
    const [registered] = user.email
      ? await db()<{ id: string }[]>`
          select id from public.users
          where lower(email) = lower(${user.email}) and deleted_at is null`
      : [];
    await db().begin((tx) =>
      writeAudit(tx, {
        eventType: "auth.google_sign_in_refused",
        entityType: "user",
        entityId: registered?.id ?? user.id,
        userId: null,
        newValue: { email: user.email ?? null, registered: Boolean(registered), removed: fresh },
      }),
    );
    // A registered address whose Google account was not matched to it (Supabase links verified emails).
    return back(registered ? "google_not_linked" : "not_registered");
  }
  if (!profile.is_active) {
    await supabase.auth.signOut();
    return back("deactivated");
  }

  const sessionId = sessionIdFromAccessToken(data.session.access_token);
  if (!sessionId) {
    await supabase.auth.signOut({ scope: "local" });
    return back("google_failed");
  }
  const requestHeaders = await headers();
  const ip = clientAddress(requestHeaders);
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 512) ?? null;
  const started = await startSession({
    sessionId,
    userId: user.id,
    replace: params.get("takeover") === "1",
    userAgent,
    ipAddress: ip === "unknown" ? null : ip,
  });
  if (started.outcome !== "started") {
    // The database has already revoked this sign-in; this clears the cookies too.
    await supabase.auth.signOut({ scope: "local" });
    if (started.outcome === "refused") return back("google_failed");
    const device = deviceLabel(started.others[0]?.user_agent);
    return redirect(
      `/login?reason=google_elsewhere&device=${encodeURIComponent(device)}${next ? `&next=${encodeURIComponent(next)}` : ""}`,
    );
  }
  (await cookies()).set(SIGN_IN_MARKER, sessionId, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 30,
  });

  const result = await resolveSession(supabase);
  if (result.status === "password_change_required") {
    return redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  if (result.status !== "active") {
    await supabase.auth.signOut();
    return back(result.status === "deactivated" ? "deactivated" : "unprovisioned");
  }
  return redirect(postLoginPath(next, result.session.roleCodes));
}
