"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MfaSetup } from "@/components/auth/mfa-setup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { disableMfa } from "@/lib/auth/mfa-actions";

/** Profile: two-step sign-in with an authenticator app, on or off. */
export function MfaSettings({ enabled, required }: { enabled: boolean; required: boolean }) {
  const router = useRouter();
  const [turningOff, setTurningOff] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function turnOff() {
    setError(null);
    startTransition(async () => {
      const result = await disableMfa(code);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Authenticator app turned off");
      setTurningOff(false);
      setCode("");
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="mfa-heading" className="rounded-md border bg-card p-6">
      <h2 id="mfa-heading" className="flex items-center gap-2 text-xl leading-7 font-semibold">
        <ShieldCheck className="size-5" aria-hidden />
        Two-step sign-in
      </h2>
      {enabled ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm leading-5">
            An authenticator app is set up. Signing in asks for a 6-digit code from it after your
            password.
          </p>
          {required ? (
            <p className="text-sm leading-5 text-muted-foreground">
              Your organization requires it, so it cannot be turned off. If you lose your phone, ask
              a Super Admin to reset it.
            </p>
          ) : turningOff ? (
            <div className="space-y-2">
              <Label htmlFor="mfa-off-code">Enter a current code to turn it off</Label>
              <Input
                id="mfa-off-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="max-w-40 font-mono tracking-widest"
              />
              {error ? (
                <p role="alert" className="text-sm leading-5 text-destructive">
                  {error}
                </p>
              ) : null}
              <div className="flex gap-3">
                <Button variant="destructive" onClick={turnOff} disabled={pending || !code.trim()}>
                  {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  Turn off
                </Button>
                <Button variant="ghost" onClick={() => setTurningOff(false)} disabled={pending}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setTurningOff(true)}>
              Turn off
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <MfaSetup
            profile
            onDone={() => {
              toast.success("Authenticator app turned on");
              router.refresh();
            }}
          />
        </div>
      )}
    </section>
  );
}
