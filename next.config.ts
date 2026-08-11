import type { NextConfig } from "next";

// Security headers, applied to every route by the Next runtime (which is what
// serves SSR pages on Netlify — netlify.toml headers don't reach those).
// Netlify itself already adds Strict-Transport-Security and
// X-Content-Type-Options, so they're not duplicated here.
//
// The CSP ships REPORT-ONLY first: violations log to the browser console
// without blocking anything. Once it's proven quiet in production, rename the
// header to Content-Security-Policy to enforce. 'unsafe-inline' is required by
// Next.js inline bootstrapping and styled JSX; there are no external font or
// script CDNs (fonts are local font-family stacks).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy-Report-Only", value: csp },
  // frame-ancestors covers modern browsers; this covers the stragglers.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
