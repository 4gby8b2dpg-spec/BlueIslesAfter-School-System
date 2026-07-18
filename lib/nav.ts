// Single source of truth for the app sidebar + screen headers.
export type NavItem = { href: string; label: string; title: string; blurb: string };

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", title: "Dashboard", blurb: "" },
  {
    href: "/import",
    label: "Data Import",
    title: "Data Import Center",
    blurb: "Upload Excel/CSV, map columns, validate, and de-duplicate before anything is saved.",
  },
  {
    href: "/participants",
    label: "Participants",
    title: "Participants & Enrollment",
    blurb: "Profiles, guardians, consent flags, and searchable rosters with bulk actions.",
  },
  {
    href: "/programs",
    label: "Programs",
    title: "Programs & Planning",
    blurb: "Programs → activities → recurring sessions, with conflict detection at save time.",
  },
  {
    href: "/attendance",
    label: "Attendance",
    title: "Attendance",
    blurb: "Roster check-in, bulk entry, offline-tolerant kiosk, and missing-attendance alerts.",
  },
  {
    href: "/calendar",
    label: "Calendar",
    title: "Calendar & Scheduling",
    blurb: "Month, week, and day views; drag-to-reschedule; closures that suppress false alerts.",
  },
  {
    href: "/timetable",
    label: "Timetable",
    title: "Weekly Timetable",
    blurb: "Set up recurring weekly program schedules and see the week at a glance, by site.",
  },
  {
    href: "/surveys",
    label: "Surveys",
    title: "Surveys & Feedback",
    blurb: "Build surveys, target audiences, and read per-question results with pre/post pairing.",
  },
  {
    href: "/recognition",
    label: "Recognition",
    title: "Recognition & Rewards",
    blurb: "Attendance milestones, streaks, and most-improved — earned automatically, printable as certificates.",
  },
  {
    href: "/analytics",
    label: "Analytics",
    title: "Analytics Explorer",
    blurb: "Slice any metric by program, site, or grade — the numbers behind the dashboard.",
  },
  {
    href: "/reports",
    label: "Reports",
    title: "Reports",
    blurb: "Monthly, attendance, and grant templates as PDF + Excel, with defensible definitions.",
  },
  {
    href: "/settings",
    label: "Settings",
    title: "Administration",
    blurb: "Users and roles, org settings, terms, categories, and the audit log.",
  },
];
