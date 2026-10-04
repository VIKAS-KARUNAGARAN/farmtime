// Business logic shared by the staff and admin routes, built on the DB team's
// v3 tables: shifts are derived from time_events (+ breaks), exceptions are
// detected into the exceptions table, and pay is calculated into payroll_summary.
import { config } from "./config.js";
import { addDays, at, daysBetween, isWeekend, minutesBetween, parseYmd, round2, ymd } from "./util.js";

// ---------- reference data ----------
export async function activeRule(db) {
  return (
    (await db.prepare("SELECT * FROM compliance_rules WHERE rule_id = ?").get(config.activeRuleId)) ??
    (await db.prepare("SELECT * FROM compliance_rules ORDER BY rule_id LIMIT 1").get())
  );
}

export async function holidayMap(db, from, to) {
  const rows = await db.prepare("SELECT holiday_date, name FROM public_holidays WHERE state IN (?, 'NAT') AND holiday_date BETWEEN ? AND ?").all(config.holidayState, from, to);
  return new Map(rows.map((h) => [h.holiday_date, { name: h.name, from7pm: /from 7\s*pm/i.test(h.name) }]));
}

// ---------- roster ----------
/** Roster end = start + expected hours + 30 min unpaid meal for shifts over 5 h (team decision). */
export function rosterTimes(r) {
  const start = at(r.shift_date, r.start_time);
  const meal = r.expected_hours > config.mealBreakAfterHours ? config.mealBreakMinutes : 0;
  const end = new Date(start.getTime() + (r.expected_hours * 60 + meal) * 60000);
  return { start, end, mealMinutes: meal };
}

export function rosterDto(r) {
  if (!r) return null;
  const t = rosterTimes(r);
  return {
    id: r.roster_id,
    staffId: r.staff_id,
    date: r.shift_date,
    startTime: r.start_time.slice(0, 5),
    endTime: `${String(t.end.getHours()).padStart(2, "0")}:${String(t.end.getMinutes()).padStart(2, "0")}`,
    endsNextDay: ymd(t.end) !== r.shift_date,
    expectedHours: r.expected_hours,
    mealBreakMinutes: t.mealMinutes,
    team: r.team,
    site: r.site,
    stationId: r.station_id,
    station: r.station_name ?? null,
  };
}

// ---------- shifts ----------
/**
 * Builds shifts from time_events for clock-in dates from..to (inclusive, Adelaide days).
 * A shift is a clock_in followed by breaks and a clock_out. A clock_in that is
 * followed by another clock_in has a missing clock-out.
 */
export async function loadShifts(db, { from, to, staffId = null, now = new Date() }) {
  const events = await db
    .prepare(
      `SELECT e.event_id, e.staff_id, e.station_id, e.event_type, e.event_timestamp AS ts, e.is_override,
              e.override_reason, e.is_unrostered, st.name AS station_name,
              b.break_id, b.note AS break_note, br.label AS reason, br.is_paid
         FROM time_events e
    LEFT JOIN stations st ON st.station_id = e.station_id
    LEFT JOIN breaks b ON b.start_event_id = e.event_id
    LEFT JOIN break_reasons br ON br.reason_id = b.reason_id
        WHERE e.event_timestamp >= ?::date AND e.event_timestamp < (?::date + 2)
          AND (?::int IS NULL OR e.staff_id = ?::int)
        ORDER BY e.staff_id, e.event_timestamp, e.event_id`
    )
    .all(from, to, staffId, staffId);

  const shifts = [];
  let cur = null;
  const close = () => {
    if (cur) shifts.push(cur);
    cur = null;
  };
  for (const e of events) {
    if (cur && cur.staffId !== e.staff_id) close();
    if (e.event_type === "clock_in") {
      close();
      cur = { staffId: e.staff_id, date: ymd(e.ts), inEvent: e, outEvent: null, breaks: [], openBreak: null, overridden: e.is_override };
      continue;
    }
    if (!cur) continue; // event without a clock-in in range
    if (e.is_override) cur.overridden = true;
    if (e.event_type === "break_start") {
      const b = { id: e.break_id, startEventId: e.event_id, start: e.ts, end: null, endEventId: null, reason: e.reason ?? "Unspecified", paid: !!e.is_paid, note: e.break_note };
      cur.breaks.push(b);
      cur.openBreak = b;
    } else if (e.event_type === "break_end") {
      if (cur.openBreak) Object.assign(cur.openBreak, { end: e.ts, endEventId: e.event_id });
      cur.openBreak = null;
    } else if (e.event_type === "clock_out") {
      cur.outEvent = e;
      close();
    }
  }
  close();

  const inRange = shifts.filter((s) => s.date >= from && s.date <= to);
  if (!inRange.length) return [];

  const ids = [...new Set(inRange.map((s) => s.staffId))];
  const roster = await db
    .prepare("SELECT r.*, st.name AS station_name FROM roster r LEFT JOIN stations st ON st.station_id = r.station_id WHERE r.shift_date BETWEEN ? AND ? AND r.staff_id = ANY(?::int[])")
    .all(from, to, ids);
  const rosterBy = new Map(roster.map((r) => [`${r.staff_id}|${r.shift_date}`, r]));
  const exc = await db
    .prepare("SELECT exception_id, staff_id, event_id, exception_type, exception_date, status FROM exceptions WHERE exception_date BETWEEN ? AND ? AND staff_id = ANY(?::int[])")
    .all(from, to, ids);
  const pending = await db
    .prepare(
      `SELECT a.adjustment_id, a.event_id, a.action, a.status, a.staff_id FROM time_adjustments a
        WHERE a.status = 'Pending' AND a.staff_id = ANY(?::int[])`
    )
    .all(ids);

  const today = ymd(now);
  return inRange.map((s) => shiftDto(s, { roster: rosterBy.get(`${s.staffId}|${s.date}`), exceptions: exc, pending, now, today }));
}

function shiftDto(s, { roster, exceptions, pending, now, today }) {
  const open = !s.outEvent;
  const end = open ? now : s.outEvent.ts;
  let paidBreak = 0, unpaidBreak = 0;
  const breaks = s.breaks.map((b) => {
    const bEnd = b.end ?? (open ? now : end);
    const m = Math.max(0, minutesBetween(b.start, bEnd));
    if (b.paid) paidBreak += m;
    else unpaidBreak += m;
    return { id: b.id, startEventId: b.startEventId, endEventId: b.endEventId, start: b.start, end: b.end, reason: b.reason, paid: b.paid, minutes: Math.round(m), note: b.note };
  });
  const eventIds = [s.inEvent.event_id, s.outEvent?.event_id, ...s.breaks.flatMap((b) => [b.startEventId, b.endEventId])].filter(Boolean);
  const running = open && now - new Date(s.inEvent.ts) <= config.maxOpenShiftHours * 3600_000;
  const status = !open ? "complete" : running ? (s.openBreak ? "on_break" : "working") : "missing_clock_out";
  // Hours are unknown until a missing clock-out is corrected.
  const worked = status === "missing_clock_out" ? 0 : Math.max(0, minutesBetween(s.inEvent.ts, end) - unpaidBreak);
  return {
    id: s.inEvent.event_id,
    staffId: s.staffId,
    date: s.date,
    clockIn: s.inEvent.ts,
    clockOut: s.outEvent?.ts ?? null,
    clockInEventId: s.inEvent.event_id,
    clockOutEventId: s.outEvent?.event_id ?? null,
    stationId: s.inEvent.station_id,
    station: s.inEvent.station_name,
    breaks,
    paidBreakMinutes: Math.round(paidBreak),
    unpaidBreakMinutes: Math.round(unpaidBreak),
    workedHours: round2(worked / 60),
    status,
    overridden: !!s.overridden,
    unrostered: !!s.inEvent.is_unrostered,
    roster: rosterDto(roster),
    exceptions: exceptions.filter((x) => x.staff_id === s.staffId && (eventIds.includes(x.event_id) || (x.event_id == null && x.exception_date === s.date))).map((x) => ({ id: x.exception_id, type: x.exception_type, status: x.status })),
    pendingAdjustments: pending.filter((p) => eventIds.includes(p.event_id)).map((p) => ({ id: p.adjustment_id, action: p.action })),
    _raw: s,
  };
}

/** True when a shift has no clock-out and started too long ago to still be running. */
export const isStale = (shift, now = new Date()) => !shift.clockOut && now - new Date(shift.clockIn) > config.maxOpenShiftHours * 3600_000;

export const publicShift = ({ _raw, ...rest }) => rest;

/** Longest stretch of work (minutes) without any break, up to `until`. */
export function longestStretch(shift, until = new Date()) {
  const end = shift.clockOut ? new Date(shift.clockOut) : until;
  let last = new Date(shift.clockIn), longest = 0;
  for (const b of shift.breaks) {
    longest = Math.max(longest, minutesBetween(last, b.start));
    if (!b.end) return { longest, current: 0, onBreak: true };
    last = new Date(b.end);
  }
  const current = minutesBetween(last, end);
  return { longest: Math.max(longest, current), current, onBreak: false };
}

// ---------- exceptions ----------
async function addException(db, { staffId, eventId, type, date, ruleId = null, notes = null }) {
  const exists = await db
    .prepare("SELECT 1 FROM exceptions WHERE staff_id = ? AND exception_type = ? AND (event_id = ? OR (event_id IS NULL AND exception_date = ?))")
    .get(staffId, type, eventId, date);
  if (exists) return false;
  await db
    .prepare("INSERT INTO exceptions (staff_id, event_id, rule_id, exception_type, exception_date, status, detected_at, notes) VALUES (?, ?, ?, ?, ?, 'Open', now(), ?)")
    .run(staffId, eventId, ruleId, type, date, notes?.slice(0, 200) ?? null);
  return true;
}
export { addException };

/** Checks shifts from the last 2 days for missing clock-outs and overdue breaks. */
export async function detectExceptions(db, now = new Date()) {
  const rule = await activeRule(db);
  const today = ymd(now);
  const shifts = await loadShifts(db, { from: addDays(today, -2), to: today, now });
  let added = 0;
  for (const s of shifts) {
    if (!s.clockOut) {
      const limit = s.roster ? rosterTimes({ shift_date: s.roster.date, start_time: s.roster.startTime, expected_hours: s.roster.expectedHours }).end : new Date(new Date(s.clockIn).getTime() + 12 * 3600_000);
      const overdue = now > new Date(limit.getTime() + config.missingClockOutGraceHours * 3600_000);
      if (overdue && (await addException(db, { staffId: s.staffId, eventId: s.clockInEventId, type: "Missing clock-out", date: s.date, notes: "No clock-out recorded" }))) added++;
      // A shift with no clock-out is a missing clock-out, not a break problem.
      if (overdue) continue;
    }
    if (rule?.max_hours_without_break) {
      const { longest } = longestStretch(s, now);
      if (longest > rule.max_hours_without_break * 60) {
        if (await addException(db, { staffId: s.staffId, eventId: s.clockInEventId, type: "Break overdue", date: s.date, ruleId: rule.rule_id, notes: `Worked ${round2(longest / 60)} h without a break (${rule.rule_name}: ${rule.max_hours_without_break} h)` })) added++;
      }
    }
  }
  return added;
}

// ---------- pay periods ----------
export function periodFor(date = ymd()) {
  const n = Math.floor(daysBetween(config.payPeriodAnchor, date) / 14);
  const start = addDays(config.payPeriodAnchor, n * 14);
  return { start, end: addDays(start, 13) };
}
export function recentPeriods(count = 6, today = ymd()) {
  const cur = periodFor(today);
  return Array.from({ length: count }, (_, i) => {
    const start = addDays(cur.start, -14 * i);
    return { start, end: addDays(start, 13), current: i === 0 };
  });
}

/** Splits worked time into ordinary / weekend / public holiday minutes. */
function classify(shift, holidays) {
  const out = { ordinary: 0, weekend: 0, holiday: 0 };
  if (!shift.clockOut) return out;
  // Work intervals: shift minus unpaid breaks.
  const cuts = shift.breaks.filter((b) => !b.paid && b.end).map((b) => [new Date(b.start), new Date(b.end)]);
  let pieces = [[new Date(shift.clockIn), new Date(shift.clockOut)]];
  for (const [cs, ce] of cuts) {
    pieces = pieces.flatMap(([s, e]) => (ce <= s || cs >= e ? [[s, e]] : [cs > s ? [s, cs] : null, ce < e ? [ce, e] : null].filter(Boolean)));
  }
  for (let [s, e] of pieces) {
    while (s < e) {
      const day = ymd(s);
      const seven = at(day, "19:00");
      const midnight = at(addDays(day, 1), "00:00");
      const next = new Date(Math.min(e, s < seven ? seven : midnight, midnight));
      const mins = minutesBetween(s, next);
      const h = holidays.get(day);
      if (h && (!h.from7pm || s >= seven)) out.holiday += mins;
      else if (isWeekend(day)) out.weekend += mins;
      else out.ordinary += mins;
      s = next;
    }
  }
  return out;
}

/** PoC pay calculation for one fortnight (rules in config.js). */
export async function calculatePay(db, period) {
  const shifts = await loadShifts(db, { from: period.start, to: period.end });
  const holidays = await holidayMap(db, period.start, addDays(period.end, 1));
  const staff = await db.prepare("SELECT staff_id, first_name, last_name, role, contract_type, standard_rate, overtime_rate FROM staff").all();
  const byId = new Map(staff.map((s) => [s.staff_id, s]));
  const totals = new Map();
  const incomplete = [];
  for (const sh of shifts) {
    if (!sh.clockOut) {
      incomplete.push({ staffId: sh.staffId, date: sh.date, shiftId: sh.id });
      continue;
    }
    const t = totals.get(sh.staffId) ?? { ordinary: 0, weekend: 0, holiday: 0, shifts: 0 };
    const c = classify(sh, holidays);
    t.ordinary += c.ordinary;
    t.weekend += c.weekend;
    t.holiday += c.holiday;
    t.shifts++;
    totals.set(sh.staffId, t);
  }
  const rows = [...totals.entries()].map(([staffId, t]) => {
    const s = byId.get(staffId);
    let ordinary = round2(t.ordinary / 60);
    let overtime = 0;
    if (ordinary > config.ordinaryHoursPerFortnight) {
      overtime = round2(ordinary - config.ordinaryHoursPerFortnight);
      ordinary = config.ordinaryHoursPerFortnight;
    }
    const weekend = round2(t.weekend / 60);
    const holiday = round2(t.holiday / 60);
    const totalPay = round2(ordinary * s.standard_rate + (overtime + weekend + holiday) * s.overtime_rate);
    return {
      staffId,
      name: `${s.first_name} ${s.last_name}`,
      role: s.role,
      contractType: s.contract_type,
      standardRate: s.standard_rate,
      overtimeRate: s.overtime_rate,
      shifts: t.shifts,
      ordinaryHours: ordinary,
      overtimeHours: overtime,
      weekendHours: weekend,
      publicHolidayHours: holiday,
      penalty: weekend > 0 || holiday > 0,
      totalPay,
    };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { rows, incomplete };
}

// ---------- staff ----------
export function staffDto(s, extra = {}) {
  return {
    id: s.staff_id,
    firstName: s.first_name,
    lastName: s.last_name,
    name: `${s.first_name} ${s.last_name}`,
    initials: `${s.first_name[0]}${s.last_name[0] || ""}`.toUpperCase(),
    jobTitle: s.role,
    contractType: s.contract_type,
    standardHours: s.standard_hours,
    standardRate: s.standard_rate,
    overtimeRate: s.overtime_rate,
    credentialRef: s.credential_ref,
    hoursType: s.hours_type,
    patternDays: s.pattern_days,
    patternStart: s.pattern_start?.slice(0, 5) ?? null,
    patternEnd: s.pattern_end?.slice(0, 5) ?? null,
    hasPin: !!s.pin_hash,
    pinExpiresAt: s.pin_expires_at,
    annualLeaveHours: s.annual_leave_hours,
    personalLeaveHours: s.personal_leave_hours,
    emergencyContactName: s.emergency_contact_name,
    emergencyContactPhone: s.emergency_contact_phone,
    removedAt: s.removed_at,
    createdAt: s.created_at,
    ...extra,
  };
}

export const hoursPerDay = (s) => (s.standard_hours || 38) / 5;
export { parseYmd };
