import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/lib/providers";

export const metadata: Metadata = {
  title: "BlueIsles — After-School Program Intelligence",
  description:
    "Drop your spreadsheets in. Get answers out. One workspace for after-school attendance, enrollment, surveys, and the funder report your board asks for.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
