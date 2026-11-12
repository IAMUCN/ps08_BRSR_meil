# An Employee role that uploads for the Project Manager — decisions (2026-10-12)

The owner created a custom role "Employee" (`emp`, permissions `document.upload` and `chat.use`) on hosted and
assigned people to it at projects. Asked what it is for: "The employee is for the specific projects, so the
project manager can rely on him for the uploading of bills."

The role could upload nothing: which activities a person may file is decided by the category's owning role
(`esg_categories.owning_role_id`, one role per category), and a new role owns no category.

| Question | Decision | Whose |
|---|---|---|
| How does a role get another role's activities? | A setting on the role: **Uploads documents on behalf of** another role (`roles.uploads_for_role_id`, migration `0049`, D40). People with the role are then offered that role's categories at the org units they are assigned to | Agent |
| Move the categories to Employee instead? | No: the Project Manager would lose them | Agent |
| Give each employee a second, Project Manager assignment? | No: they would also get everything else a Project Manager can do | Agent |
| What else follows from the setting? | Nothing. Permissions, reminders ("who to remind" stays the owning role) and approval are unchanged; the role needs `document.upload` itself | Agent |
| Chains (A for B, B for C) | Refused, one step only; not for or by the Admin role | Agent |
| Who verifies an employee's upload? | Unchanged rule: the uploader, or anyone in scope holding `record.verify` (the Project Manager) | existing |
| Where is it set? | Roles & Permissions → Edit role | Agent |

Checked 2026-10-12: unit test added (web unit 195/195 with it), the procedures and the upload rules on the
local database 18/18, database tests, typecheck, lint, format. Not viewed in a browser. The column was added to
hosted the same day (additive, nullable); **the Employee role there does not have the setting yet.**
