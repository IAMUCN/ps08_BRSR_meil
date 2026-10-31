"use client";

import { Loader2, Search, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmployeeBulkImport } from "@/components/bulk-import/employee-bulk-import";
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
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { isFrozen, levelLabel, type OrgLevel } from "@/lib/org/rules";
import { bulkImportUsersAction } from "@/lib/bulk-import/actions";
import type { OrgUnitRow } from "@/lib/trpc/routers/organization";
import type { InvitationInfo, UserRow, UserStatus } from "@/lib/trpc/routers/users";
import {
  addAssignmentAction,
  deactivateUserAction,
  updateInvitedUserAction,
  deleteUserAction,
  inviteUserAction,
  reactivateUserAction,
  resendInviteAction,
  revokeAssignmentAction,
  revokeInviteAction,
} from "./actions";

type RoleOption = { id: string; code: string; name: string };
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const STATUS: Record<UserStatus, { tone: StatusTone; label: string }> = {
  active: { tone: "success", label: "Active" },
  invited: { tone: "warning", label: "Invited" },
  deactivated: { tone: "locked", label: "Deactivated" },
};

/** Where an invited account's link stands, in a few words. */
function invitationNote(invitation: InvitationInfo): string {
  switch (invitation.state) {
    case "pending":
      return invitation.expiresAt
        ? `Link valid until ${new Date(invitation.expiresAt).toLocaleString(undefined, {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}`
        : "Link sent";
    case "expired":
      return "Link expired";
    case "revoked":
      return "Link revoked";
    case "none":
      return "No link sent yet";
  }
}

function useRun(onDone: () => void) {
  const [pending, startTransition] = useTransition();
  function run<T>(action: () => Promise<Result<T>>, success: string, after?: (data: T) => void) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      after?.(result.data);
      onDone();
    });
  }
  return { pending, run };
}

/** Name and email of someone still invited. The server refuses anyone else. */
function InvitedDetails({ user, onDone }: { user: UserRow; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email);
  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateInvitedUserAction({ userId: user.id, displayName, email });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.data.emailChanged && !result.data.emailSent) {
        toast.error(
          `Saved, but the email was not sent: ${result.data.emailError}. Choose Resend invitation.`,
        );
      } else {
        toast.success(
          result.data.emailChanged ? `New invitation link emailed to ${email}` : "Name saved",
        );
      }
      setEditing(false);
      onDone();
    });
  }

  if (!editing) {
    return (
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        Edit name and email
      </Button>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-md border p-3">
      <div className="space-y-2">
        <Label htmlFor="invited-name">Name</Label>
        <Input
          id="invited-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="invited-email">Email</Label>
        <Input
          id="invited-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      {emailChanged ? (
        <p className="text-sm text-muted-foreground">
          The earlier link stops working and a new one goes to this address.
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Save
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            setDisplayName(user.displayName);
            setEmail(user.email);
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Role + scope picker. The Admin role is locked to the root (.grill/phase-4-admin-foundation-decisions.md). */
function RoleScopeFields({
  idPrefix,
  roles,
  nodes,
  levels,
  roleId,
  orgUnitId,
  onRole,
  onOrg,
}: {
  idPrefix: string;
  roles: RoleOption[];
  nodes: OrgUnitRow[];
  levels: OrgLevel[];
  roleId: string;
  orgUnitId: string;
  onRole: (id: string) => void;
  onOrg: (id: string) => void;
}) {
  const root = nodes.find((n) => n.parentId === null);
  const isAdminRole = roles.find((r) => r.id === roleId)?.code === "admin";
  const assignable = nodes.filter((n) => n.inScope && !isFrozen(n.id, nodes));

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-role`}>Role</Label>
        <NativeSelect
          id={`${idPrefix}-role`}
          value={roleId}
          required
          onChange={(e) => {
            onRole(e.target.value);
            if (roles.find((r) => r.id === e.target.value)?.code === "admin" && root)
              onOrg(root.id);
          }}
        >
          <option value="">Select a role…</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-org`}>Organization scope</Label>
        <NativeSelect
          id={`${idPrefix}-org`}
          value={orgUnitId}
          required
          disabled={isAdminRole}
          onChange={(e) => onOrg(e.target.value)}
          aria-describedby={isAdminRole ? `${idPrefix}-org-hint` : undefined}
        >
          <option value="">Select a node…</option>
          {assignable.map((node) => (
            <option key={node.id} value={node.id}>
              {node.name} ({levelLabel(levels, node.unitType)})
            </option>
          ))}
        </NativeSelect>
        {isAdminRole ? (
          <p id={`${idPrefix}-org-hint`} className="text-xs leading-4 text-muted-foreground">
            The Super Admin role is organization-wide, so it is assigned at the root.
          </p>
        ) : null}
      </div>
    </>
  );
}

export function UsersManager({
  currentUserId,
  users,
  roles,
  nodes,
  levels,
  bulkImportOptions,
}: {
  currentUserId: string;
  users: UserRow[];
  roles: RoleOption[];
  nodes: OrgUnitRow[];
  levels: OrgLevel[];
  bulkImportOptions: {
    roles: { code: string; name: string }[];
    orgUnits: {
      code: string;
      name: string;
      unitType: string;
      level: string;
      parentCode: string | null;
      depth: number;
    }[];
    withoutCode: string[];
  };
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "">("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [managedId, setManagedId] = useState<string | null>(null);
  // One side panel at a time. They dock in the same place on a wide screen and do not close when the page
  // is clicked, so opening a second one over the first left the first "open" underneath: its button then
  // did nothing (owner's page feedback, 2026-10-11).
  const show = (panel: "invite" | "bulk" | { user: string }) => {
    setInviteOpen(panel === "invite");
    setBulkOpen(panel === "bulk");
    setManagedId(typeof panel === "object" ? panel.user : null);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter(
      (u) =>
        (statusFilter === "" || u.status === statusFilter) &&
        (q === "" ||
          u.displayName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.assignments.some((a) => `${a.roleName} ${a.orgUnitName}`.toLowerCase().includes(q))),
    );
  }, [users, query, statusFilter]);

  const managed = users.find((u) => u.id === managedId) ?? null;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="user-search">Search</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-3 left-2.5 size-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="user-search"
              className="w-72 max-w-[calc(100vw-7rem)] pl-8"
              placeholder="Name, email, role or node"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="status-filter">Status</Label>
          <NativeSelect
            id="status-filter"
            className="w-44"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as UserStatus | "")}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="deactivated">Deactivated</option>
          </NativeSelect>
        </div>
        <Button variant="outline" className="ml-auto" onClick={() => show("bulk")}>
          <Users aria-hidden />
          Bulk import
        </Button>
        <Button onClick={() => show("invite")}>
          <UserPlus aria-hidden />
          Invite user
        </Button>
      </div>

      {/* In the side panel like Invite user (owner's page feedback, 2026-10-11): on a wide screen it docks in
          the empty space at the right and the user list stays in view. */}
      <Sheet open={bulkOpen} onOpenChange={setBulkOpen}>
        <SheetContent className="w-[640px] max-w-full">
          <SheetHeader>
            <SheetTitle>Bulk import</SheetTitle>
            <SheetDescription>
              Create several accounts at once from a filled-in spreadsheet. Download the template
              first; it lists the roles and org units as they are now.
            </SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-4 pb-6">
            <EmployeeBulkImport
              roles={bulkImportOptions.roles}
              orgUnits={bulkImportOptions.orgUnits}
              withoutCode={bulkImportOptions.withoutCode}
              importAction={bulkImportUsersAction}
              onImported={() => router.refresh()}
            />
          </div>
        </SheetContent>
      </Sheet>

      <div className="overflow-x-auto rounded-md border border-table-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-table-header text-table-header-foreground">
            <tr>
              {["Name", "Employee ID", "Email", "Status", "Assignments", ""].map((heading, i) => (
                <th
                  key={i}
                  scope="col"
                  className="px-3 py-3 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase"
                >
                  {heading || <span className="sr-only">Actions</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="bg-table-row px-3 py-8 text-center text-muted-foreground"
                >
                  {users.length === 0
                    ? "No users yet — invite your first team member."
                    : "No users match these filters — clear the search or filters to see everyone."}
                </td>
              </tr>
            ) : (
              filtered.map((user) => (
                <tr
                  key={user.id}
                  className="border-t border-table-border bg-table-row even:bg-table-row-alt hover:bg-table-row-hover"
                >
                  <td className="px-3 py-3 font-medium">{user.displayName}</td>
                  <td className="px-3 py-3 font-mono text-xs">
                    {user.employeeId ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">{user.email}</td>
                  <td className="px-3 py-3">
                    <StatusBadge tone={STATUS[user.status].tone}>
                      {STATUS[user.status].label}
                    </StatusBadge>
                    {user.invitation ? (
                      <span
                        className="mt-1 block text-xs text-muted-foreground"
                        suppressHydrationWarning
                      >
                        {invitationNote(user.invitation)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    {user.assignments.length === 0 ? (
                      <span className="text-muted-foreground">None</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {user.assignments.map((a) => (
                          <li key={a.id}>
                            {a.roleName} · {a.orgUnitName}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={user.id === currentUserId}
                      title={
                        user.id === currentUserId
                          ? "You can't manage your own account. Another Admin can."
                          : undefined
                      }
                      onClick={() => show({ user: user.id })}
                    >
                      Manage
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <InviteSheet
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        roles={roles}
        nodes={nodes}
        levels={levels}
        onDone={() => router.refresh()}
      />
      {managed ? (
        <ManageSheet
          key={managed.id}
          user={managed}
          currentUserId={currentUserId}
          otherActiveAdmins={
            users.filter(
              (u) =>
                u.id !== managed.id &&
                u.status !== "deactivated" &&
                u.assignments.some((a) => a.roleCode === "admin"),
            ).length
          }
          roles={roles}
          nodes={nodes}
          levels={levels}
          onClose={() => setManagedId(null)}
          onDone={() => router.refresh()}
        />
      ) : null}
    </>
  );
}

function InviteSheet({
  open,
  onOpenChange,
  roles,
  nodes,
  levels,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: RoleOption[];
  nodes: OrgUnitRow[];
  levels: OrgLevel[];
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [orgUnitId, setOrgUnitId] = useState("");
  const { pending, run } = useRun(onDone);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    run(
      () => inviteUserAction({ email, displayName, roleId, orgUnitId }),
      "Account created",
      (data) => {
        if (data.emailSent) toast.success(`Invitation link emailed to ${email}`);
        else
          toast.error(
            `The email was not sent: ${data.emailError}. Open the user and choose Resend invitation.`,
          );
        setEmail("");
        setDisplayName("");
        setRoleId("");
        setOrgUnitId("");
        onOpenChange(false);
      },
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Invite user</SheetTitle>
          <SheetDescription>
            They receive an email with a link to choose their own password. The link works once and
            for a limited time; no password is sent.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="space-y-4 px-4">
          <div className="space-y-2">
            <Label htmlFor="invite-name">Name</Label>
            <Input
              id="invite-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <RoleScopeFields
            levels={levels}
            idPrefix="invite"
            roles={roles}
            nodes={nodes}
            roleId={roleId}
            orgUnitId={orgUnitId}
            onRole={setRoleId}
            onOrg={setOrgUnitId}
          />
          <Button type="submit" className="w-full" disabled={pending || !roleId || !orgUnitId}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Send invitation
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ManageSheet({
  user,
  currentUserId,
  otherActiveAdmins,
  roles,
  nodes,
  levels,
  onClose,
  onDone,
}: {
  user: UserRow;
  currentUserId: string;
  /** Other active Admins, so the dialog can say why the last or own Admin access cannot be revoked. */
  otherActiveAdmins: number;
  roles: RoleOption[];
  nodes: OrgUnitRow[];
  levels: OrgLevel[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { pending, run } = useRun(onDone);
  const [roleId, setRoleId] = useState("");
  const [orgUnitId, setOrgUnitId] = useState("");
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [revokeInviteOpen, setRevokeInviteOpen] = useState(false);
  const isSelf = user.id === currentUserId;
  const revoking = user.assignments.find((a) => a.id === revokeId);
  const deactivating = user.status !== "deactivated";

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{user.displayName}</SheetTitle>
          <SheetDescription className="font-mono">{user.email}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 overflow-y-auto px-4 pb-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge tone={STATUS[user.status].tone}>{STATUS[user.status].label}</StatusBadge>
              {user.invitation && user.manageable ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => resendInviteAction({ userId: user.id }),
                        "New invitation link emailed",
                      )
                    }
                  >
                    Resend invitation
                  </Button>
                  {user.invitation.state === "pending" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => setRevokeInviteOpen(true)}
                    >
                      Revoke link
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
            {user.invitation ? (
              <p className="text-sm text-muted-foreground" suppressHydrationWarning>
                {invitationNote(user.invitation)}. They have not chosen a password yet. A new
                invitation replaces the earlier link.
              </p>
            ) : null}
          </div>

          {user.invitation && user.manageable ? (
            <InvitedDetails key={`${user.displayName}|${user.email}`} user={user} onDone={onDone} />
          ) : null}

          <section aria-labelledby="assignments-heading" className="space-y-3">
            <h3 id="assignments-heading" className="text-base leading-6 font-semibold">
              Assignments
            </h3>
            {user.assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active assignments — this user sees no data.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {user.assignments.map((a) => {
                  // The same rules the server enforces (no self-edits; lib/users/rules.ts checkAdminRemoval).
                  const blocked = isSelf
                    ? "You can't change your own roles. Ask another Admin."
                    : a.roleCode === "admin" && otherActiveAdmins < 1
                      ? "At least one active Admin is required."
                      : !a.removable
                        ? "Outside what you administer."
                        : null;
                  return (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <span>
                        <span className="font-medium">{a.roleName}</span> · {a.orgUnitName}
                        {blocked ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {blocked}
                          </span>
                        ) : null}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending || blocked !== null}
                        title={blocked ?? undefined}
                        onClick={() => setRevokeId(a.id)}
                      >
                        Revoke
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            {isSelf ? (
              <p className="text-sm text-muted-foreground">
                You can&apos;t change your own roles. Ask another Admin to add or remove one.
              </p>
            ) : (
              <form
                className="space-y-3 rounded-md border p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(
                    () => addAssignmentAction({ userId: user.id, roleId, orgUnitId }),
                    "Assignment added",
                    () => {
                      setRoleId("");
                      setOrgUnitId("");
                    },
                  );
                }}
              >
                <p className="text-sm font-medium">Add assignment</p>
                <RoleScopeFields
                  levels={levels}
                  idPrefix="assign"
                  roles={roles}
                  nodes={nodes}
                  roleId={roleId}
                  orgUnitId={orgUnitId}
                  onRole={setRoleId}
                  onOrg={setOrgUnitId}
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full"
                  disabled={pending || !roleId || !orgUnitId}
                >
                  Add assignment
                </Button>
              </form>
            )}
          </section>

          <section aria-labelledby="account-heading" className="space-y-2">
            <h3 id="account-heading" className="text-base leading-6 font-semibold">
              Account
            </h3>
            {isSelf ? (
              <p className="text-sm text-muted-foreground">
                You can&apos;t deactivate your own account.
              </p>
            ) : !user.manageable ? (
              <p className="text-sm text-muted-foreground">
                This person also holds a role outside what you administer, so the account itself
                isn&apos;t yours to change. You can still remove the roles inside your own scope.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={deactivating ? "destructive" : "outline"}
                  disabled={pending}
                  onClick={() => setStatusOpen(true)}
                >
                  {deactivating ? "Deactivate user" : "Reactivate user"}
                </Button>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => setDeleteOpen(true)}
                >
                  Delete
                </Button>
              </div>
            )}
          </section>
        </div>

        <ConfirmDialog
          open={revokeId !== null}
          onOpenChange={(open) => !open && setRevokeId(null)}
          title="Revoke assignment?"
          confirmLabel="Revoke"
          destructive
          pending={pending}
          onConfirm={() =>
            revokeId &&
            run(
              () => revokeAssignmentAction({ assignmentId: revokeId }),
              "Assignment revoked",
              () => setRevokeId(null),
            )
          }
        >
          <p>
            {user.displayName} will lose the {revoking?.roleName} role at {revoking?.orgUnitName}.
            Their past submissions remain in the record.
          </p>
        </ConfirmDialog>

        <ConfirmDialog
          open={revokeInviteOpen}
          onOpenChange={setRevokeInviteOpen}
          title="Revoke the invitation link?"
          confirmLabel="Revoke link"
          destructive
          pending={pending}
          onConfirm={() =>
            run(
              () => revokeInviteAction({ userId: user.id }),
              "Invitation link revoked",
              () => setRevokeInviteOpen(false),
            )
          }
        >
          <p>
            The link already emailed to {user.displayName} stops working at once. The account and
            its roles stay; send a new invitation when they should be able to set it up.
          </p>
        </ConfirmDialog>

        <ConfirmDialog
          open={statusOpen}
          onOpenChange={setStatusOpen}
          title={
            deactivating ? `Deactivate ${user.displayName}?` : `Reactivate ${user.displayName}?`
          }
          confirmLabel={deactivating ? "Deactivate" : "Reactivate"}
          destructive={deactivating}
          pending={pending}
          onConfirm={() =>
            run(
              () =>
                deactivating
                  ? deactivateUserAction({ userId: user.id })
                  : reactivateUserAction({ userId: user.id }),
              deactivating ? "User deactivated" : "User reactivated",
              () => setStatusOpen(false),
            )
          }
        >
          <p>
            {deactivating
              ? "They are signed out everywhere immediately and can no longer sign in or read any data. Their history is kept."
              : "They can sign in again with their existing password and regain their current assignments."}
          </p>
        </ConfirmDialog>

        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={`Delete ${user.displayName}?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          onConfirm={() =>
            run(
              () => deleteUserAction({ userId: user.id }),
              "User deleted",
              () => setDeleteOpen(false),
            )
          }
        >
          <p>
            This permanently removes their account and sign-in access — this can&apos;t be undone.
            Their notifications and chat history go with it. It only works if the records do not
            name them (submissions, uploads, verifications, approvals, reports or configuration
            changes); if they do, deactivate them instead.
          </p>
        </ConfirmDialog>
      </SheetContent>
    </Sheet>
  );
}
