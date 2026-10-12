import "server-only";
import nodemailer from "nodemailer";
import { escapeHtml } from "@/lib/reports/html";

// Brevo transactional email (bulk-import-decisions.md), over real SMTP: the key we were given
// (xsmtpsib-…) is Brevo's SMTP key, not its REST "API key" (xkeysib-…) — the REST API's api-key header
// only accepts the latter, so this goes through smtp-relay.brevo.com instead. Used for the
// temporary-password email of a new account (Invite user and bulk import), OTP password reset and
// submission reminders. Supabase Auth's own email sending is not used by the app.
const SMTP_HOST = "smtp-relay.brevo.com";
const SMTP_PORT = 587;

export type SendEmailResult = { sent: true } | { sent: false; reason: string };

let cachedTransport: ReturnType<typeof nodemailer.createTransport> | undefined;

function transport() {
  if (!cachedTransport) {
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
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) {
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

export function accountCreatedEmailHtml(input: {
  displayName: string;
  email: string;
  password: string;
}): string {
  return `<p>Hi ${escapeHtml(input.displayName)},</p>
<p>An account was created for you on EmeilSG.</p>
<p><strong>Email:</strong> ${escapeHtml(input.email)}<br>
<strong>Temporary password:</strong> ${escapeHtml(input.password)}</p>
<p>When you sign in with it, you will be asked to choose your own password before you continue.</p>`;
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
