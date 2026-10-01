import type { StaffMember } from "./data";
import { fmtTime } from "./useNow";

// Links demo login accounts to their staff records so clock actions show up for admins.
const LINK: Record<string, string> = { s1: "u-mia", s2: "u-jo" };

export function liveStaff(staff: StaffMember[], clock: Record<string, { since: number | null }>): StaffMember[] {
  return staff.map((s) => {
    const uid = LINK[s.id];
    if (!uid || !clock[uid]) return s;
    const since = clock[uid].since;
    return { ...s, onSite: since !== null, since: since ? fmtTime(since) : undefined };
  });
}
