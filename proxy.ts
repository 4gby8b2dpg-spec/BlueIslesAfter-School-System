import { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { buildCsp } from "@/lib/csp";

export async function proxy(request: NextRequest) {
  // One nonce per request. Next.js reads it from the request's CSP header and
  // applies it to the inline scripts it renders for this response.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);
  const forwarded = new NextRequest(request.url, {
    headers: requestHeaders,
    method: request.method,
  });

  const response = await updateSession(forwarded);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Run on everything except static assets and image/font files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
  ],
};
