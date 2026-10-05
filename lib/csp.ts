// Content-Security-Policy, built per request with a fresh nonce (see proxy.ts).
// Scripts need the nonce or 'strict-dynamic' trust from a nonced script, so an
// injected <script> is blocked even if the page is compromised. Next.js reads
// the nonce from this header and applies it to its own inline bootstrap scripts.
//
// Styles keep 'unsafe-inline': Next.js and styled-jsx emit inline style
// attributes and tags that can't be nonced without a much larger change.
export function buildCsp(nonce: string) {
  const isDev = process.env.NODE_ENV !== "production";
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // Next.js dev tooling evaluates code at runtime; production does not.
    ...(isDev ? ["'unsafe-eval'"] : []),
  ].join(" ");

  return [
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
}
