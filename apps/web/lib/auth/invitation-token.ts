// Invitation links (.grill/scoped-admin-onboarding-decisions.md, migration 0051). Pure — unit-testable.
//
// The token is 32 bytes from the platform's cryptographic generator, written in URL-safe base64. Only its
// SHA-256 is stored. The link carries it after the "#": browsers never send that part to a server, so the
// token stays out of access logs, proxies and Referer headers, and a mail scanner that fetches the link
// gets a page that knows nothing.

import { createHash, randomBytes } from "node:crypto";

export const INVITATION_PATH = "/invite";
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const DEFAULT_INVITATION_HOURS = 24;
const MIN_INVITATION_HOURS = 1;
const MAX_INVITATION_HOURS = 168;

export function newInvitationToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Whether a value has the shape of a token at all; anything else is refused before the database is asked. */
export function isInvitationToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function invitationLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${INVITATION_PATH}#${token}`;
}

/** The `invitation_valid_hours` setting; anything missing or out of range falls back to 24 hours. */
export function invitationValidHours(setting: unknown): number {
  const hours = typeof setting === "number" ? setting : Number.NaN;
  return Number.isInteger(hours) && hours >= MIN_INVITATION_HOURS && hours <= MAX_INVITATION_HOURS
    ? hours
    : DEFAULT_INVITATION_HOURS;
}

export type InvitationState = "pending" | "expired" | "revoked" | "used";

export function invitationState(
  invitation: { consumedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date = new Date(),
): InvitationState {
  if (invitation.consumedAt) return "used";
  if (invitation.revokedAt) return "revoked";
  return invitation.expiresAt.getTime() > now.getTime() ? "pending" : "expired";
}

/** "24 hours", "1 hour", "3 days": how long a link is valid, for the email and the screen. */
export function validityLabel(hours: number): string {
  if (hours % 24 === 0 && hours >= 48) return `${hours / 24} days`;
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
