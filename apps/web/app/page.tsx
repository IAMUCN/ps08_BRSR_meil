import { redirect } from "next/navigation";
import { landingPathFor } from "@/lib/auth/redirects";
import { getSessionContext } from "@/lib/auth/session";
import { LandingPage } from "@/components/landing/landing-page";

export default async function RootPage() {
  try {
    const result = await getSessionContext();
    if (result.status === "active") redirect(landingPathFor(result.session.roleCodes));
  } catch {
    // If auth/db is unreachable, proceed to landing page
  }
  // Anonymous or inactive users see the landing page
  return <LandingPage />;
}
