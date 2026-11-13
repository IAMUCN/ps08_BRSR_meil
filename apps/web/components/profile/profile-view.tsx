"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { PasswordStrengthMeter } from "@/components/auth/password-strength";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import type { ActiveSession } from "@/lib/auth/session";
import { MfaSettings } from "@/components/profile/mfa-settings";
import { changePasswordAction, updateDisplayNameAction } from "@/lib/profile/actions";

/**
 * 03_APP_FLOW.md §2.3 Profile, mounted at /app/profile and /admin/profile. Role and scope are read-only.
 */
export function ProfileView({
  session,
  mfa,
}: {
  session: ActiveSession;
  mfa: { enabled: boolean; required: boolean };
}) {
  const router = useRouter();
  const [namePending, startName] = useTransition();
  const [passwordPending, startPassword] = useTransition();
  const [displayName, setDisplayName] = useState(session.displayName);
  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordError, setPasswordError] = useState<string | null>(null);

  function onSaveName(event: FormEvent) {
    event.preventDefault();
    startName(async () => {
      const result = await updateDisplayNameAction({ displayName });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Profile updated");
      router.refresh();
    });
  }

  function onChangePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    startPassword(async () => {
      const result = await changePasswordAction(passwords);
      if (!result.ok) {
        setPasswordError(result.error);
        return;
      }
      toast.success("Password changed — you've been signed out of other devices");
      setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
    });
  }

  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
      <section aria-labelledby="account-heading" className="rounded-md border bg-card p-6">
        <h2 id="account-heading" className="text-xl leading-7 font-semibold">
          Account
        </h2>
        <form onSubmit={onSaveName} className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={session.email} readOnly className="font-mono" />
          </div>
          <Button
            type="submit"
            variant="outline"
            disabled={namePending || displayName.trim() === session.displayName}
          >
            {namePending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Save
          </Button>
        </form>

        <h3 className="mt-8 text-base leading-6 font-semibold">Roles and scope</h3>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">Managed by your Admin.</p>
        {session.assignments.length === 0 ? (
          <p className="mt-2 text-sm">No assignments yet — ask your Admin to assign you a role.</p>
        ) : (
          <ul className="mt-2 divide-y rounded-md border text-sm">
            {session.assignments.map((a) => (
              <li key={`${a.orgUnitId}-${a.roleCode}`} className="px-3 py-2">
                <span className="font-medium">{a.roleName}</span> · {a.orgUnitName}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="password-heading" className="rounded-md border bg-card p-6">
        <h2 id="password-heading" className="text-xl leading-7 font-semibold">
          Change password
        </h2>
        <form onSubmit={onChangePassword} className="mt-4 space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <PasswordInput
              id="current-password"
              autoComplete="current-password"
              value={passwords.currentPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              value={passwords.newPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
              aria-describedby="new-password-strength"
              required
            />
            <PasswordStrengthMeter id="new-password-strength" password={passwords.newPassword} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-new-password">Confirm new password</Label>
            <PasswordInput
              id="confirm-new-password"
              autoComplete="new-password"
              value={passwords.confirmPassword}
              onChange={(e) => setPasswords((p) => ({ ...p, confirmPassword: e.target.value }))}
              required
            />
          </div>
          {passwordError ? (
            <p role="alert" className="text-sm leading-5 text-destructive">
              {passwordError}
            </p>
          ) : null}
          <Button type="submit" disabled={passwordPending}>
            {passwordPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Change password
          </Button>
          <p className="text-sm leading-5 text-muted-foreground">
            Forgot your current password?{" "}
            <Link
              href="/forgot-password"
              className="font-medium text-primary-text underline-offset-4 hover:underline"
            >
              Reset it with a code sent to your email
            </Link>
          </p>
        </form>
      </section>
      <MfaSettings enabled={mfa.enabled} required={mfa.required} />
    </div>
  );
}
