"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { AuthNotice } from "@/components/auth/auth-card";
import { PasswordStrengthMeter } from "@/components/auth/password-strength";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { acceptInvitation, checkInvitation, type AcceptInvitationState } from "./actions";

const initialState: AcceptInvitationState = { error: null };
// Kept for this tab only, so reloading the page does not lose the link once it has left the address bar.
const STORAGE_KEY = "emeilsg-invitation";

type LinkState = { status: "checking" } | { status: "invalid"; limited: boolean } | LinkReady;
type LinkReady = { status: "ready"; token: string; email: string };

function readToken(): string {
  const fromAddress = window.location.hash.slice(1);
  if (fromAddress) {
    // Out of the address bar and the browser history as soon as it has been read.
    window.history.replaceState(null, "", window.location.pathname);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, fromAddress);
    } catch {
      // Storage can be switched off; the link then simply has to be opened again after a reload.
    }
    return fromAddress;
  }
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function forgetToken() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to forget.
  }
}

export function AcceptInvitationForm() {
  const [link, setLink] = useState<LinkState>({ status: "checking" });
  const [state, formAction, pending] = useActionState(acceptInvitation, initialState);
  const [password, setPassword] = useState("");

  useEffect(() => {
    let current = true;
    const token = readToken();
    checkInvitation(token)
      .then((result) => {
        if (!current) return;
        if (result.valid) setLink({ status: "ready", token, email: result.email });
        else {
          forgetToken();
          setLink({ status: "invalid", limited: result.limited });
        }
      })
      .catch(() => current && setLink({ status: "invalid", limited: false }));
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (state.linkInvalid) forgetToken();
  }, [state.linkInvalid]);

  if (link.status === "checking") {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Checking your link…
      </p>
    );
  }

  if (link.status === "invalid" || state.linkInvalid) {
    return (
      <>
        <AuthNotice tone="error">
          {link.status === "invalid" && link.limited
            ? AUTH_MESSAGES.otpRateLimited
            : AUTH_MESSAGES.invitationInvalid}
        </AuthNotice>
        <p className="text-sm leading-5 text-muted-foreground">
          A link works once and for a limited time, and a newer link replaces an older one. If you
          have already chosen your password, sign in.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-flex min-h-6 items-center text-sm font-medium text-primary-text underline-offset-4 hover:underline"
        >
          Go to sign in
        </Link>
      </>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <p className="text-sm leading-5 text-muted-foreground">
        Choose a password for <span className="font-medium text-foreground">{link.email}</span>. You
        will sign in with it afterwards.
      </p>
      <input type="hidden" name="token" value={link.token} />
      {/* Lets a password manager save the new password against the right account. */}
      <input type="hidden" name="username" autoComplete="username" value={link.email} readOnly />

      <div className="space-y-2">
        <Label htmlFor="invite-password">Enter new password</Label>
        <PasswordInput
          id="invite-password"
          name="password"
          autoComplete="new-password"
          minLength={12}
          required
          autoFocus
          readOnly={pending}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(state.error)}
          aria-describedby="invite-password-strength"
        />
        <PasswordStrengthMeter id="invite-password-strength" password={password} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="invite-confirm-password">Confirm new password</Label>
        <PasswordInput
          id="invite-confirm-password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          readOnly={pending}
          aria-invalid={Boolean(state.error)}
          aria-describedby={state.error ? "invite-error" : undefined}
        />
      </div>

      {state.error ? (
        <p id="invite-error" role="alert" className="text-sm leading-5 text-destructive">
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
