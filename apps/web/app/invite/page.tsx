import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { AcceptInvitationForm } from "./accept-invitation-form";

// The page an invitation link opens (migration 0051). The token is in the part of the address after "#",
// which the browser never sends: this page is the same for everyone and reads nothing from the request.
export const metadata: Metadata = {
  title: "Set up your account · EmeilSG",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function InvitePage() {
  return (
    <AuthCard title="Set up your account">
      <AcceptInvitationForm />
    </AuthCard>
  );
}
