import type { Metadata } from "next";
import { ProfileView } from "@/components/profile/profile-view";
import { PageHeader } from "@/components/shell/page-header";
import { requireAppSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Profile · TraceESG" };

export default async function WorkspaceProfilePage() {
  const session = await requireAppSession();
  return (
    <>
      <PageHeader title="Profile" />
      <ProfileView session={session} />
    </>
  );
}
