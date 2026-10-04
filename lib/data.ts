// Shared types for the FarmTime API (DB team schema v3). All live data comes from the Express API.

// Set NEXT_PUBLIC_FARM_NAME in .env.local to show your farm name in the portals.
export const FARM_NAME = process.env.NEXT_PUBLIC_FARM_NAME || "Your farm";

/** Portal access ("which entrance"). Derived on the server from access roles. */
export type Role = "staff" | "admin";
export type Portal = "staff" | "admin";
export type AccessRole = "Office Admin" | "Roster Admin" | "Manager/Supervisor" | "Worker";
export const ACCESS_ROLES: AccessRole[] = ["Office Admin", "Roster Admin", "Manager/Supervisor", "Worker"];

export type Permission =
  | "clock.self" | "timesheets.self" | "leave.self"
  | "staff.read" | "staff.write" | "roster.write" | "stations.write"
  | "approvals.write" | "exceptions.write" | "reports.read" | "audit.read"
  | "payroll.process" | "settings.write";

export type Download = { downloadUrl: string; filename: string };

export type Station = { id: number; name: string; location?: string | null; idType?: string | null; online?: boolean; lastSeen?: string | null; eventsToday?: number; unsynced?: number; inUse?: boolean };
export type BreakReason = { id: number; label: string; paid: boolean; used?: number };
export type Rule = { rule_id: number; rule_name: string; max_hours_without_break: number; daily_overtime_threshold: number; weekly_overtime_threshold: number };

export type RosterShift = {
  id: number; staffId: number; date: string; startTime: string; endTime: string; endsNextDay: boolean;
  expectedHours: number; mealBreakMinutes: number; team: string | null; site: string | null; stationId: number | null; station: string | null;
  dateLabel?: string;
};

export type ShiftBreak = { id: number; startEventId: number; endEventId: number | null; start: string; end: string | null; reason: string; paid: boolean; minutes: number; note: string | null };

export type Shift = {
  id: number; staffId: number; staffName?: string; date: string;
  clockIn: string; clockOut: string | null; clockInEventId: number; clockOutEventId: number | null;
  stationId: number | null; station: string | null; breaks: ShiftBreak[];
  paidBreakMinutes: number; unpaidBreakMinutes: number; workedHours: number;
  status: "complete" | "open" | "missing_clock_out" | string; overridden: boolean; unrostered: boolean;
  roster: RosterShift | null;
  exceptions: { id: number; type: string; status: string }[];
  pendingAdjustments: { id: number; action: string }[];
};

export type StaffLogin = { userId?: number; email: string; disabled: boolean; mfaEnrolled: boolean; roles: AccessRole[] };
export type ContractType = "Full Time" | "Part Time" | "Casual";
export type StaffMember = {
  id: number; firstName: string; lastName: string; name: string; initials: string; jobTitle: string | null;
  contractType: ContractType; standardHours: number; standardRate: number | null; overtimeRate: number | null;
  credentialRef: string | null; hoursType: "Weekly" | "Patterned"; patternDays: string | null; patternStart: string | null; patternEnd: string | null;
  hasPin: boolean; pinExpiresAt: string | null; annualLeaveHours: number; personalLeaveHours: number;
  emergencyContactName: string | null; emergencyContactPhone: string | null; removedAt: string | null; createdAt: string;
  status?: "Active" | "On leave" | "Removed"; login?: StaffLogin | null; canHardDelete?: boolean;
};

export type Adjustment = {
  id: number; staffId: number; staffName: string; eventId: number | null; eventType: string | null;
  action: "ADD" | "EDIT" | "DELETE"; adds: "clock_out" | "break_end" | null;
  oldTimestamp: string | null; newTimestamp: string | null; reason: string; method: string;
  requestedBy: number; requestedByName: string; requestedAt: string; approver: number | null; approverName: string | null;
  status: "Pending" | "Approved" | "Rejected"; decidedAt: string | null; canDecide?: boolean;
};

export type LeaveRequest = {
  id: number; staffId: number; staffName?: string; type: "Annual" | "Personal" | "Unpaid"; startDate: string; endDate: string; days: number;
  note: string | null; status: "Pending" | "Approved" | "Rejected"; decidedBy: number | null; decidedAt: string | null; createdAt: string;
  hoursNeeded?: number; balanceHours?: number | null;
};

export type ExceptionRow = {
  id: number; staffId: number; staffName: string; type: string; date: string; status: "Open" | "Reviewed" | "Resolved";
  managerNotified: boolean; detectedAt: string; notes: string | null; eventId: number | null; eventType: string | null; eventTime: string | null; station: string | null; rule: string | null;
};

export type Period = { start: string; end: string; current?: boolean };

export const EVENT_LABEL: Record<string, string> = { clock_in: "Clock-in", clock_out: "Clock-out", break_start: "Break start", break_end: "Break end" };
