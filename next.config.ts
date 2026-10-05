import type { NextConfig } from "next";

// Security headers, applied to every route by the Next runtime (which is what
// serves SSR pages on Netlify — netlify.toml headers don't reach those).
// Netlify itself already adds Strict-Transport-Security and
// X-Content-Type-Options, so they're not duplicated here.
//
// The Content-Security-Policy is set per request in proxy.ts (nonce-based,
// see lib/csp.ts), so it is not listed here.
const securityHeaders = [
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
