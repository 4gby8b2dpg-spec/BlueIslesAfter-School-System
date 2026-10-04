// Refreshes the Supabase auth session on every request and gates the app.
// Runs in Next middleware (Edge) — see middleware.ts at the repo root.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes under here require a signed-in user.
const PROTECTED_PREFIXES = ["/dashboard"];

// Signed-in app pages end the session after an hour with no requests.
// The timestamp lives in a session cookie (gone when the browser closes).
// Public pages (kiosk, survey, registration, marketing) are never signed out.
const IDLE_MS = 60 * 60 * 1000;
const ACTIVITY_COOKIE = "bi_active";
const APP_PREFIXES = [
  "/dashboard", "/analytics", "/attendance", "/calendar", "/import",
  "/participants", "/programs", "/recognition", "/registrations", "/reports",
  "/settings", "/surveys", "/timesheet", "/timetable",
];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Fail safe: if Supabase env vars aren't configured (e.g. before they're set
  // in the host), skip auth rather than crashing every request (incl. marketing).
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() revalidates the token — do not remove.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  if (needsAuth && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user) {
    const last = Number(request.cookies.get(ACTIVITY_COOKIE)?.value ?? 0);
    const onAppPage = APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (last && Date.now() - last > IDLE_MS && onAppPage) {
      // scope "local" signs out this browser only, not the person's other devices.
      await supabase.auth.signOut({ scope: "local" });
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("reason", "idle");
      const redirect = NextResponse.redirect(url);
      response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      redirect.cookies.delete(ACTIVITY_COOKIE);
      return redirect;
    }
    response.cookies.set(ACTIVITY_COOKIE, String(Date.now()), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
  }

  return response;
}
