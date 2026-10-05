import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "@/lib/providers";

export const metadata: Metadata = {
  title: "BlueIsles — After-School Program Intelligence",
  description:
    "Drop your spreadsheets in. Get answers out. One workspace for after-school attendance, enrollment, surveys, and the funder report your board asks for.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Reading request headers makes every page render per request, so Next.js
  // can apply this request's CSP nonce to its inline scripts (see proxy.ts).
  await headers();
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
