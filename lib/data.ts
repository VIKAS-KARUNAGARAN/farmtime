// Shared types. All live data comes from the Express API (see lib/api.ts).

// Set NEXT_PUBLIC_FARM_NAME in .env.local to show your farm name in the portals.
export const FARM_NAME = process.env.NEXT_PUBLIC_FARM_NAME || "Your farm";

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
  email: string | null;
  roles: Role[];
  removed: boolean;
  removedAt: string | null;
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
