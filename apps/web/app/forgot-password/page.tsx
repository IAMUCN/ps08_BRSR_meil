import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot password · TraceESG" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot password"
      description="Enter your account email and we'll send you a link to choose a new password."
    >
      <ForgotPasswordForm />
      <p className="mt-4 text-sm leading-5">
        <Link
          href="/login"
          className="font-medium text-primary-text underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}
