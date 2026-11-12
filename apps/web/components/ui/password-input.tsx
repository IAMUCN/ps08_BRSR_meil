"use client";

import { Eye, EyeOff } from "lucide-react";
import * as React from "react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";

/** A password field with a button that shows or hides what was typed. */
function PasswordInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = React.useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        // Edge draws its own reveal icon; hide it so there is only one.
        className={cn("pr-10 [&::-ms-clear]:hidden [&::-ms-reveal]:hidden", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Icon className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

export { PasswordInput };
