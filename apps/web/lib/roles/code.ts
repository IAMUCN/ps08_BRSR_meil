// What a role's code may be. Pure: the form and the server use the same rule and the same words.

export const ROLE_CODE_EXISTS = "This role code already exists.";

export function roleCodeError(code: string): string | null {
  const value = code.trim();
  if (value === "") return "Role code cannot be empty.";
  if (/[A-Z]/.test(value)) return "Uppercase letters are not allowed.";
  if (!/^[a-z0-9_]*$/.test(value)) {
    return "Role code must contain only lowercase letters, numbers, and underscores.";
  }
  if (!/^[a-z]/.test(value)) return "Role code must start with a letter.";
  if (value.length < 2 || value.length > 41) return "Role code must be 2 to 41 characters long.";
  return null;
}
