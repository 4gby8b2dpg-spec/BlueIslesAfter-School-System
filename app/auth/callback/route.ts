import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles the Supabase PKCE email-confirmation redirect (only exercised when
// the project has email confirmation turned on — inert otherwise). Exchanges
// the ?code= for a session, then sends the user to /no-org, which is where
// a signed-in user with no org membership always lands (see app/no-org).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/no-org`);
}
