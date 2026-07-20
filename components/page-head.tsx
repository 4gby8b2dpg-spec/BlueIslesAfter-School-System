import type { ReactNode } from "react";
import { NavIcon } from "./nav-icons";

// Standard screen heading: a gradient spot icon matching the sidebar item,
// the page title, and a one-line description. Keeps every screen wearing the
// same visual language as the dashboard.
export function PageHead({
  href,
  title,
  tone = "teal",
  children,
  className = "",
}: {
  href: string;
  title: string;
  tone?: "teal" | "mint" | "amber" | "coral" | "violet";
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`dash-head page-head ${className}`.trim()}>
      <span className={`page-head-ic spot ${tone}`}>
        <NavIcon href={href} size={20} strokeWidth={2.2} />
      </span>
      <div className="page-head-body">
        <h1>{title}</h1>
        {children ? <p>{children}</p> : null}
      </div>
    </div>
  );
}
