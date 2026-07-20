"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";
import { NavIcon } from "./nav-icons";

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="app-nav" aria-label="Primary">
      <div className="app-nav-label">Menu</div>
      {NAV.map((n) => {
        const active = pathname === n.href;
        return (
          <Link
            key={n.href}
            href={n.href}
            className={active ? "app-nav-item active" : "app-nav-item"}
            aria-current={active ? "page" : undefined}
          >
            <NavIcon href={n.href} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
