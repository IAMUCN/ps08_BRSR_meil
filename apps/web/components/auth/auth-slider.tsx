"use client";

import { ArrowLeft, ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/brand/logo-mark";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ForgotPasswordForm } from "@/app/forgot-password/forgot-password-form";
import { ShineBorder } from "@/components/ui/shine-border";

type Mode = "signin" | "forgot";

function ForgotPanel({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">Reset password</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your account email and we&apos;ll send a 6-digit code to choose a new password.
        </p>
      </div>
      <ForgotPasswordForm />
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-6 items-center gap-1 text-sm font-medium text-primary hover:underline md:hidden"
      >
        <ArrowLeft className="h-4 w-4" /> Back to sign in
      </button>
    </div>
  );
}

/** Sliding sign-in / forgot-password panel (after codepen.io/FlorinPop17/pen/vPKWjd, no sign-up side). */
export function AuthSlider({
  notice,
  signIn,
  heading = "Sign in",
  footer,
}: {
  notice?: ReactNode;
  signIn: ReactNode;
  heading?: string;
  /** Replaces the "Forgot password?" link and the no-sign-up note under the form. */
  footer?: ReactNode;
}) {
  const [mode, setMode] = useState<Mode>("signin");
  const forgot = mode === "forgot";

  const panel =
    "absolute inset-y-0 left-0 flex w-full flex-col justify-center overflow-y-auto p-6 transition-all duration-500 ease-in-out md:w-1/2 md:p-10";

  return (
    <div className="flex flex-1 flex-col bg-slate-50 [--background:#fff] [--border:#e2e8f0] [--card:#fff] [--input:#cbd5e1] [--muted:#f1f5f9] [--primary:#313490] [--ring:#313490]">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-bold tracking-tight text-[#0B2A5B]"
        >
          <LogoMark className="h-7 w-7" />
          <span>
            Emeil<span className="text-[#1E7A34]">SG</span>
          </span>
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-6 items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#313490]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 items-start justify-center p-4 pb-12 outline-none sm:p-6 md:items-center"
      >
        <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl border bg-card shadow-lg">
          <div className="relative min-h-[640px] w-full text-card-foreground md:min-h-[600px]">
            {/* Sign-in panel */}
            <div
              inert={forgot}
              aria-hidden={forgot}
              className={`${panel} ${
                forgot ? "pointer-events-none opacity-0 md:translate-x-full" : "z-10 opacity-100"
              }`}
            >
              <p className="text-sm font-semibold text-primary">EmeilSG</p>
              <h1 className="mt-1 mb-6 text-2xl font-semibold">{heading}</h1>
              {notice}
              {signIn}
              {footer ?? (
                <>
                  <button
                    type="button"
                    onClick={() => setMode("forgot")}
                    className="mt-4 min-h-6 self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </button>
                  <p className="mt-6 text-xs leading-5 text-muted-foreground">
                    Accounts are created by your administrator. There is no self sign-up.
                  </p>
                </>
              )}
            </div>

            {/* Forgot panel */}
            <div
              inert={!forgot}
              aria-hidden={!forgot}
              className={`${panel} ${
                forgot
                  ? "z-10 opacity-100 md:translate-x-full"
                  : "pointer-events-none opacity-0 md:translate-x-0"
              }`}
            >
              {forgot && <ForgotPanel onBack={() => setMode("signin")} />}
            </div>

            {/* Sliding overlay (desktop) */}
            <div
              aria-hidden
              className={`absolute inset-y-0 left-1/2 z-20 hidden w-1/2 overflow-hidden transition-transform duration-500 ease-in-out md:block ${
                forgot ? "-translate-x-full" : "translate-x-0"
              }`}
            >
              <div className="flex h-full flex-col items-center justify-center gap-4 bg-gradient-to-br from-[#313490] to-[#1e2060] px-10 text-center text-white">
                <ShieldCheck className="h-10 w-10 text-white/80" />
                <h2 className="text-2xl font-semibold">
                  {forgot ? "Remembered it?" : "Locked out?"}
                </h2>
                <p className="text-sm leading-6 text-white/80">
                  {forgot
                    ? "Head back and sign in with your email and password."
                    : "Reset your password with a one-time code sent to your email."}
                </p>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setMode(forgot ? "signin" : "forgot")}
                  className="mt-2 rounded-full border border-white/70 px-8 py-2 text-xs font-semibold uppercase tracking-wider transition-colors hover:bg-white hover:text-[#313490]"
                >
                  {forgot ? "Sign in" : "Reset password"}
                </button>
              </div>
            </div>
          </div>
          <ShineBorder
            borderWidth={2}
            duration={10}
            shineColor={["#313490", "#E91029", "#313490"]}
            className="z-30"
          />
        </div>
      </main>
      <p className="pb-6 text-center text-xs text-slate-500">
        &copy; MEIL &middot; EmeilSG evidence-first BRSR reporting
      </p>
    </div>
  );
}
