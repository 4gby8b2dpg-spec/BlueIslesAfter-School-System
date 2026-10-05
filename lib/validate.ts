import { z } from "zod";

// Shared server-side input rules for Server Actions. Every value a form sends
// is untrusted, so each action parses its fields here before touching the
// database. Frontend `required` and `maxLength` attributes are UX only.

export const uuidField = z.uuid();
export const roleField = z.enum(["admin", "director", "staff", "viewer"]);
export const statusField = z.enum(["active", "deactivated", "invited"]);
export const boolText = z.enum(["true", "false"]);
export const nameField = z.string().trim().min(1).max(120);
export const shortText = z.string().trim().min(1).max(200);

// Parses the named fields of a FormData. Returns null when any field is
// missing or invalid, so an action can `return` without writing, the same way
// it already handles bad input.
export function parseFields<T extends z.ZodRawShape>(
  formData: FormData,
  shape: T,
): z.infer<z.ZodObject<T>> | null {
  const raw: Record<string, FormDataEntryValue | undefined> = {};
  for (const key of Object.keys(shape)) {
    raw[key] = formData.get(key) ?? undefined;
  }
  const result = z.object(shape).safeParse(raw);
  return result.success ? result.data : null;
}
