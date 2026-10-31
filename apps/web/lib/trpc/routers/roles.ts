import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ROLE_CODE_EXISTS, roleCodeError } from "@/lib/roles/code";
import { writeAudit } from "@/lib/audit";
import { db, pgErrorCode } from "@/lib/db";
import { permissionProcedure, router } from "@/lib/trpc/init";

const roleManage = permissionProcedure("role.manage");

// Lockout guard 3 (.grill/phase-4-admin-foundation-decisions.md): the admin role keeps every permission.
const LOCKED_ROLE_CODE = "admin";

function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

export type RoleMatrix = {
  permissions: { id: string; code: string; description: string | null }[];
  roles: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    isSystemRole: boolean;
    isLocked: boolean;
    /** The role this one uploads documents on behalf of (migration 0049), if any. */
    uploadsForRoleId: string | null;
    activeAssignments: number;
    permissionIds: string[];
  }[];
};

export const rolesRouter = router({
  matrix: roleManage.query(async (): Promise<RoleMatrix> => {
    const sql = db();
    const permissions = await sql<{ id: string; code: string; description: string | null }[]>`
      select id, code, description from public.permissions order by code`;
    const roles = await sql<
      {
        id: string;
        code: string;
        name: string;
        description: string | null;
        is_system_role: boolean;
        uploads_for_role_id: string | null;
        active_assignments: number;
        permission_ids: string[];
      }[]
    >`
      select r.id, r.code, r.name, r.description, r.is_system_role, r.uploads_for_role_id,
             (select count(*)::int from public.user_org_assignments uoa
              where uoa.role_id = r.id and uoa.revoked_at is null) as active_assignments,
             coalesce(array_agg(rp.permission_id) filter (where rp.permission_id is not null), '{}') as permission_ids
      from public.roles r
      left join public.role_permissions rp on rp.role_id = r.id
      group by r.id
      order by case r.code when 'admin' then 0 when 'org_admin' then 1 else 2 end,
               r.is_system_role desc, r.name`;
    return {
      permissions,
      roles: roles.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        isSystemRole: r.is_system_role,
        isLocked: r.code === LOCKED_ROLE_CODE,
        uploadsForRoleId: r.uploads_for_role_id,
        activeAssignments: r.active_assignments,
        permissionIds: r.permission_ids,
      })),
    };
  }),

  create: roleManage
    .input(
      z.object({
        code: z
          .string()
          .trim()
          .superRefine((code, issue) => {
            const message = roleCodeError(code);
            if (message) issue.addIssue({ code: "custom", message });
          }),
        name: z.string().trim().min(1, "Name is required.").max(100),
        description: z
          .string()
          .trim()
          .max(500)
          .transform((d) => (d === "" ? null : d)),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await db().begin(async (tx) => {
          const [created] = await tx<{ id: string }[]>`
            insert into public.roles (code, name, description, is_system_role)
            values (${input.code}, ${input.name}, ${input.description}, false)
            returning id`;
          await writeAudit(tx, {
            eventType: "role.created",
            entityType: "role",
            entityId: created.id,
            userId: ctx.session.userId,
            newValue: input,
          });
          return { id: created.id };
        });
      } catch (error) {
        if (pgErrorCode(error) === "23505") badRequest(ROLE_CODE_EXISTS);
        throw error;
      }
    }),

  /**
   * Name and description only. The code is what assignments, bulk-import sheets and the app's own rules
   * refer to, so it never changes.
   */
  update: roleManage
    .input(
      z.object({
        roleId: z.uuid(),
        name: z.string().trim().min(1, "Name is required.").max(100),
        description: z
          .string()
          .trim()
          .max(500)
          .transform((d) => (d === "" ? null : d)),
        /** Omitted: left as it is. Null: uploads only into its own categories. */
        uploadsForRoleId: z.uuid().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db().begin(async (tx) => {
        const [role] = await tx<
          {
            code: string;
            name: string;
            description: string | null;
            uploads_for_role_id: string | null;
          }[]
        >`
          select code, name, description, uploads_for_role_id from public.roles
          where id = ${input.roleId} for update`;
        if (!role) badRequest("Role not found.");
        const uploadsFor =
          input.uploadsForRoleId === undefined ? role.uploads_for_role_id : input.uploadsForRoleId;
        if (uploadsFor !== role.uploads_for_role_id && uploadsFor !== null) {
          if (role.code === LOCKED_ROLE_CODE)
            badRequest("The Admin role does not upload documents.");
          if (uploadsFor === input.roleId) badRequest("A role can't upload on behalf of itself.");
          const [target] = await tx<{ code: string; uploads_for_role_id: string | null }[]>`
            select code, uploads_for_role_id from public.roles where id = ${uploadsFor}`;
          if (!target) badRequest("Role not found.");
          if (target.code === LOCKED_ROLE_CODE)
            badRequest("The Admin role does not upload documents.");
          // One step only: no chains to follow when deciding what someone may upload.
          if (target.uploads_for_role_id) {
            badRequest(
              "That role already uploads on behalf of another role. Choose that one instead.",
            );
          }
        }
        if (
          role.name === input.name &&
          role.description === input.description &&
          role.uploads_for_role_id === uploadsFor
        )
          return;
        const [taken] = await tx`
          select 1 from public.roles
          where lower(name) = ${input.name.toLowerCase()} and id <> ${input.roleId}`;
        if (taken) badRequest("Another role already has that name.");
        await tx`
          update public.roles
          set name = ${input.name}, description = ${input.description}, uploads_for_role_id = ${uploadsFor}
          where id = ${input.roleId}`;
        await writeAudit(tx, {
          eventType: "role.updated",
          entityType: "role",
          entityId: input.roleId,
          userId: ctx.session.userId,
          oldValue: {
            name: role.name,
            description: role.description,
            uploads_for_role_id: role.uploads_for_role_id,
          },
          newValue: {
            name: input.name,
            description: input.description,
            uploads_for_role_id: uploadsFor,
          },
        });
      });
      return null;
    }),

  setPermissions: roleManage
    .input(z.object({ roleId: z.uuid(), permissionIds: z.array(z.uuid()).max(200) }))
    .mutation(async ({ ctx, input }) => {
      await db().begin(async (tx) => {
        const [role] = await tx<{ code: string }[]>`
          select code from public.roles where id = ${input.roleId} for update`;
        if (!role) badRequest("Role not found.");
        if (role.code === LOCKED_ROLE_CODE) {
          badRequest("The Admin role's permissions are locked to the full catalogue.");
        }
        const requested = [...new Set(input.permissionIds)];
        const valid = await tx<{ id: string; code: string }[]>`
          select id, code from public.permissions where id = any(${requested}::uuid[])`;
        if (valid.length !== requested.length) badRequest("Unknown permission.");

        const before = await tx<{ code: string }[]>`
          select p.code from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
          where rp.role_id = ${input.roleId} order by p.code`;
        await tx`delete from public.role_permissions where role_id = ${input.roleId}`;
        if (requested.length > 0) {
          await tx`
            insert into public.role_permissions (role_id, permission_id)
            select ${input.roleId}, unnest(${requested}::uuid[])`;
        }
        await writeAudit(tx, {
          eventType: "role.permissions_changed",
          entityType: "role",
          entityId: input.roleId,
          userId: ctx.session.userId,
          oldValue: { permissions: before.map((p) => p.code) },
          newValue: { permissions: valid.map((p) => p.code).sort() },
        });
      });
      return null;
    }),

  delete: roleManage.input(z.object({ roleId: z.uuid() })).mutation(async ({ ctx, input }) => {
    await db().begin(async (tx) => {
      const [role] = await tx<{ code: string; name: string; is_system_role: boolean }[]>`
        select code, name, is_system_role from public.roles where id = ${input.roleId} for update`;
      if (!role) badRequest("Role not found.");
      if (role.is_system_role) badRequest("System roles can't be deleted.");
      const [{ assignments }] = await tx<{ assignments: number }[]>`
        select count(*)::int as assignments from public.user_org_assignments where role_id = ${input.roleId}`;
      if (assignments > 0) {
        badRequest(
          "This role has been assigned to users (now or in the past) and can't be deleted.",
        );
      }
      await tx`delete from public.role_permissions where role_id = ${input.roleId}`;
      await tx`delete from public.roles where id = ${input.roleId}`;
      await writeAudit(tx, {
        eventType: "role.deleted",
        entityType: "role",
        entityId: input.roleId,
        userId: ctx.session.userId,
        oldValue: { code: role.code, name: role.name },
      });
    });
    return null;
  }),
});
