"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { bucket, clientAddress, count, exceeded } from "@/lib/security/rate-limit";

// "Request a demo" on the landing page (owner's request, 2026-11-11; migration 0066, D56): anyone may send it.
// The request is stored and the Super Admins are told in the app; only then does the page receive the video to
// play (a YouTube id kept in org_settings, never in the page before the form is sent).

const REQUESTS_PER_ADDRESS = 5;
const WINDOW_MINUTES = 60;

const form = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(120, "Keep your name to 120 characters."),
  email: z.email("Enter a valid email address.").max(254),
  // Digits with an optional leading +, spaces, hyphens and brackets; 7 to 15 digits in all.
  phone: z
    .string()
    .trim()
    .max(20, "Enter a valid phone number.")
    .refine((v) => /^\+?[\d\s()-]+$/.test(v) && /^(?:\D*\d){7,15}\D*$/.test(v), {
      message: "Enter a valid phone number.",
    }),
});

export type DemoRequestResult =
  | { ok: true; videoId: string }
  | { ok: false; errors: Partial<Record<"name" | "email" | "phone" | "form", string>> };

export async function submitDemoRequest(input: {
  name: string;
  email: string;
  phone: string;
}): Promise<DemoRequestResult> {
  const parsed = form.safeParse(input);
  if (!parsed.success) {
    const errors: Partial<Record<"name" | "email" | "phone", string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "name" | "email" | "phone";
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }
  const limiter = bucket("demo-request-address", clientAddress(await headers()));
  if (await exceeded(limiter, REQUESTS_PER_ADDRESS, WINDOW_MINUTES)) {
    return {
      ok: false,
      errors: { form: "Too many requests from this connection. Try again in an hour." },
    };
  }
  const { name, email, phone } = parsed.data;
  const videoId = await db().begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into public.demo_requests (name, email, phone)
      values (${name}, ${email.toLowerCase()}, ${phone}) returning id`;
    await tx`
      insert into public.notifications
        (user_id, type, title, message, related_entity_type, related_entity_id, deep_link_path)
      select distinct u.id, 'demo_request', 'New demo request',
             ${`${name} asked for a demo.`}, 'demo_request', ${row.id}::uuid, '/admin/demo-requests'
      from public.users u
      join public.user_org_assignments a on a.user_id = u.id and a.revoked_at is null
      join public.roles r on r.id = a.role_id and r.code = 'admin'
      where u.is_active and u.deleted_at is null`;
    const [setting] = await tx<{ id: string | null }[]>`
      select value->>'youtubeId' as id from public.org_settings where key = 'demo_video'`;
    return setting?.id ?? null;
  });
  await count(limiter);
  if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
    return {
      ok: false,
      errors: {
        form: "Thank you, we have your request. The demo video is not available right now.",
      },
    };
  }
  return { ok: true, videoId };
}
