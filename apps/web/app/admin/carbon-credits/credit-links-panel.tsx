"use client";

import { ExternalLink, Info, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import type { CarbonLink } from "@/lib/trpc/routers/carbon-links";
import {
  checkCarbonLinksAction,
  createCarbonLinkAction,
  removeCarbonLinkAction,
  updateCarbonLinkAction,
} from "./actions";

// Where carbon credits can be explored or traded (feature_enhancement.md 6.3, requirement 35; A46). Each link is
// an outside site, named with its address, opened in a new tab. A Super Admin keeps the list and can check every
// address; the last check is shown.

const KINDS: { kind: CarbonLink["kind"]; label: string; blurb: string }[] = [
  {
    kind: "india_official",
    label: "India's carbon market",
    blurb: "The Carbon Credit Trading Scheme's own sites: rules, targets and procedures.",
  },
  {
    kind: "exchange",
    label: "Exchanges",
    blurb: "Where carbon credit certificates are traded once trading opens.",
  },
  {
    kind: "registry",
    label: "International registries",
    blurb: "Voluntary-market registries where projects and credits can be looked up.",
  },
];

function checkedLabel(link: CarbonLink) {
  if (!link.checkedAt) return null;
  const when = new Date(link.checkedAt).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
  const ok = link.checkStatus !== null && link.checkStatus >= 200 && link.checkStatus < 400;
  return { ok, text: ok ? `Address worked on ${when}` : `Did not answer on ${when}` };
}

export function CreditLinksPanel({ links, canEdit }: { links: CarbonLink[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<CarbonLink | "new" | null>(null);

  function check() {
    startTransition(async () => {
      const result = await checkCarbonLinksAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const failed = result.data.filter((r) => !(r.status >= 200 && r.status < 400));
      if (failed.length)
        toast.warning(
          `${failed.length} address(es) did not answer: ${failed.map((f) => f.name).join(", ")}`,
        );
      else toast.success("Every address answered");
      router.refresh();
    });
  }

  function remove(link: CarbonLink) {
    if (!window.confirm(`Remove ${link.name} from the list?`)) return;
    startTransition(async () => {
      const result = await removeCarbonLinkAction({ id: link.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Link removed");
      router.refresh();
    });
  }

  return (
    <section
      aria-labelledby="credit-links-heading"
      className="space-y-4 rounded-md border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="credit-links-heading" className="text-base font-semibold">
            Where to explore or buy carbon credits
          </h2>
          <p className="text-sm text-muted-foreground">Outside sites. Each opens in a new tab.</p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={pending} onClick={check}>
              {pending ? "Checking…" : "Check addresses"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
              <Plus aria-hidden />
              Add link
            </Button>
          </div>
        ) : null}
      </div>

      <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          EmeilSG does not sell, certify or guarantee carbon credits, and is not connected to these
          sites. Check a credit&apos;s registry, methodology and vintage yourself before buying, and
          record what you hold in the ledger below.
        </span>
      </p>

      {KINDS.map(({ kind, label, blurb }) => {
        const group = links.filter((l) => l.kind === kind);
        if (!group.length) return null;
        return (
          <div key={kind} className="space-y-2">
            <h3 className="text-sm font-medium">
              {label} <span className="font-normal text-muted-foreground">— {blurb}</span>
            </h3>
            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {group.map((link) => {
                const checked = checkedLabel(link);
                return (
                  <li
                    key={link.id}
                    className="flex min-w-0 flex-col gap-1 rounded-md border border-border p-3"
                  >
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1 font-medium text-primary-text underline-offset-2 hover:underline"
                    >
                      {link.name}
                      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                      <span className="sr-only">(opens {link.host} in a new tab)</span>
                    </a>
                    <span className="font-mono text-xs break-all text-muted-foreground">
                      {link.host}
                    </span>
                    <p className="text-sm">{link.description}</p>
                    <span className="flex flex-wrap items-center gap-1">
                      {!link.active ? <StatusBadge tone="locked">Hidden</StatusBadge> : null}
                      {checked ? (
                        <StatusBadge tone={checked.ok ? "success" : "warning"}>
                          {checked.text}
                        </StatusBadge>
                      ) : canEdit ? (
                        <StatusBadge tone="neutral">Not checked yet</StatusBadge>
                      ) : null}
                    </span>
                    {canEdit ? (
                      <span className="mt-1 flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(link)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => remove(link)}
                        >
                          Remove
                        </Button>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {links.length === 0 ? <p className="text-sm text-muted-foreground">No links yet.</p> : null}

      {editing ? (
        <LinkSheet
          key={editing === "new" ? "new" : editing.id}
          link={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => router.refresh()}
        />
      ) : null}
    </section>
  );
}

function LinkSheet({
  link,
  onClose,
  onDone,
}: {
  link: CarbonLink | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: link?.name ?? "",
    url: link?.url ?? "https://",
    description: link?.description ?? "",
    kind: link?.kind ?? ("india_official" as CarbonLink["kind"]),
    position: String(link?.position ?? 100),
    active: link?.active ?? true,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const fields = {
      name: form.name,
      url: form.url,
      description: form.description,
      kind: form.kind,
      position: Number(form.position) || 0,
    };
    startTransition(async () => {
      const result = link
        ? await updateCarbonLinkAction({ ...fields, id: link.id, active: form.active })
        : await createCarbonLinkAction(fields);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(link ? "Link saved" : "Link added");
      onClose();
      onDone();
    });
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{link ? `Edit ${link.name}` : "Add a link"}</SheetTitle>
          <SheetDescription>
            An outside site where credits can be explored or traded. Use the site&apos;s own https
            address; check it with Check addresses after saving.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="space-y-4 overflow-y-auto px-4 pb-6">
          <div className="space-y-2">
            <Label htmlFor="link-name">Name</Label>
            <Input
              id="link-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              minLength={2}
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="link-url">Address</Label>
            <Input
              id="link-url"
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="link-description">What it is</Label>
            <Input
              id="link-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required
              minLength={2}
              maxLength={500}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="link-kind">Group</Label>
              <NativeSelect
                id="link-kind"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as CarbonLink["kind"] })}
              >
                {KINDS.map((k) => (
                  <option key={k.kind} value={k.kind}>
                    {k.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-position">Order</Label>
              <Input
                id="link-position"
                type="number"
                min={0}
                max={1000}
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
              />
            </div>
          </div>
          {link ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Show this link
            </label>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {link ? "Save link" : "Add link"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
