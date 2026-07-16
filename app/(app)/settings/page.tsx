import { ComingSoon } from "@/components/coming-soon";
import { NAV } from "@/lib/nav";

const item = NAV.find((n) => n.href === "/settings")!;

export default function Page() {
  return <ComingSoon title={item.title} blurb={item.blurb} />;
}
