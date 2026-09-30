// Demo data for the FarmTime prototype. Replace with API calls when a backend is added.

export type Role = "staff" | "admin";
export type Portal = "staff" | "admin";

export type Account = {
  id: string;
  name: string;
  email: string;
  password: string;
  roles: Role[];
  title: string;
  station: string;
  initials: string;
};

// Demo accounts. In production, credentials are verified on the server and
// passwords are never stored or compared in the browser.
export const ACCOUNTS: Account[] = [
  {
    id: "u-mia",
    name: "Mia Chen",
    email: "mia@farmtime.au",
    password: "staff123",
    roles: ["staff"],
    title: "Orchard hand",
    station: "Orchard block B",
    initials: "MC",
  },
  {
    id: "u-sam",
    name: "Sam Patel",
    email: "sam@farmtime.au",
    password: "admin123",
    roles: ["admin"],
    title: "Operations manager",
    station: "Head office",
    initials: "SP",
  },
  {
    id: "u-jo",
    name: "Jo Walker",
    email: "jo@farmtime.au",
    password: "both123",
    roles: ["staff", "admin"],
    title: "Shift supervisor",
    station: "Packing shed",
    initials: "JW",
  },
];

export const MFA_CODE = "246810";

export const STATIONS = [
  { id: "orchard", name: "Orchard block B", method: "Staff PIN", device: "Tablet OB-2", online: true },
  { id: "packing", name: "Packing shed", method: "QR badge", device: "Kiosk PS-1", online: true },
  { id: "dairy", name: "Dairy", method: "Face check", device: "Kiosk DY-1", online: true },
  { id: "nursery", name: "Seedling nursery", method: "Staff PIN", device: "Tablet SN-1", online: false },
];

export type StaffMember = {
  id: string;
  name: string;
  initials: string;
  role: string;
  station: string;
  type: "Full-time" | "Part-time" | "Casual" | "Seasonal";
  rate: number;
  status: "Active" | "Onboarding" | "On leave";
  onSite: boolean;
  since?: string;
  hoursWeek: number;
};

export const STAFF: StaffMember[] = [
  { id: "s1", name: "Mia Chen", initials: "MC", role: "Orchard hand", station: "Orchard block B", type: "Full-time", rate: 31.4, status: "Active", onSite: false, hoursWeek: 26.5 },
  { id: "s2", name: "Jo Walker", initials: "JW", role: "Shift supervisor", station: "Packing shed", type: "Full-time", rate: 38.2, status: "Active", onSite: true, since: "6:48 am", hoursWeek: 31 },
  { id: "s3", name: "Tane Ruru", initials: "TR", role: "Tractor operator", station: "Orchard block B", type: "Full-time", rate: 34.1, status: "Active", onSite: true, since: "6:55 am", hoursWeek: 30.5 },
  { id: "s4", name: "Priya Nair", initials: "PN", role: "Packer", station: "Packing shed", type: "Casual", rate: 33.9, status: "Active", onSite: true, since: "7:02 am", hoursWeek: 22 },
  { id: "s5", name: "Liam O'Brien", initials: "LO", role: "Dairy hand", station: "Dairy", type: "Full-time", rate: 31.4, status: "Active", onSite: true, since: "4:30 am", hoursWeek: 34 },
  { id: "s6", name: "Aisha Rahman", initials: "AR", role: "Nursery assistant", station: "Seedling nursery", type: "Part-time", rate: 30.2, status: "On leave", onSite: false, hoursWeek: 0 },
  { id: "s7", name: "Tom Nguyen", initials: "TN", role: "Picker", station: "Orchard block B", type: "Seasonal", rate: 29.8, status: "Onboarding", onSite: false, hoursWeek: 0 },
  { id: "s8", name: "Grace Kelly", initials: "GK", role: "Packer", station: "Packing shed", type: "Casual", rate: 33.9, status: "Active", onSite: true, since: "7:10 am", hoursWeek: 18.5 },
  { id: "s9", name: "Ben Harris", initials: "BH", role: "Dairy hand", station: "Dairy", type: "Part-time", rate: 31.4, status: "Active", onSite: false, hoursWeek: 20 },
];

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Roster: staff id -> shift per day ("" = off)
export const ROSTER: Record<string, string[]> = {
  s1: ["7–15:30", "7–15:30", "7–15:30", "7–15:30", "7–13", "", ""],
  s2: ["6:30–15", "6:30–15", "6:30–15", "6:30–15", "6:30–15", "", ""],
  s3: ["7–15:30", "7–15:30", "", "7–15:30", "7–15:30", "7–12", ""],
  s4: ["", "8–16", "8–16", "", "8–16", "8–13", ""],
  s5: ["4:30–13", "4:30–13", "4:30–13", "", "4:30–13", "4:30–10", "4:30–10"],
  s6: ["", "", "", "", "", "", ""],
  s7: ["", "", "", "7–15:30", "7–15:30", "7–12", ""],
  s8: ["8–16", "", "8–16", "8–16", "", "8–13", ""],
  s9: ["", "13–19", "", "13–19", "", "", "4:30–10"],
};

export const WEATHER = [
  { day: "Mon", temp: 24, flag: "" },
  { day: "Tue", temp: 27, flag: "" },
  { day: "Wed", temp: 34, flag: "Heat" },
  { day: "Thu", temp: 36, flag: "Heat" },
  { day: "Fri", temp: 22, flag: "Wind" },
  { day: "Sat", temp: 19, flag: "Rain" },
  { day: "Sun", temp: 21, flag: "" },
];

export type Timesheet = {
  date: string;
  station: string;
  start: string;
  end: string;
  breakMin: number;
  hours: number;
  status: "Approved" | "Pending" | "Queried";
};

export const MY_TIMESHEETS: Timesheet[] = [
  { date: "Tue 29 Sep", station: "Orchard block B", start: "07:01", end: "15:34", breakMin: 30, hours: 8.0, status: "Pending" },
  { date: "Mon 28 Sep", station: "Orchard block B", start: "06:58", end: "15:30", breakMin: 30, hours: 8.0, status: "Approved" },
  { date: "Fri 25 Sep", station: "Packing shed", start: "07:04", end: "13:02", breakMin: 0, hours: 6.0, status: "Approved" },
  { date: "Thu 24 Sep", station: "Orchard block B", start: "07:00", end: "15:41", breakMin: 30, hours: 8.2, status: "Queried" },
  { date: "Wed 23 Sep", station: "Orchard block B", start: "06:55", end: "15:30", breakMin: 30, hours: 8.1, status: "Approved" },
  { date: "Tue 22 Sep", station: "Orchard block B", start: "07:02", end: "15:28", breakMin: 30, hours: 7.9, status: "Approved" },
];

export type LeaveRequest = {
  id: string;
  staffName: string;
  type: string;
  from: string;
  to: string;
  days: number;
  note: string;
  status: "Pending" | "Approved" | "Declined";
};

export const LEAVE: LeaveRequest[] = [
  { id: "l1", staffName: "Priya Nair", type: "Annual leave", from: "12 Oct", to: "16 Oct", days: 5, note: "Family trip", status: "Pending" },
  { id: "l2", staffName: "Mia Chen", type: "Personal leave", from: "2 Sep", to: "2 Sep", days: 1, note: "", status: "Approved" },
  { id: "l3", staffName: "Ben Harris", type: "Annual leave", from: "19 Oct", to: "20 Oct", days: 2, note: "", status: "Pending" },
];

export type AuditEvent = {
  id: string;
  time: string;
  actor: string;
  action: string;
  target: string;
  source: string;
  level: "info" | "warn" | "security";
};

export const AUDIT: AuditEvent[] = [
  { id: "a1", time: "Today 07:12", actor: "Jo Walker", action: "Approved timesheet", target: "Tane Ruru · 29 Sep", source: "Admin portal", level: "info" },
  { id: "a2", time: "Today 07:02", actor: "Priya Nair", action: "Clocked in", target: "Packing shed", source: "Kiosk PS-1 · QR badge", level: "info" },
  { id: "a3", time: "Today 06:41", actor: "System", action: "Device offline", target: "Tablet SN-1", source: "Station monitor", level: "warn" },
  { id: "a4", time: "Yesterday 18:20", actor: "Sam Patel", action: "Updated pay rate", target: "Grace Kelly · $33.90/h", source: "Admin portal", level: "security" },
  { id: "a5", time: "Yesterday 16:05", actor: "Unknown", action: "Failed admin sign-in (3 attempts)", target: "sam@farmtime.au", source: "Admin portal · 203.0.113.24", level: "security" },
  { id: "a6", time: "Yesterday 15:31", actor: "Mia Chen", action: "Clocked out", target: "Orchard block B", source: "Tablet OB-2 · Staff PIN", level: "info" },
  { id: "a7", time: "28 Sep 09:15", actor: "Sam Patel", action: "Published roster", target: "Week of 28 Sep", source: "Admin portal", level: "info" },
];

export const PAY_PERIOD = { label: "14 – 27 Sep 2026", payDate: "Thu 1 Oct" };

export const HOURS_BY_STATION = [
  { name: "Orchard block B", hours: 412 },
  { name: "Packing shed", hours: 356 },
  { name: "Dairy", hours: 298 },
  { name: "Seedling nursery", hours: 104 },
];

export const OVERTIME_TREND = [
  { week: "31 Aug", hours: 18 },
  { week: "7 Sep", hours: 22 },
  { week: "14 Sep", hours: 31 },
  { week: "21 Sep", hours: 27 },
  { week: "28 Sep", hours: 14 },
];
