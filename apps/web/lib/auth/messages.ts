// User-facing auth copy from 03_APP_FLOW.md §2.1, §3, §4.3–§4.4. One source so the login page,
// server actions and redirects never drift apart.

/** Who people without an account are sent to (owner's instruction, 2026-11-12: the Super Admin). */
export const SIGNUP_CONTACT_EMAIL = "solarsyncx@gmail.com";

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
  replaced: "You were signed out because this account signed in on another device.",
  notRegistered: `No sign-ups are allowed: that Google account isn't registered in EmeilSG. Kindly contact the admin at ${SIGNUP_CONTACT_EMAIL}.`,
  googleFailed:
    "Signing in with Google didn't work — please try again, or sign in with your password.",
  googleNotLinked:
    "Your Google account couldn't be matched to your EmeilSG account. Sign in with your password, or contact your Admin.",
  googleElsewhere:
    "This account is signed in on another device. Continue with Google again to sign out there and sign in here.",
} as const;

export type LoginReason =
  | "expired"
  | "deactivated"
  | "unprovisioned"
  | "link_invalid"
  | "password_set"
  | "replaced"
  | "not_registered"
  | "google_failed"
  | "google_not_linked"
  | "google_elsewhere";

export const LOGIN_NOTICES: Record<LoginReason, { tone: "info" | "error"; message: string }> = {
  expired: { tone: "info", message: AUTH_MESSAGES.expired },
  deactivated: { tone: "error", message: AUTH_MESSAGES.deactivated },
  unprovisioned: { tone: "error", message: AUTH_MESSAGES.unprovisioned },
  link_invalid: { tone: "error", message: AUTH_MESSAGES.linkInvalid },
  password_set: { tone: "info", message: AUTH_MESSAGES.passwordSet },
  replaced: { tone: "info", message: AUTH_MESSAGES.replaced },
  not_registered: { tone: "error", message: AUTH_MESSAGES.notRegistered },
  google_failed: { tone: "error", message: AUTH_MESSAGES.googleFailed },
  google_not_linked: { tone: "error", message: AUTH_MESSAGES.googleNotLinked },
  google_elsewhere: { tone: "info", message: AUTH_MESSAGES.googleElsewhere },
};

export function isLoginReason(value: unknown): value is LoginReason {
  return typeof value === "string" && value in LOGIN_NOTICES;
}
