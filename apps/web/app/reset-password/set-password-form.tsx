"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { setPassword, type SetPasswordState } from "./actions";

const initialState: SetPasswordState = { error: null };

export function SetPasswordForm() {
  const [state, formAction, pending] = useActionState(setPassword, initialState);
  const describedBy = ["password-rule", state.error ? "set-password-error" : null]
    .filter(Boolean)
    .join(" ");

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          readOnly={pending}
          aria-invalid={Boolean(state.error)}
          aria-describedby={describedBy}
        />
        <p id="password-rule" className="text-xs leading-4 text-muted-foreground">
          {AUTH_MESSAGES.passwordRule}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
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
