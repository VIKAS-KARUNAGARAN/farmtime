"use client";
import { useEffect, type ComponentType, type ReactNode } from "react";
import { useHashPath } from "@/lib/nav";
import { Landing } from "./Landing";
import { Guard } from "./Guard";
import { AdminShell, StaffShell } from "./Shells";
import { LoginForm } from "./LoginForm";
import Verify from "@/app/admin/verify/page";
import Workspace from "@/app/workspace/page";
import StaffHome from "@/app/staff/(app)/page";
import StaffTimesheets from "@/app/staff/(app)/timesheets/page";
import StaffLeave from "@/app/staff/(app)/leave/page";
import StaffProfile from "@/app/staff/(app)/profile/page";
import AdminHome from "@/app/admin/(app)/page";
import AdminStaff from "@/app/admin/(app)/staff/page";
import AdminRoster from "@/app/admin/(app)/roster/page";
import AdminStations from "@/app/admin/(app)/stations/page";
import AdminPayroll from "@/app/admin/(app)/payroll/page";
import AdminReports from "@/app/admin/(app)/reports/page";
import AdminAudit from "@/app/admin/(app)/audit/page";
import AdminSettings from "@/app/admin/(app)/settings/page";
import NotFound from "@/app/not-found";

const staff = (C: ComponentType) => () => (<Guard role="staff"><StaffShell><C /></StaffShell></Guard>);
const admin = (C: ComponentType) => () => (<Guard role="admin"><AdminShell><C /></AdminShell></Guard>);

// Mirrors the App Router folders in /app.
const ROUTES: Record<string, () => ReactNode> = {
  "/": () => <Landing />,
  "/staff/login/": () => <LoginForm portal="staff" />,
  "/admin/login/": () => <LoginForm portal="admin" />,
  "/admin/verify/": () => <Verify />,
  "/workspace/": () => <Workspace />,
  "/staff/": staff(StaffHome),
  "/staff/timesheets/": staff(StaffTimesheets),
  "/staff/leave/": staff(StaffLeave),
  "/staff/profile/": staff(StaffProfile),
  "/admin/": admin(AdminHome),
  "/admin/staff/": admin(AdminStaff),
  "/admin/roster/": admin(AdminRoster),
  "/admin/stations/": admin(AdminStations),
  "/admin/payroll/": admin(AdminPayroll),
  "/admin/reports/": admin(AdminReports),
  "/admin/audit/": admin(AdminAudit),
  "/admin/settings/": admin(AdminSettings),
};

export function HashApp() {
  const path = useHashPath();
  useEffect(() => window.scrollTo(0, 0), [path]);
  const R = ROUTES[path];
  return R ? <R key={path.split("/")[1] || "root"} /> : <NotFound />;
}
