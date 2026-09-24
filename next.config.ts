import type { NextConfig } from "next";

// Security headers, applied to every route by the Next runtime (which is what
// serves SSR pages on Netlify — netlify.toml headers don't reach those).
// Netlify itself already adds Strict-Transport-Security and
// X-Content-Type-Options, so they're not duplicated here.
//
// Enforced as of 2026-08-13 (was report-only from the Aug 12 security pass).
// Verified quiet first: a full source-and-rendered-HTML audit of every page
// (marketing, login, signup, and every app/(app) route) turned up no
// resource references outside this policy — only same-origin, data:/blob:
// images, and *.supabase.co; the one external call (Resend, in lib/mailer.ts)
// is server-side and isn't subject to browser CSP at all. 'unsafe-inline' is
// required by Next.js inline bootstrapping and styled JSX; there are no
// external font or script CDNs (fonts are local font-family stacks).
const isDev = process.env.NODE_ENV !== "production";
const scriptSrc = isDev
  ? "'self' 'unsafe-inline' 'unsafe-eval'"
  : "'self' 'unsafe-inline'";

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  // https://*.supabase.co: org logos (0020) are served from the public
  // storage bucket, a different origin than 'self'.
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // frame-ancestors covers modern browsers; this covers the stragglers.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // 16.3 auto-generates AGENTS.md/CLAUDE.md; a generated CLAUDE.md would be
  // silently loaded as agent instructions on every session — keep those files
  // deliberate, not generated.
  agentRules: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
