import { createClient } from "@/lib/supabase/server";
import { RegistrationForm, type RegProgram } from "@/components/registration-form";
import "./register.css";

export const dynamic = "force-dynamic";

export default async function PublicRegistrationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  // Single token-scoped RPC — anon has no direct table access (see 0011).
  const { data } = await supabase.rpc("get_registration_form", { p_token: token });
  const form = data as { org: string; programs: RegProgram[] } | null;

  if (!form) {
    return (
      <main className="rg-wrap">
        <div className="rg-card rg-unavailable">
          <div className="rg-brand">BlueIsles</div>
          <h1>Registration unavailable</h1>
          <p>This registration link is invalid, or it has been closed.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="rg-wrap">
      <div className="rg-card">
        <div className="rg-brand">BlueIsles</div>
        <h1>Register with {form.org}</h1>
        <p className="rg-desc">
          Tell us about your child and choose a program. Our team will review your
          request and follow up to confirm a place.
        </p>
        <RegistrationForm token={token} programs={form.programs ?? []} />
      </div>
    </main>
  );
}
