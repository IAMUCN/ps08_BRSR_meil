import { redirect } from "next/navigation";
import { landingPathFor } from "@/lib/auth/redirects";
import { getSessionContext, type SessionResult } from "@/lib/auth/session";
import { LandingPage } from "@/components/landing/landing-page";

export default async function RootPage() {
  let result: SessionResult | null = null;
  try {
    result = await getSessionContext();
  } catch {
    // If auth/db is unreachable, proceed to landing page
    result = null;
  }

  if (result?.status === "active") {
    redirect(landingPathFor(result.session.roleCodes));
  }

  if (result?.status === "password_change_required") {
    redirect("/login");
  }

  // Anonymous or inactive users see the landing page
  return <LandingPage />;
}

