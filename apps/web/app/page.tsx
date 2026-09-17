import { redirect } from "next/navigation";
import { landingPathFor } from "@/lib/auth/redirects";
import { getSessionContext } from "@/lib/auth/session";

// "/" has no page of its own in 03_APP_FLOW.md — it routes to the right entry point (§4.1).
export default async function RootPage() {
  const result = await getSessionContext();
  if (result.status === "anonymous") redirect("/login");
  if (result.status !== "active") redirect(`/auth/signout?reason=${result.status}`);
  redirect(landingPathFor(result.session.roleCodes));
}
