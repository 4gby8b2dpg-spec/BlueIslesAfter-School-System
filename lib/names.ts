// Names for people in the app.
//
// Until someone sets a name, the app fills it in from the start of their email
// (galliwasponline@gmail.com -> "galliwasponline"). That placeholder is treated
// as "no name yet": an admin's name can replace it, and the person is asked to
// add their own. A real name is never replaced automatically.

export const MAX_NAME_LENGTH = 120;

export function autoName(email: string) {
  return email.split("@")[0]?.toLowerCase() ?? "";
}

export function needsName(fullName: string | null | undefined, email: string) {
  const name = (fullName ?? "").trim();
  return name === "" || name.toLowerCase() === autoName(email);
}

export function cleanName(raw: unknown) {
  return String(raw ?? "").trim().slice(0, MAX_NAME_LENGTH);
}
