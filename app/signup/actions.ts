"use server";

import { createHash } from "node:crypto";

// Breached-password check using the free HaveIBeenPwned "range" API. Only the
// first five characters of the password's SHA-1 hash are sent; the password
// and the rest of the hash never leave the server. Fails open: if the service
// is slow or unreachable, sign-up is not blocked.
export async function isPasswordBreached(password: string): Promise<boolean> {
  if (!password) return false;

  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      // Padding hides how many real matches the prefix has.
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return false;

    const body = await res.text();
    return body.split("\n").some((line) => {
      const [candidate, count] = line.trim().split(":");
      return candidate === suffix && Number(count) > 0;
    });
  } catch {
    return false;
  }
}
