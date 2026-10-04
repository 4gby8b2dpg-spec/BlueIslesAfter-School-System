// Browser-side Supabase client (client components).
// Uses the public anon key; all access is still gated by Row-Level Security.
import { createBrowserClient } from "@supabase/ssr";

// "Remember me" off = the sign-in cookies are session cookies (no expiry), so
// the browser forgets them when it closes. Login sets this flag cookie first.
export const SESSION_ONLY_COOKIE = "bi_session_only";

export function setSessionOnly(on: boolean) {
  document.cookie = on
    ? `${SESSION_ONLY_COOKIE}=1; path=/; SameSite=Lax`
    : `${SESSION_ONLY_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

function isSessionOnly() {
  return document.cookie.split("; ").some((c) => c === `${SESSION_ONLY_COOKIE}=1`);
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return document.cookie
            .split("; ")
            .filter(Boolean)
            .map((c) => {
              const i = c.indexOf("=");
              return { name: c.slice(0, i), value: c.slice(i + 1) };
            });
        },
        setAll(cookiesToSet) {
          const sessionOnly = isSessionOnly();
          cookiesToSet.forEach(({ name, value, options }) => {
            let cookie = `${name}=${value}; path=${options?.path ?? "/"}; SameSite=${options?.sameSite ?? "Lax"}`;
            // Omit max-age entirely for session-only sign-ins.
            if (!sessionOnly && options?.maxAge !== undefined) cookie += `; max-age=${options.maxAge}`;
            if (options?.secure) cookie += "; Secure";
            document.cookie = cookie;
          });
        },
      },
    },
  );
}
