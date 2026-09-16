"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { AUTH_MESSAGES } from "@/lib/auth/messages";

const NOTICES = { forbidden: AUTH_MESSAGES.forbidden } as const;

/** §4.4: shows the one-off redirect notice as a toast, then removes `?notice=` from the URL. */
export function NoticeToast({ notice }: { notice: string | undefined }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (notice && notice in NOTICES) {
      toast.error(NOTICES[notice as keyof typeof NOTICES]);
      router.replace(pathname);
    }
  }, [notice, pathname, router]);

  return null;
}
