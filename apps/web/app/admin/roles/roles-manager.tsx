"use client";

import { Loader2, Lock, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import type { RoleMatrix } from "@/lib/trpc/routers/roles";
import { createRoleAction, deleteRoleAction, setRolePermissionsAction } from "./actions";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export function RolesManager({
  matrix,
  selectedId,
}: {
  matrix: RoleMatrix;
  selectedId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const selected = matrix.roles.find((r) => r.id === selectedId) ?? matrix.roles[0] ?? null;
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(260px,320px)_1fr]">
      <section aria-label="Roles" className="space-y-3">
        <ul className="divide-y rounded-md border bg-card">
          {matrix.roles.map((role) => (
            <li key={role.id}>
              <button
                type="button"
                onClick={() => router.replace(`${pathname}?role=${role.id}`, { scroll: false })}
                aria-current={selected?.id === role.id ? "true" : undefined}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-3 text-left text-sm",
                  selected?.id === role.id ? "bg-table-row-hover" : "hover:bg-muted",
                )}
              >
                <span className="min-w-0">
                  <span className="block font-medium">{role.name}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{role.code}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {role.activeAssignments} assigned
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Button variant="outline" className="w-full" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden />
          Create role
        </Button>
      </section>

      {selected ? (
        <RolePermissions
          key={selected.id}
          role={selected}
          permissions={matrix.permissions}
          onDone={() => router.refresh()}
          onDeleted={() => router.replace(pathname, { scroll: false })}
        />
      ) : null}

      <CreateRoleSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          router.replace(`${pathname}?role=${id}`, { scroll: false });
          router.refresh();
        }}
      />
    </div>
  );
}

function RolePermissions({
  role,
  permissions,
  onDone,
  onDeleted,
}: {
  role: RoleMatrix["roles"][number];
  permissions: RoleMatrix["permissions"];
  onDone: () => void;
  onDeleted: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useState(new Set(role.permissionIds));
  const [deleteOpen, setDeleteOpen] = useState(false);
  const dirty =
    checked.size !== role.permissionIds.length || role.permissionIds.some((id) => !checked.has(id));

  function run<T>(action: () => Promise<Result<T>>, success: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      after?.();
      onDone();
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    run(
      () => setRolePermissionsAction({ roleId: role.id, permissionIds: [...checked] }),
      "Permissions updated",
    );
  }

  return (
    <section aria-labelledby="role-heading" className="rounded-md border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="role-heading" className="text-xl leading-7 font-semibold">
            {role.name}
          </h2>
          {role.description ? (
            <p className="mt-1 max-w-xl text-sm leading-5 text-muted-foreground">
              {role.description}
            </p>
          ) : null}
        </div>
        {role.isLocked ? (
          <StatusBadge tone="locked">Locked</StatusBadge>
        ) : role.isSystemRole ? (
          <StatusBadge tone="neutral">System role</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Custom role</StatusBadge>
        )}
      </div>

      {role.isLocked ? (
        <p className="mt-4 flex items-center gap-2 text-sm leading-5 text-muted-foreground">
          <Lock className="size-4" strokeWidth={1.5} aria-hidden />
          The Admin role always holds every permission, so the platform can never be left without
          anyone able to manage it.
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="mt-6">
        <fieldset disabled={role.isLocked || pending}>
          <legend className="sr-only">Permissions for {role.name}</legend>
          <ul className="divide-y rounded-md border">
            {permissions.map((permission) => (
              <li key={permission.id} className="flex items-start gap-3 px-3 py-3">
                <input
                  id={`perm-${permission.id}`}
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[var(--primary)]"
                  checked={checked.has(permission.id)}
                  onChange={(e) =>
                    setChecked((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(permission.id);
                      else next.delete(permission.id);
                      return next;
                    })
                  }
                />
                <label htmlFor={`perm-${permission.id}`} className="text-sm leading-5">
                  <span className="block font-mono text-xs">{permission.code}</span>
                  <span className="text-muted-foreground">{permission.description}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        {!role.isLocked ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="submit" disabled={pending || !dirty}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Save permissions
            </Button>
            {!role.isSystemRole ? (
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() => setDeleteOpen(true)}
              >
                Delete role
              </Button>
            ) : null}
          </div>
        ) : null}
      </form>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${role.name}?`}
        confirmLabel="Delete role"
        destructive
        pending={pending}
        onConfirm={() =>
          run(() => deleteRoleAction({ roleId: role.id }), "Role deleted", onDeleted)
        }
      >
        <p>
          Roles that have ever been assigned to a user can&apos;t be deleted, to keep the access
          history intact.
        </p>
      </ConfirmDialog>
    </section>
  );
}

function CreateRoleSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createRoleAction({ code, name, description });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Role created");
      setCode("");
      setName("");
      setDescription("");
      onOpenChange(false);
      onCreated(result.data.id);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Create role</SheetTitle>
          <SheetDescription>New roles start with no permissions.</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="space-y-4 px-4">
          <div className="space-y-2">
            <Label htmlFor="role-name">Name</Label>
            <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-code">Code</Label>
            <Input
              id="role-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="font-mono"
              aria-describedby="role-code-hint"
              required
            />
            <p id="role-code-hint" className="text-xs leading-4 text-muted-foreground">
              Lowercase letters, numbers and underscores, e.g.{" "}
              <span className="font-mono">site_auditor</span>.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-description">Description (optional)</Label>
            <textarea
              id="role-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-sm border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Create role
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
