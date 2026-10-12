"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useState } from "react";
import { PasswordStrengthMeter } from "@/components/auth/password-strength";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { changeTemporaryPassword, type ChangeTemporaryPasswordState } from "./actions";

const initialState: ChangeTemporaryPasswordState = { error: null };

/** Shown on the sign-in page right after a sign-in with the emailed temporary password. */
export function ChangePasswordForm({ next, email }: { next: string | null; email: string }) {
  const [state, formAction, pending] = useActionState(changeTemporaryPassword, initialState);
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {/* Lets a password manager save the new password against the right account. */}
      <input type="hidden" name="username" autoComplete="username" value={email} readOnly />

      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <PasswordInput
          id="new-password"
          name="password"
          autoComplete="new-password"
          minLength={12}
          required
          autoFocus
          readOnly={pending}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(state.error)}
          aria-describedby="new-password-strength"
        />
        <PasswordStrengthMeter id="new-password-strength" password={password} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-new-password">Confirm new password</Label>
        <PasswordInput
          id="confirm-new-password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          readOnly={pending}
          aria-invalid={Boolean(state.error)}
          aria-describedby={state.error ? "change-password-error" : undefined}
        />
      </div>

      {state.error ? (
        <p id="change-password-error" role="alert" className="text-sm leading-5 text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? "Saving…" : "Save password and continue"}
      </Button>
    </form>
  );
}
