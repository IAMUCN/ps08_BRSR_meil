"use client";

import { RotateCcw, Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { actionLabel, suggest, type Suggestion } from "@/lib/audit/words";

// The Audit Trail's filters (owner's page feedback, 2026-11-11; .grill/page-feedback-2026-11-11-decisions.md):
// they apply as they change (typed boxes half a second after typing stops), follow each other (Only my
// activity greys out Role and User; a role narrows the people; a person sets or narrows the role; Action shows
// only what the chosen people did), and the search suggests people, roles, actions, activities, org units and
// periods as you type. Filters live in the URL.

export type AuditFilterValues = Record<string, string | undefined>;

type Options = {
  users: { id: string; name: string; roleCodes?: string[]; events?: string[] }[];
  eventTypes: string[];
  entityTypes: string[];
  roles?: { code: string; name: string }[];
  reach?: "all" | "units" | "own";
  activities?: string[];
  orgUnits?: string[];
  periods?: string[];
};

const TYPED = ["q", "id"] as const;
const label = "flex flex-col gap-1 text-xs text-muted-foreground";

export function AuditFilters({
  options,
  values,
  compact = false,
}: {
  options: Options;
  values: AuditFilterValues;
  /** My Activity: search, action and dates only (the entries are all the caller's own). */
  compact?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const listId = useId();
  const [text, setText] = useState({ q: values.q ?? "", id: values.id ?? "" });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** Push the filters with `patch` applied; paging restarts. */
  const apply = (patch: AuditFilterValues) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...values, ...patch }))
      if (v && k !== "before_at" && k !== "before_id") next.set(k, v);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  // Typed boxes apply half a second after typing stops.
  const latest = useRef(apply);
  useEffect(() => {
    latest.current = apply;
  });
  // What each typed box last sent, so a value the page drops (a half-typed record id) is not sent again on
  // every navigation.
  const sent = useRef({ q: values.q ?? "", id: values.id ?? "" });
  useEffect(() => {
    const changed = TYPED.filter((k) => {
      const v = text[k].trim();
      if (v === sent.current[k]) return false;
      // A record id is applied only once it is a whole one (or cleared).
      return k !== "id" || v === "" || /^[0-9a-f-]{36}$/i.test(v);
    });
    if (!changed.length) return;
    const timer = setTimeout(() => {
      for (const k of changed) sent.current[k] = text[k].trim();
      latest.current(Object.fromEntries(changed.map((k) => [k, text[k].trim() || undefined])));
    }, 500);
    return () => clearTimeout(timer);
  }, [text]);

  const mine = values.mine === "1";
  const user = options.users.find((u) => u.id === values.user);
  const roles = options.roles ?? [];
  // A person narrows the roles to theirs; a role narrows the people to its holders.
  const roleChoices = user?.roleCodes
    ? roles.filter((r) => user.roleCodes!.includes(r.code))
    : roles;
  const userChoices = values.role
    ? options.users.filter((u) => u.roleCodes?.includes(values.role!))
    : options.users;
  // Action shows what the chosen person, or the chosen role's people, did.
  const actionChoices = useMemo(() => {
    const people = user ? [user] : values.role ? userChoices : null;
    if (!people || mine || !people.every((p) => p.events)) return options.eventTypes;
    const done = new Set(people.flatMap((p) => p.events ?? []));
    return options.eventTypes.filter((e) => done.has(e));
  }, [user, values.role, userChoices, mine, options.eventTypes]);

  const chooseUser = (id: string, extra: AuditFilterValues = {}) => {
    const person = options.users.find((u) => u.id === id);
    // One role: select it. Several: "Any of theirs" (the list narrows to them). None: any role.
    const role = person?.roleCodes?.length === 1 ? person.roleCodes[0] : undefined;
    const event =
      values.event && person?.events && !person.events.includes(values.event)
        ? undefined
        : values.event;
    apply({ ...extra, user: id || undefined, role, event });
  };
  const chooseRole = (code: string, extra: AuditFilterValues = {}) => {
    const keepUser = user && code && user.roleCodes?.includes(code) ? user.id : undefined;
    apply({ ...extra, role: code || undefined, user: code ? keepUser : user?.id });
  };
  const chooseMine = (value: string) =>
    apply({ mine: value || undefined, ...(value ? { user: undefined, role: undefined } : {}) });

  const suggestions = useMemo(
    () =>
      suggest(text.q, {
        users: compact || mine ? [] : userChoices,
        roles: compact || mine ? [] : roleChoices,
        eventTypes: actionChoices,
        activities: options.activities ?? [],
        orgUnits: options.orgUnits ?? [],
        periods: options.periods ?? [],
      }),
    [text.q, compact, mine, userChoices, roleChoices, actionChoices, options],
  );
  // A chosen suggestion either becomes the search words or sets its filter (and the typed words go).
  const pick = (s: Suggestion) => {
    setOpen(false);
    const q = s.set.key === "q" ? s.set.value : "";
    sent.current.q = q;
    setText((t) => ({ ...t, q }));
    if (s.set.key === "user") chooseUser(s.set.value, { q: undefined });
    else if (s.set.key === "role") chooseRole(s.set.value, { q: undefined });
    else if (s.set.key === "event") apply({ q: undefined, event: s.set.value });
    else apply({ q });
  };

  const anySet = Object.entries(values).some(
    ([k, v]) => v && k !== "before_at" && k !== "before_id",
  );
  const clear = () => {
    sent.current = { q: "", id: "" };
    setText({ q: "", id: "" });
    router.push(pathname);
  };

  const showList = open && suggestions.length > 0;
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border bg-card p-3">
      <div className={`${label} relative min-w-56 flex-1`}>
        <label htmlFor="audit-search">Search</label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="audit-search"
            type="search"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList ? `${listId}-${active}` : undefined}
            autoComplete="off"
            className="pl-8 text-sm text-foreground"
            value={text.q}
            onChange={(e) => {
              setText((t) => ({ ...t, q: e.target.value }));
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setOpen(false), 150);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              else if (showList && e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => (i + 1) % suggestions.length);
              } else if (showList && e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (showList && suggestions[active]) pick(suggestions[active]);
                else {
                  setOpen(false);
                  sent.current.q = text.q.trim();
                  apply({ q: text.q.trim() || undefined });
                }
              }
            }}
          />
          {showList ? (
            <ul
              id={listId}
              role="listbox"
              aria-label="Suggestions"
              className="absolute top-full right-0 left-0 z-30 mt-1 max-h-80 overflow-y-auto rounded-md border bg-popover py-1 text-sm text-popover-foreground shadow-md"
              onMouseDown={() => clearTimeout(blurTimer.current)}
            >
              {suggestions.map((s, i) => (
                <li
                  key={`${s.group}:${s.set.key}:${s.set.value}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(s)}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 ${i === active ? "bg-muted" : ""}`}
                >
                  <span className="min-w-0 truncate">{s.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{s.group}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      {options.reach !== "own" ? (
        <label className={label}>
          Show
          <NativeSelect value={values.mine ?? ""} onChange={(e) => chooseMine(e.target.value)}>
            <option value="">
              {options.reach === "units" ? "Everything I may see" : "Everyone"}
            </option>
            <option value="1">Only my activity</option>
          </NativeSelect>
        </label>
      ) : null}
      {roles.length && options.reach !== "own" ? (
        <label className={label}>
          Role
          <NativeSelect
            value={values.role ?? ""}
            disabled={mine}
            title={mine ? "Only your own activity is shown" : undefined}
            onChange={(e) => chooseRole(e.target.value)}
          >
            <option value="">
              {user && roleChoices.length > 1 ? "Any of theirs" : "Any role"}
            </option>
            {roleChoices.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </NativeSelect>
        </label>
      ) : null}
      {compact ? null : (
        <label className={label}>
          User
          <NativeSelect
            value={values.user ?? ""}
            disabled={mine}
            title={mine ? "Only your own activity is shown" : undefined}
            onChange={(e) => chooseUser(e.target.value)}
          >
            <option value="">
              {values.role ? "Anyone with this role" : "Anyone (incl. system)"}
            </option>
            {userChoices.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </NativeSelect>
        </label>
      )}
      <label className={label}>
        Action
        <NativeSelect
          value={values.event ?? ""}
          onChange={(e) => apply({ event: e.target.value || undefined })}
        >
          <option value="">Any action</option>
          {actionChoices.map((e) => (
            <option key={e} value={e}>
              {actionLabel(e)}
            </option>
          ))}
        </NativeSelect>
      </label>
      {compact ? null : (
        <>
          <label className={label}>
            Record type
            <NativeSelect
              value={values.entity ?? ""}
              onChange={(e) => apply({ entity: e.target.value || undefined })}
            >
              <option value="">Any</option>
              {options.entityTypes.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className={label}>
            Record id
            <Input
              className="w-72 max-w-[calc(100vw-7rem)] font-mono text-xs"
              value={text.id}
              onChange={(e) => setText((t) => ({ ...t, id: e.target.value }))}
            />
          </label>
        </>
      )}
      <label className={label}>
        From
        <Input
          type="date"
          value={values.from ?? ""}
          max={values.to || undefined}
          onChange={(e) => apply({ from: e.target.value || undefined })}
        />
      </label>
      <label className={label}>
        To
        <Input
          type="date"
          value={values.to ?? ""}
          min={values.from || undefined}
          onChange={(e) => apply({ to: e.target.value || undefined })}
        />
      </label>
      {anySet ? (
        <Button type="button" variant="outline" onClick={clear} className="h-10">
          <RotateCcw aria-hidden />
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
