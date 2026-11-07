"use client";

import { Loader2 } from "lucide-react";
import { startTransition, useActionState, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { signIn, type SignInState } from "./actions";

const initialState: SignInState = { error: null, email: "", takeover: null };

export function LoginForm({ next }: { next: string | null }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const errorId = state.error ? "login-error" : undefined;
  // The submitted values, kept so "Sign out there and continue" can send them again with the answer (React
  // clears the fields once the action returns). The form keeps its server action, so it still signs in
  // before the page's JavaScript has loaded.
  const submitted = useRef<FormData | null>(null);
  // The question is open while the latest answer asks it and Cancel has not been pressed for that answer.
  const [dismissed, setDismissed] = useState<SignInState | null>(null);
  const asking = Boolean(state.takeover) && dismissed !== state;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    submitted.current = new FormData(event.currentTarget);
  };

  const confirmTakeover = () => {
    const formData = submitted.current;
    if (!formData) return setDismissed(state);
    formData.set("takeover", "confirm");
    startTransition(() => formAction(formData));
  };

  const cancelTakeover = () => {
    // Nothing to undo: the server signed this attempt out before asking.
    submitted.current = null;
    setDismissed(state);
  };

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          readOnly={pending}
          aria-invalid={Boolean(state.error)}
          aria-describedby={errorId}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          readOnly={pending}
          aria-invalid={Boolean(state.error)}
          aria-describedby={errorId}
        />
      </div>

      {state.error ? (
        <p id="login-error" role="alert" className="text-sm leading-5 text-destructive">
          {state.error}
        </p>
      ) : null}

      {state.takeover ? (
        // Also on the page itself, not only in the dialog: a dialog is not drawn before the page's
        // JavaScript runs, and after Cancel the choice stays available (with the password typed again).
        <div role="alert" className="space-y-2 rounded-md border px-3 py-2 text-sm leading-5">
          <p>
            This account is signed in on another device. Enter your password and choose “Sign out
            there and continue” to sign in here instead.
          </p>
          <Button
            type="submit"
            name="takeover"
            value="confirm"
            variant="outline"
            className="w-full"
            disabled={pending}
          >
            Sign out there and continue
          </Button>
        </div>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <ConfirmDialog
        open={asking}
        onOpenChange={(open) => {
          if (!open) cancelTakeover();
        }}
        title="This account is signed in on another device"
        confirmLabel="Sign out there and continue here"
        pending={pending}
        onConfirm={confirmTakeover}
      >
        <p>
          It is signed in on {state.takeover?.device ?? "another device"}
          {state.takeover?.lastActive ? `, last active at ${state.takeover.lastActive}` : ""}. An
          account can be signed in on one device at a time.
        </p>
        <p className="mt-2">
          Continue to sign out there and sign in here. Anything unsaved on the other device will be
          lost. Cancel to sign in nowhere.
        </p>
      </ConfirmDialog>
    </form>
  );
}
