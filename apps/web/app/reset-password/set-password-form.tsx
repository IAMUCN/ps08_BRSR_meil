"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useState } from "react";
import { PasswordStrengthMeter } from "@/components/auth/password-strength";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { setPassword, type SetPasswordState } from "./actions";

const initialState: SetPasswordState = { error: null };

export function SetPasswordForm() {
  const [state, formAction, pending] = useActionState(setPassword, initialState);
  const [password, setPasswordValue] = useState("");

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          minLength={12}
          required
          readOnly={pending}
          value={password}
          onChange={(e) => setPasswordValue(e.target.value)}
          aria-invalid={Boolean(state.error)}
          aria-describedby="password-strength"
        />
        <PasswordStrengthMeter id="password-strength" password={password} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          readOnly={pending}
          aria-invalid={Boolean(state.error)}
          aria-describedby={state.error ? "set-password-error" : undefined}
        />
      </div>

      {state.error ? (
        <p id="set-password-error" role="alert" className="text-sm leading-5 text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? "Saving…" : "Set password"}
      </Button>
    </form>
  );
}
