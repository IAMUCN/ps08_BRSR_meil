import "server-only";
import nodemailer from "nodemailer";
import { escapeHtml } from "@/lib/reports/html";

// Brevo transactional email (bulk-import-decisions.md), over real SMTP: the key we were given
// (xsmtpsib-…) is Brevo's SMTP key, not its REST "API key" (xkeysib-…) — the REST API's api-key header
// only accepts the latter, so this goes through smtp-relay.brevo.com instead. Used for the invitation
// link of a new account (Invite user and bulk import), OTP password reset and submission reminders. Supabase Auth's own email sending is not used by the app.
const SMTP_HOST = "smtp-relay.brevo.com";
const SMTP_PORT = 587;

export type SendEmailResult = { sent: true } | { sent: false; reason: string };

/**
 * A mail catcher on this machine, for local development and the end-to-end tests (EMAIL_SMTP_HOST and
 * EMAIL_SMTP_PORT). Only a loopback address is accepted: the setting cannot send a deployed app's email,
 * invitation links included, anywhere else.
 */
function localCatcher(): { host: string; port: number } | null {
  const host = process.env.EMAIL_SMTP_HOST?.trim();
  const port = Number(process.env.EMAIL_SMTP_PORT);
  if (!host || !["127.0.0.1", "localhost", "::1"].includes(host)) return null;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port };
}

let cachedTransport: ReturnType<typeof nodemailer.createTransport> | undefined;

function transport() {
  if (!cachedTransport) {
    const local = localCatcher();
    if (local) {
      cachedTransport = nodemailer.createTransport({ ...local, secure: false, ignoreTLS: true });
      return cachedTransport;
    }
    cachedTransport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      auth: {
        // Brevo's SMTP login is the account's login email; BREVO_SMTP_LOGIN overrides it for accounts
        // where that differs from the verified "from" address.
        user: process.env.BREVO_SMTP_LOGIN || process.env.BREVO_SENDER_EMAIL,
        pass: process.env.BREVO_API_KEY,
      },
    });
  }
  return cachedTransport;
}

/**
 * Returns `{ sent: false }` instead of throwing when Brevo isn't configured yet, so a caller can keep
 * going and just tell the person the email didn't go out (never a false "sent").
 */
export async function sendEmail(input: {
  to: { email: string; name: string };
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  const local = localCatcher();
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || (local ? "no-reply@emeilsg.local" : "");
  if ((!apiKey && !local) || !senderEmail) {
    return { sent: false, reason: "Email sending isn't configured yet." };
  }

  try {
    await transport().sendMail({
      from: `${process.env.BREVO_SENDER_NAME || "EmeilSG"} <${senderEmail}>`,
      to: `${input.to.name} <${input.to.email}>`,
      subject: input.subject,
      html: input.html,
    });
  } catch (error) {
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "The email service rejected the message.",
    };
  }
  return { sent: true };
}

/**
 * The invitation to a new account (migration 0051). The link is the only secret in it: no password is ever
 * emailed. It is written out as text too, for mail programs that do not show links.
 */
export function invitationEmailHtml(input: {
  displayName: string;
  email: string;
  link: string;
  validFor: string;
}): string {
  const link = escapeHtml(input.link);
  return `<p>Hi ${escapeHtml(input.displayName)},</p>
<p>An account was created for you on EmeilSG, for ${escapeHtml(input.email)}.</p>
<p><a href="${link}">Choose your password</a> to finish setting it up. The link works once and for
${escapeHtml(input.validFor)}. After that, ask the person who added you to send a new one.</p>
<p>If the link does not open, copy this address into your browser:<br>${link}</p>
<p>If you were not expecting this, ignore this email. Nothing happens unless a password is chosen.</p>`;
}

export function passwordResetOtpEmailHtml(input: {
  displayName: string;
  code: string;
  expiryMinutes: number;
}): string {
  return `<p>Hi ${escapeHtml(input.displayName)},</p>
<p>Use this code to reset your EmeilSG password:</p>
<p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${escapeHtml(input.code)}</p>
<p>It expires in ${input.expiryMinutes} minutes. If you didn&#39;t request this, ignore this email.</p>`;
}

export function mfaEmailCodeHtml(input: {
  displayName: string;
  code: string;
  expiryMinutes: number;
}): string {
  return `<p>Hi ${escapeHtml(input.displayName)},</p>
<p>Use this code to finish signing in to EmeilSG:</p>
<p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${escapeHtml(input.code)}</p>
<p>It expires in ${input.expiryMinutes} minutes. If you did not just try to sign in, do not share this code and tell your administrator.</p>`;
}

export function submissionReminderEmailHtml(input: {
  displayName: string;
  periodLabel: string;
  closesOn: string | null;
  items: { orgUnitName: string; metricName: string }[];
}): string {
  return `<p>Hi ${escapeHtml(input.displayName)},</p>
<p>These submissions are expected for ${escapeHtml(input.periodLabel)} and nothing has been uploaded yet${
    input.closesOn ? ` (submissions close on ${escapeHtml(input.closesOn)})` : ""
  }:</p>
<ul>${input.items
    .map((i) => `<li>${escapeHtml(i.metricName)} — ${escapeHtml(i.orgUnitName)}</li>`)
    .join("")}</ul>
<p>Sign in to EmeilSG and upload the supporting document for each.</p>`;
}

/**
 * Sent to a Super Admin when their account signed in on another device and the earlier sign-in was ended
 * (migration 0055). It names the new device so the person can tell whether it was them.
 */
export function sessionReplacedEmailHtml(input: {
  displayName: string;
  when: string;
  browser: string;
  address: string;
}): string {
  return `<p>Hi ${escapeHtml(input.displayName)},</p>
<p>Your EmeilSG Super Admin account was signed in on another device at ${escapeHtml(input.when)}, and the
sign-in that was open before was ended.</p>
<p>New device: ${escapeHtml(input.browser)}, from address ${escapeHtml(input.address)}.</p>
<p>If this was you, there is nothing to do. If it was not, sign in, change your password on Profile at once
(that signs every other device out) and tell the other Super Admin.</p>`;
}

/** A deadline reminder (Phase 5): what is still missing, and where to file it. */
export function deadlineReminderEmailHtml(input: {
  displayName: string;
  title: string;
  dueOn: string;
  lines: string[];
  link: string;
  digest: boolean;
  /** The submissions are past their due date: says why an Administrator is being told. */
  overdue?: boolean;
}): string {
  const shown = input.lines.slice(0, 25);
  const more = input.lines.length - shown.length;
  return `<p>Hi ${escapeHtml(input.displayName)},</p>
<p>${escapeHtml(input.title)} (${input.overdue ? "was due" : "due"} ${escapeHtml(input.dueOn)}).</p>
<ul>${shown.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}${more > 0 ? `<li>and ${more} more</li>` : ""}</ul>
<p><a href="${escapeHtml(input.link)}">${input.digest ? "See what is missing" : "Upload the documents"}</a></p>
<p>${
    input.digest
      ? input.overdue
        ? "These submissions are overdue. You are told because you administer these units, or as a Super Admin; the longer they stay missing, the higher it is escalated."
        : "You receive this summary as an Administrator of these units, until nothing is missing."
      : "Reminders stop for each item as soon as its document is uploaded."
  }</p>`;
}

/** Emission threshold alerts found by the daily check, one email per person per run (Phase 7, A47). */
export function emissionAlertEmailHtml(input: {
  displayName: string;
  lines: string[];
  link: string;
}): string {
  const shown = input.lines.slice(0, 25);
  const more = input.lines.length - shown.length;
  return `<p>Hi ${escapeHtml(input.displayName)},</p>
<p>Approved emissions came out above their expected average in ${input.lines.length === 1 ? "one case" : `${input.lines.length} cases`}:</p>
<ul>${shown.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}${more > 0 ? `<li>and ${more} more</li>` : ""}</ul>
<p><a href="${escapeHtml(input.link)}">Open Carbon Analytics</a> to see the figures behind each alert and acknowledge it.</p>
<p>The expected average is the same period in up to three earlier financial years. You receive this as an Administrator of these units or as a Super Admin.</p>`;
}
