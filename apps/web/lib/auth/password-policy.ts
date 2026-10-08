// Password policy: one shared definition for every place a password is set (set/reset/change, the bulk
// import default-password generator) and for the live strength checklist. Pure — no "server-only", so the
// browser can render the checklist live; every server-side setter re-checks the same rules regardless of
// what the client showed (never trust client validation).

export type PasswordRule = { id: string; label: string; test: (password: string) => boolean };

export const PASSWORD_MIN_LENGTH = 12;

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (p) => p.length >= PASSWORD_MIN_LENGTH,
  },
  { id: "uppercase", label: "One uppercase letter (A–Z)", test: (p) => /[A-Z]/.test(p) },
  { id: "lowercase", label: "One lowercase letter (a–z)", test: (p) => /[a-z]/.test(p) },
  { id: "number", label: "One number (0–9)", test: (p) => /[0-9]/.test(p) },
  {
    id: "special",
    label: "One special character (e.g. ! @ # $ % ^ & *)",
    test: (p) => /[^A-Za-z0-9]/.test(p),
  },
];

export function passwordMeetsPolicy(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

/** One sentence naming whatever the password is still missing — for a server error message. */
export function passwordPolicyMessage(password: string): string {
  const missing = PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.label);
  return missing.length === 0
    ? ""
    : `Password needs: ${missing.map((label) => label.replace(/\s*\(.*\)$/, "")).join(", ")}.`;
}

export type PasswordStrengthLabel = "empty" | "weak" | "fair" | "good" | "strong";

export function passwordStrength(password: string): {
  score: number;
  label: PasswordStrengthLabel;
} {
  if (password.length === 0) return { score: 0, label: "empty" };
  const score = PASSWORD_RULES.filter((rule) => rule.test(password)).length;
  const label: PasswordStrengthLabel =
    score <= 2 ? "weak" : score === 3 ? "fair" : score === 4 ? "good" : "strong";
  return { score, label };
}
