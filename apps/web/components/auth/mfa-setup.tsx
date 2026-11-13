"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  confirmMfaEnrollment,
  confirmMfaFromProfile,
  startMfaEnrollment,
  sendMfaEmailCode,
  verifyMfaCode,
  verifyMfaEmailCode,
  type Enrollment,
  type MfaState,
} from "@/lib/auth/mfa-actions";

const initial: MfaState = { error: null };

/** The six-digit box, one field for the code from the authenticator app. */
function CodeField({
  id,
  error,
  disabled,
}: {
  id: string;
  error: string | null;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>6-digit code</Label>
      <Input
        id={id}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        required
        autoFocus
        readOnly={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className="font-mono text-lg tracking-widest"
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm leading-5 text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Sign-in step two for an account that already has an authenticator app. The app is the first choice;
 * "Try another way" offers a code by email; a second "Try another way" ends in a message to contact the admin.
 */
export function MfaChallengeForm({
  next,
  contactEmail,
}: {
  next: string | null;
  contactEmail: string;
}) {
  const [step, setStep] = useState<"app" | "email" | "denied">("app");
  const [appState, appAction, appPending] = useActionState(verifyMfaCode, initial);
  const [emailState, emailAction, emailPending] = useActionState(verifyMfaEmailCode, initial);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, startSend] = useTransition();

  function sendCode() {
    setSendError(null);
    startSend(async () => {
      const result = await sendMfaEmailCode();
      if (result.ok) setSentTo(result.sentTo);
      else setSendError(result.error);
    });
  }

  const another = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-6 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      {label}
    </button>
  );

  if (step === "denied") {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-sm leading-5">
          We could not confirm that you are the owner of this account. Contact your administrator
          for further help at{" "}
          <a href={`mailto:${contactEmail}`} className="font-medium underline">
            {contactEmail}
          </a>
          .
        </p>
        {another("Back to authenticator app", () => setStep("app"))}
      </div>
    );
  }

  if (step === "email") {
    return (
      <div className="space-y-4">
        {sentTo ? (
          <form action={emailAction} className="space-y-4" noValidate>
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <p className="text-sm leading-5 text-muted-foreground">
              We emailed a 6-digit code to <span className="font-mono">{sentTo}</span>. It expires
              in 10 minutes.
            </p>
            <CodeField id="mfa-email-code" error={emailState.error} disabled={emailPending} />
            <Button type="submit" className="w-full" disabled={emailPending}>
              {emailPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {emailPending ? "Checking…" : "Verify and sign in"}
            </Button>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-sm leading-5 text-muted-foreground">
              We can email a 6-digit code to the address on your account.
            </p>
            {sendError ? (
              <p role="alert" className="text-sm leading-5 text-destructive">
                {sendError}
              </p>
            ) : null}
            <Button type="button" className="w-full" onClick={sendCode} disabled={sending}>
              {sending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Email me a code
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-x-4">
          {sentTo ? another("Send a new code", sendCode) : null}
          {another("Try another way", () => setStep("denied"))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form action={appAction} className="space-y-4" noValidate>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <p className="text-sm leading-5 text-muted-foreground">
          Open your authenticator app (Google Authenticator or similar) and enter the 6-digit code
          shown for EmeilSG.
        </p>
        <CodeField id="mfa-code" error={appState.error} disabled={appPending} />
        <Button type="submit" className="w-full" disabled={appPending}>
          {appPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {appPending ? "Checking…" : "Verify and sign in"}
        </Button>
      </form>
      {another("Try another way", () => setStep("email"))}
    </div>
  );
}

/**
 * Setting up an authenticator app: scan the QR code (or type the key), then enter the first code.
 * `profile` finishes in place and calls `onDone`; otherwise it is the sign-in page and continues into the app.
 */
export function MfaSetup({
  profile = false,
  next = null,
  onDone,
}: {
  profile?: boolean;
  next?: string | null;
  onDone?: () => void;
}) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, startTransition] = useTransition();
  const [state, action, pending] = useActionState(confirmMfaEnrollment, initial);
  const [profileError, setProfileError] = useState<string | null>(null);

  function start() {
    setStartError(null);
    startTransition(async () => {
      const result = await startMfaEnrollment();
      if (result.ok) setEnrollment(result.data);
      else setStartError(result.error);
    });
  }

  if (!enrollment) {
    return (
      <div className="space-y-3">
        <p className="text-sm leading-5 text-muted-foreground">
          Use an authenticator app such as Google Authenticator on your phone. You will enter a
          6-digit code from it every time you sign in.
        </p>
        {startError ? (
          <p role="alert" className="text-sm leading-5 text-destructive">
            {startError}
          </p>
        ) : null}
        <Button type="button" className="w-full sm:w-auto" onClick={start} disabled={starting}>
          {starting ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Set up authenticator app
        </Button>
      </div>
    );
  }

  const error = profile ? profileError : state.error;
  const body = (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm leading-5 text-muted-foreground">
        <li>Open Google Authenticator and choose Add (+), then Scan a QR code.</li>
        <li>Scan the code below, or choose Enter a setup key and type the key under it.</li>
        <li>Type the 6-digit code the app now shows for EmeilSG.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI made by Supabase Auth */}
      <img
        src={enrollment.qrCode}
        alt="QR code to add EmeilSG to your authenticator app"
        width={176}
        height={176}
        className="rounded-md border bg-white p-2"
      />
      <p className="text-xs leading-4 text-muted-foreground">
        Setup key: <span className="font-mono break-all select-all">{enrollment.secret}</span>
      </p>
      <input type="hidden" name="factorId" value={enrollment.factorId} />
      <CodeField id="mfa-setup-code" error={error} disabled={pending} />
      <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Confirm and turn on
      </Button>
    </div>
  );

  if (profile) {
    return (
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const code = String(new FormData(event.currentTarget).get("code") ?? "");
          setProfileError(null);
          startTransition(async () => {
            const result = await confirmMfaFromProfile(enrollment.factorId, code);
            if (result.ok) onDone?.();
            else setProfileError(result.error);
          });
        }}
      >
        {body}
      </form>
    );
  }
  return (
    <form action={action} noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {body}
    </form>
  );
}
