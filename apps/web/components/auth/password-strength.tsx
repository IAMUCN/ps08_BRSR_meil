"use client";

import { Check, X } from "lucide-react";
import { cn } from "cn";
import {
  PASSWORD_RULES,
  passwordStrength,
  type PasswordStrengthLabel,
} from "@/lib/auth/password-policy";

const STRENGTH_LABEL: Record<PasswordStrengthLabel, string> = {
  empty: "",
  weak: "Weak",
  fair: "Fair",
  good: "Good",
  strong: "Strong",
};

// Only the three status colours this app defines (UI brief §6.9) — no colour invented for this.
const STRENGTH_TONE: Record<PasswordStrengthLabel, string> = {
  empty: "bg-muted",
  weak: "bg-status-error",
  fair: "bg-status-warning",
  good: "bg-status-warning",
  strong: "bg-status-success",
};
const STRENGTH_TEXT_TONE: Record<PasswordStrengthLabel, string> = {
  empty: "text-muted-foreground",
  weak: "text-status-error",
  fair: "text-status-warning",
  good: "text-status-warning",
  strong: "text-status-success",
};

/**
 * Live password strength meter + criteria checklist (lib/auth/password-policy.ts), used on every screen
 * that sets a password: /reset-password, /forgot-password's second step, and Profile's change-password
 * form. The bar fills and changes colour, and each criterion turns green with a check as it's met — the
 * same rules the server re-checks, so nothing shown here can be more lenient than what actually saves.
 */
export function PasswordStrengthMeter({ password, id }: { password: string; id?: string }) {
  const { score, label } = passwordStrength(password);
  const percent = (score / PASSWORD_RULES.length) * 100;

  return (
    <div id={id} className="space-y-2">
      <div className="flex items-center gap-2">
        <div
          role="progressbar"
          aria-label="Password strength"
          aria-valuemin={0}
          aria-valuemax={PASSWORD_RULES.length}
          aria-valuenow={score}
          aria-valuetext={STRENGTH_LABEL[label] || "Empty"}
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn("h-full rounded-full transition-all duration-200", STRENGTH_TONE[label])}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className={cn("w-10 text-xs font-medium", STRENGTH_TEXT_TONE[label])}>
          {STRENGTH_LABEL[label]}
        </span>
      </div>
      <ul className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        {PASSWORD_RULES.map((rule) => {
          const met = rule.test(password);
          return (
            <li
              key={rule.id}
              className={cn(
                "flex items-center gap-1.5",
                met ? "text-status-success" : "text-muted-foreground",
              )}
            >
              {met ? (
                <Check className="size-3.5 shrink-0" aria-hidden />
              ) : (
                <X className="size-3.5 shrink-0" aria-hidden />
              )}
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
