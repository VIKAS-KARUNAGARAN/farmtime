export type Staff = {
  id: string;
  name: string;
  role: string;
  contract: string;
  rate: number;
  identity: "Registered" | "Pending";
};

export const staffList: Staff[] = [
  { id: "admin01", name: "Baozhi Li", role: "Admin", contract: "Full time", rate: 52.0, identity: "Registered" },
  { id: "staff01", name: "Vikas Karunagaran", role: "Field lead", contract: "Full time", rate: 34.0, identity: "Registered" },
  { id: "staff02", name: "Ruining Li", role: "Harvester", contract: "Part time", rate: 30.0, identity: "Registered" },
  { id: "staff03", name: "Wanwan Wang", role: "Packhouse", contract: "Casual", rate: 31.5, identity: "Pending" },
  { id: "staff04", name: "Yi Deng", role: "Irrigation", contract: "Full time", rate: 34.0, identity: "Registered" },
];

export type Shift = {
  date: string;
  staff: string;
  station: string;
  start: string;
  hours: number;
  status: "Good" | "Check";
};

export const shifts: Shift[] = [
  { date: "02 May", staff: "Vikas Karunagaran", station: "North Orchard Gate", start: "07:30 AM", hours: 8.0, status: "Good" },
  { date: "02 May", staff: "Ruining Li", station: "Packhouse Entry", start: "09:00 AM", hours: 6.0, status: "Check" },
  { date: "03 May", staff: "Wanwan Wang", station: "Dispatch Ramp", start: "12:00 AM", hours: 4.0, status: "Good" },
  { date: "04 May", staff: "Yi Deng", station: "North Orchard Gate", start: "07:00 AM", hours: 8.0, status: "Good" },
  { date: "05 May", staff: "Vikas Karunagaran", station: "Packhouse Entry", start: "07:30 AM", hours: 8.0, status: "Good" },
];

export type ExceptionItem = {
  id: number;
  type: string;
  person: string;
  date: string;
  severity: "High" | "Review";
};

export const exceptions: ExceptionItem[] = [
  { id: 7, type: "Missing clock-out", person: "Vikas Karunagaran", date: "01 May", severity: "High" },
  { id: 4, type: "Roster conflict", person: "Ruining Li", date: "01 May", severity: "Review" },
  { id: 9, type: "Leave request", person: "Wanwan Wang", date: "03 May", severity: "Review" },
];

export type AuditEntry = {
  activity: string;
  detail: string;
  operator: string;
  timestamp: string;
  type: "pay" | "shift" | "correction" | "profile" | "optimisation";
};

export const auditLog: AuditEntry[] = [
  { activity: "Pay rate updated", detail: "Vikas Karunagaran · $32 → $34/hr", operator: "Baozhi Li", timestamp: "Today, 07:36", type: "pay" },
  { activity: "Shift added", detail: "Yi Deng · North Orchard Gate", operator: "Baozhi Li", timestamp: "Today, 07:12", type: "shift" },
  { activity: "Clock-out corrected", detail: "Ruining Li · 16:04", operator: "Baozhi Li", timestamp: "Yesterday, 17:42", type: "correction" },
  { activity: "New staff profile created", detail: "Wanwan Wang · staff03", operator: "Baozhi Li", timestamp: "Yesterday, 10:21", type: "profile" },
  { activity: "Roster optimisation applied", detail: "Week of 02 May 2026", operator: "Baozhi Li", timestamp: "29 Apr, 14:06", type: "optimisation" },
];

export const currentUser = { name: "Vikas Karunagaran", role: "Admin operator", id: "admin01" };
