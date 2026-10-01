// Shared types and the demo sign-in shortcuts. All live data comes from the Express API (see lib/api.ts).

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

// Demo accounts, shown as shortcuts on the sign-in pages. Credentials are only
// ever checked by the API server (bcrypt hashes in SQLite).
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

export type StaffMember = {
  id: string;
  name: string;
  initials: string;
  position: string;
  stationId: string;
  station: string;
  type: "Full-time" | "Part-time" | "Casual" | "Seasonal";
  rate: number;
  status: "Active" | "Onboarding" | "On leave" | "Inactive";
  hoursWeek: number;
  onSite: boolean;
  hasLogin: boolean;
};

export type Timesheet = {
  id: string;
  date: string;
  dateLabel: string;
  station: string;
  start: string;
  end: string | null;
  breakMin: number;
  hours: number;
  status: "Approved" | "Pending" | "Queried" | "Open";
  queryNote: string | null;
  staffNote: string | null;
};

export type AuditEvent = {
  id: number;
  at: string;
  actor: string;
  action: string;
  target: string;
  source: string;
  level: "info" | "warn" | "security";
};

export type Station = { id: string; name: string };
export type Download = { downloadUrl: string; filename: string };
