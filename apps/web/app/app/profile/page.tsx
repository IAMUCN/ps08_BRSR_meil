import type { Metadata } from "next";
import { ProfileView } from "@/components/profile/profile-view";
import { PageHeader } from "@/components/shell/page-header";
import { getMfaState } from "@/lib/auth/mfa-state";
import { requireAppSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Profile · EmeilSG" };

export default async function WorkspaceProfilePage() {
  const session = await requireAppSession();
  const mfa = await getMfaState();
  return (
    <>
      <PageHeader title="Profile" />
      <ProfileView session={session} mfa={mfa} />
    </>
  );
}
