// User-facing auth copy from 03_APP_FLOW.md §2.1, §3, §4.3–§4.4. One source so the login page,
// server actions and redirects never drift apart.

export const AUTH_MESSAGES = {
  invalidCredentials: "Invalid email or password",
  deactivated: "Your account has been deactivated — contact your Admin",
  unprovisioned: "Your account is not set up yet — contact your Admin",
  retry: "Something went wrong — please try again",
  expired: "Your session expired — please log in again",
  linkInvalid: "This link is invalid or has expired — request a new one",
  invitationInvalid:
    "This invitation link is not valid any more. Ask the person who added you to send a new one.",
  passwordSet: "Your password has been set — log in with your new password",
  forbidden: "You don't have access to that page",
  resetSent: "If that email exists, a 6-digit code has been sent to it.",
  otpInvalid: "That code is incorrect, expired, or already used — request a new one.",
  otpRateLimited: "Too many attempts — wait a while and try again.",
  temporaryPassword:
    "You signed in with a temporary password. Choose your own password to continue.",
  tooManyAttempts: "Too many sign-in attempts — wait 15 minutes and try again",
} as const;

export type LoginReason =
  "expired" | "deactivated" | "unprovisioned" | "link_invalid" | "password_set";

export const LOGIN_NOTICES: Record<LoginReason, { tone: "info" | "error"; message: string }> = {
  expired: { tone: "info", message: AUTH_MESSAGES.expired },
  deactivated: { tone: "error", message: AUTH_MESSAGES.deactivated },
  unprovisioned: { tone: "error", message: AUTH_MESSAGES.unprovisioned },
  link_invalid: { tone: "error", message: AUTH_MESSAGES.linkInvalid },
  password_set: { tone: "info", message: AUTH_MESSAGES.passwordSet },
};

export function isLoginReason(value: unknown): value is LoginReason {
  return typeof value === "string" && value in LOGIN_NOTICES;
}
