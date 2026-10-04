"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useState } from "react";
import { AuthNotice } from "@/components/auth/auth-card";
import { PasswordStrengthMeter } from "@/components/auth/password-strength";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import {
  requestPasswordReset,
  verifyOtpAndSetPassword,
  type ResetRequestState,
  type VerifyOtpState,
} from "./actions";

const initialRequestState: ResetRequestState = { status: "idle" };
const initialVerifyState: VerifyOtpState = { error: null };

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialRequestState);

  if (state.status === "sent") {
    return <VerifyOtpForm email={state.email} />;
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          readOnly={pending}
          aria-invalid={state.status === "error"}
          aria-describedby={state.status === "error" ? "reset-error" : undefined}
        />
      </div>

      {state.status === "error" ? (
        <p id="reset-error" role="alert" className="text-sm leading-5 text-destructive">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? "Sending…" : "Send reset code"}
      </Button>
    </form>
  );
}

function VerifyOtpForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(verifyOtpAndSetPassword, initialVerifyState);
  const [password, setPassword] = useState("");
  const describedBy = ["password-strength", state.error ? "verify-error" : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-4">
      <AuthNotice tone="info">{AUTH_MESSAGES.resetSent}</AuthNotice>
      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="email" value={email} />
        <div className="space-y-2">
          <Label htmlFor="code">6-digit code</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            readOnly={pending}
            aria-invalid={Boolean(state.error)}
          />
        </div>
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(state.error)}
            aria-describedby={describedBy}
          />
          <PasswordStrengthMeter id="password-strength" password={password} />
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
            aria-describedby={state.error ? "verify-error" : undefined}
          />
        </div>

        {state.error ? (
          <p id="verify-error" role="alert" className="text-sm leading-5 text-destructive">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {pending ? "Setting password…" : "Set new password"}
        </Button>
      </form>
    </div>
  );
}
