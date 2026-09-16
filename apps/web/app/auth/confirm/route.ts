import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Target of the invite and password-recovery email links (supabase/templates). Exchanges the one-time
// token for a session, then sends the user to set a password. The destination is fixed — no
// user-controlled redirect target is accepted.
const ALLOWED_TYPES = new Set<EmailOtpType>(["invite", "recovery"]);

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type && ALLOWED_TYPES.has(type)) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect("/reset-password");
  }

  redirect("/login?reason=link_invalid");
}
