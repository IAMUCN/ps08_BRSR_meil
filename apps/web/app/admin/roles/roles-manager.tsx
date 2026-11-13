"use client";

import { Loader2, Lock, Pencil, Plus, Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { ROLE_CODE_EXISTS, roleCodeError } from "@/lib/roles/code";
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
import { SUGGESTED_PERMISSIONS } from "@/lib/roles/suggested-permissions";
import { permissionLabel } from "@/lib/roles/permission-labels";
import type { RoleMatrix } from "@/lib/trpc/routers/roles";
import {
  createRoleAction,
  deleteRoleAction,
  setRolePermissionsAction,
  updateRoleAction,
} from "./actions";

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
  const [editOpen, setEditOpen] = useState(false);
  // One side panel at a time: a docked panel stays open when another opens.
  const show = (panel: "create" | "edit") => {
    setCreateOpen(panel === "create");
    setEditOpen(panel === "edit");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(260px,320px)_1fr]">
      <section aria-label="Roles" className="min-w-0 space-y-3">
        <ul className="divide-y rounded-md border bg-card">
          {matrix.roles.map((role) => (
            <li key={role.id}>
              <button
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  router.replace(`${pathname}?role=${role.id}`, { scroll: false });
                }}
                aria-current={selected?.id === role.id ? "true" : undefined}
                className={cn(
                  "flex w-full flex-wrap items-center justify-between gap-2 px-3 py-3 text-left text-sm",
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
        <Button variant="outline" className="w-full" onClick={() => show("create")}>
          <Plus aria-hidden />
          Create role
        </Button>
      </section>

      {selected ? (
        <RolePermissions
          key={selected.id}
          role={selected}
          permissions={matrix.permissions}
          onEdit={() => show("edit")}
          onDone={() => router.refresh()}
          onDeleted={() => router.replace(pathname, { scroll: false })}
        />
      ) : null}

      {selected ? (
        <EditRoleSheet
          key={`edit-${selected.id}-${selected.name}-${selected.description ?? ""}-${selected.uploadsForRoleId ?? ""}`}
          role={selected}
          roles={matrix.roles}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={() => router.refresh()}
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
  onEdit,
  onDone,
  onDeleted,
}: {
  role: RoleMatrix["roles"][number];
  permissions: RoleMatrix["permissions"];
  onEdit: () => void;
  onDone: () => void;
  onDeleted: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [checked, setChecked] = useState(new Set(role.permissionIds));
  const [deleteOpen, setDeleteOpen] = useState(false);
  const suggestedCodes = new Set(SUGGESTED_PERMISSIONS[role.code] ?? []);
  const suggestedIds = permissions.filter((p) => suggestedCodes.has(p.code)).map((p) => p.id);
  const [query, setQuery] = useState("");
  // Saved selection decides the order (so rows do not jump while ticking): selected first, then the rest;
  // inside each group the suggested ones lead, then by name.
  const savedIds = new Set(role.permissionIds);
  const ordered = [...permissions].sort(
    (a, b) =>
      Number(savedIds.has(b.id)) - Number(savedIds.has(a.id)) ||
      Number(suggestedCodes.has(b.code)) - Number(suggestedCodes.has(a.code)) ||
      permissionLabel(a.code).localeCompare(permissionLabel(b.code)),
  );
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? ordered.filter((p) =>
        `${permissionLabel(p.code)} ${p.description ?? ""} ${p.code}`
          .toLowerCase()
          .includes(needle),
      )
    : ordered;
  const missingSuggested = suggestedIds.filter((id) => !checked.has(id)).length;
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
    <section aria-labelledby="role-heading" className="min-w-0 rounded-md border bg-card p-6">
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
        <div className="flex flex-wrap items-center gap-3">
          {role.isLocked ? (
            <StatusBadge tone="locked">Locked</StatusBadge>
          ) : role.isSystemRole ? (
            <StatusBadge tone="neutral">System role</StatusBadge>
          ) : (
            <StatusBadge tone="neutral">Custom role</StatusBadge>
          )}
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            <Pencil aria-hidden />
            Edit role
          </Button>
        </div>
      </div>

      {role.isLocked ? (
        <p className="mt-4 flex items-center gap-2 text-sm leading-5 text-muted-foreground">
          <Lock className="size-4" strokeWidth={1.5} aria-hidden />
          The Admin role always holds every permission, so the platform can never be left without
          anyone able to manage it.
        </p>
      ) : null}

      {!role.isLocked && suggestedIds.length > 0 ? (
        <div role="note" className="mt-4 rounded-md border bg-muted/40 p-4 text-sm leading-5">
          <p className="font-medium">
            We suggest {suggestedIds.length} permission{suggestedIds.length === 1 ? "" : "s"} for{" "}
            {role.name}.
          </p>
          <p className="mt-1 text-muted-foreground">
            They are marked <span className="font-medium">Suggested</span> below. If this role needs
            anything else, tick it as well, then save.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={pending || missingSuggested === 0}
            onClick={() => setChecked((prev) => new Set([...prev, ...suggestedIds]))}
          >
            {missingSuggested === 0
              ? "All suggested permissions ticked"
              : `Tick the ${missingSuggested} missing suggested permission${missingSuggested === 1 ? "" : "s"}`}
          </Button>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="mt-6">
        <div className="relative mb-3">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search permissions"
            aria-label="Search permissions"
            className="pl-8"
          />
        </div>
        <fieldset disabled={role.isLocked || pending}>
          <legend className="sr-only">Permissions for {role.name}</legend>
          <ul className="divide-y rounded-md border">
            {visible.map((permission) => (
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
                  <span className="block font-medium">
                    {permissionLabel(permission.code)}
                    {suggestedCodes.has(permission.code) && !role.isLocked ? (
                      <span className="ml-2 rounded-sm border px-1.5 py-0.5 text-xs font-normal text-foreground">
                        Suggested
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground">{permission.description}</span>
                </label>
              </li>
            ))}
            {visible.length === 0 ? (
              <li className="px-3 py-4 text-sm text-muted-foreground">
                No permission matches &ldquo;{query}&rdquo;.
              </li>
            ) : null}
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

/** Name and description of a role. Its code and, for Admin, its permissions stay as they are. */
function EditRoleSheet({
  role,
  roles,
  open,
  onOpenChange,
  onSaved,
}: {
  role: RoleMatrix["roles"][number];
  roles: RoleMatrix["roles"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");
  const [uploadsFor, setUploadsFor] = useState(role.uploadsForRoleId ?? "");
  const dirty =
    name.trim() !== role.name ||
    description.trim() !== (role.description ?? "") ||
    uploadsFor !== (role.uploadsForRoleId ?? "");
  // A role can stand in for one that uploads in its own right: not Admin, not itself, not a stand-in.
  const behalfOptions = roles.filter(
    (r) =>
      r.id !== role.id && !r.isLocked && (!r.uploadsForRoleId || r.id === role.uploadsForRoleId),
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateRoleAction({
        roleId: role.id,
        name,
        description,
        uploadsForRoleId: uploadsFor || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Role updated");
      onOpenChange(false);
      onSaved();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit role</SheetTitle>
          <SheetDescription>
            Change the name and description. Permissions are ticked on the page; the code cannot
            change because assignments and import sheets refer to it.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="space-y-4 px-4">
          <div className="space-y-2">
            <Label htmlFor="edit-role-name">Name</Label>
            <Input
              id="edit-role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-role-code">Code</Label>
            <Input id="edit-role-code" value={role.code} className="font-mono" readOnly disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-role-description">Description (optional)</Label>
            <textarea
              id="edit-role-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full rounded-sm border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          {!role.isLocked ? (
            <div className="space-y-2">
              <Label htmlFor="edit-role-uploads-for">Uploads documents on behalf of</Label>
              <select
                id="edit-role-uploads-for"
                value={uploadsFor}
                onChange={(e) => setUploadsFor(e.target.value)}
                aria-describedby="edit-role-uploads-for-hint"
                className="h-10 w-full rounded-sm border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">Nobody — its own activities only</option>
                {behalfOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <p
                id="edit-role-uploads-for-hint"
                className="text-xs leading-4 text-muted-foreground"
              >
                People with this role can then upload the activities that role files, at the org
                units they are assigned to. They also need the document.upload permission.
              </p>
            </div>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending || !dirty || !name.trim()}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Save changes
          </Button>
        </form>
      </SheetContent>
    </Sheet>
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
  // Empty is not called out while typing has not started; submitting says so.
  const [submitted, setSubmitted] = useState(false);
  const [taken, setTaken] = useState<string | null>(null);
  const codeError =
    code !== "" || submitted
      ? (roleCodeError(code) ?? (taken === code.trim() ? ROLE_CODE_EXISTS : null))
      : null;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (roleCodeError(code)) return;
    startTransition(async () => {
      const result = await createRoleAction({ code, name, description });
      if (!result.ok) {
        if (result.error === ROLE_CODE_EXISTS) setTaken(code.trim());
        else toast.error(result.error);
        return;
      }
      toast.success("Role created");
      setCode("");
      setName("");
      setDescription("");
      setSubmitted(false);
      setTaken(null);
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
              className={cn(
                "font-mono",
                codeError &&
                  "border-status-error bg-status-error/5 focus-visible:border-status-error",
              )}
              aria-invalid={codeError ? true : undefined}
              aria-describedby="role-code-hint"
            />
            <p
              id="role-code-hint"
              className={cn(
                "text-xs leading-4",
                codeError ? "font-medium text-status-error" : "text-muted-foreground",
              )}
            >
              {codeError ?? (
                <>
                  Lowercase letters, numbers and underscores, e.g.{" "}
                  <span className="font-mono">site_auditor</span>.
                </>
              )}
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
