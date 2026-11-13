// The order of the Users list. Pure, so it can be tested without a browser.

export type UserSort = "role" | "name";

type Sortable = {
  displayName: string;
  assignments: { roleCode: string; roleName: string }[];
};

const byName = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" });

/** Super Admin, then Administrator, then the other roles by name: the order of the role pickers. */
function compareRoles(
  a: { roleCode: string; roleName: string },
  b: { roleCode: string; roleName: string },
) {
  const rank = (code: string) =>
    code === "admin" ? 0 : code === "org_admin" ? 1 : code === "bu_manager" ? 2 : 3;
  return rank(a.roleCode) - rank(b.roleCode) || byName(a.roleName, b.roleName);
}

/** The role a person is listed under when they hold several: the highest. Undefined when they hold none. */
function topRole(user: Sortable) {
  return [...user.assignments].sort(compareRoles)[0];
}

/** A new array. By role: people with no role come last, and within a role people go by name. */
export function sortUsers<T extends Sortable>(users: T[], sort: UserSort): T[] {
  return [...users].sort((a, b) => {
    if (sort === "role") {
      const roleA = topRole(a);
      const roleB = topRole(b);
      if (roleA && roleB) {
        const order = compareRoles(roleA, roleB);
        if (order !== 0) return order;
      } else if (roleA || roleB) {
        return roleA ? -1 : 1;
      }
    }
    return byName(a.displayName, b.displayName);
  });
}
