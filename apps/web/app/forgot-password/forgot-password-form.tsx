"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { AuthNotice } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { requestPasswordReset, type ResetRequestState } from "./actions";

const initialState: ResetRequestState = { status: "idle" };

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  if (state.status === "sent") {
    return <AuthNotice tone="info">{AUTH_MESSAGES.resetSent}</AuthNotice>;
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
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
