"use client";

import { Loader2, PlayCircle } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { submitDemoRequest } from "@/app/demo-request/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// "Request a demo" (owner's request, 2026-11-11; A55): a short form (name, email, phone) in a window over the
// landing page. When the server has stored the request it hands back the demo video, which plays here in the
// app's own player. No link is shown or sent; the page holds no video until the form is sent.

type Errors = Partial<Record<"name" | "email" | "phone" | "form", string>>;

export function DemoRequestButton({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open ? <DemoRequestDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function DemoRequestDialog({ onClose }: { onClose: () => void }) {
  const id = useId();
  const [values, setValues] = useState({ name: "", email: "", phone: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    const result = await submitDemoRequest(values).catch(() => null);
    setSending(false);
    if (!result) return setErrors({ form: "The request could not be sent. Try again." });
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    setVideoId(result.videoId);
  }

  const field = (key: "name" | "email" | "phone", label: string, type: string, auto: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Input
        id={`${id}-${key}`}
        type={type}
        autoComplete={auto}
        required
        value={values[key]}
        disabled={sending}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
      />
      {errors[key] ? (
        <p id={`${id}-${key}-error`} className="text-xs text-status-error">
          {errors[key]}
        </p>
      ) : null}
    </div>
  );

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className={videoId ? "sm:max-w-4xl" : "sm:max-w-md"}>
        {videoId ? (
          <>
            <DialogHeader>
              <DialogTitle>EmeilSG demo</DialogTitle>
              <DialogDescription>
                Thank you, {values.name.split(" ")[0]}. We have your request and will be in touch.
              </DialogDescription>
            </DialogHeader>
            <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
              <iframe
                className="absolute inset-0 size-full"
                // The privacy-enhanced player: no YouTube cookies until the person plays it; no related videos.
                src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                title="EmeilSG demo video"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PlayCircle className="size-5 text-primary-text" aria-hidden />
                Request a demo
              </DialogTitle>
              <DialogDescription>
                Tell us how to reach you. The demo video plays right after you send this.
              </DialogDescription>
            </DialogHeader>
            {field("name", "Name", "text", "name")}
            {field("email", "Email", "email", "email")}
            {field("phone", "Phone number", "tel", "tel")}
            {errors.form ? (
              <p role="alert" className="text-sm text-status-error">
                {errors.form}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={sending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#E91029] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#d00e24] disabled:opacity-60"
            >
              {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {sending ? "Sending…" : "Send and watch the demo"}
            </button>
            <p className="text-xs text-muted-foreground">
              Your details are used only to contact you about EmeilSG.
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
