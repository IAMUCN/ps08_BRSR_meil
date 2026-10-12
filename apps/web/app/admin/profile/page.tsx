import type { Metadata } from "next";
import { ProfileView } from "@/components/profile/profile-view";
import { PageHeader } from "@/components/shell/page-header";
import { requireAdminSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Profile · EmeilSG" };

export default async function AdminProfilePage() {
  const session = await requireAdminSession();
  return (
    <>
      <PageHeader title="Profile" />
      <ProfileView session={session} />
    </>
  );
}
