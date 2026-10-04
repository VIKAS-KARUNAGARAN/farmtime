DROP VIEW IF EXISTS v_daily_exceptions;
DROP VIEW IF EXISTS v_attendance;
DROP VIEW IF EXISTS v_cost_analysis;


-- Today's exceptions per staff member (end-of-day style report).
-- Lists every staff member; filter exception_type <> 'OK' for problems only.
CREATE VIEW v_daily_exceptions AS
WITH today AS (
    SELECT (now() AT TIME ZONE 'Australia/Adelaide')::date AS d
),
base AS (
    SELECT
        s.staff_id,
        s.first_name,
        s.last_name,
        r.roster_id,
        r.shift_date,
        r.station_id AS rostered_station_id,
        MAX(CASE WHEN te.event_type = 'clock_in'  THEN te.event_timestamp END) AS clock_in_time,
        MAX(CASE WHEN te.event_type = 'clock_out' THEN te.event_timestamp END) AS clock_out_time,
        MAX(CASE WHEN te.event_type = 'clock_in'  THEN te.station_id END)      AS actual_clock_in_station,
        MIN(CASE WHEN te.event_type = 'break_start' THEN te.event_timestamp END) AS first_break_start
    FROM staff s
    CROSS JOIN today t
    LEFT JOIN roster r
           ON r.staff_id = s.staff_id
          AND r.shift_date = t.d
    LEFT JOIN time_events te
           ON te.staff_id = s.staff_id
          AND (te.event_timestamp AT TIME ZONE 'Australia/Adelaide')::date = t.d
    GROUP BY s.staff_id, s.first_name, s.last_name,
             r.roster_id, r.shift_date, r.station_id
)
SELECT
    staff_id,
    first_name,
    last_name,
    shift_date,
    rostered_station_id,
    clock_in_time,
    clock_out_time,
    actual_clock_in_station,
    CASE
        WHEN roster_id IS NULL AND clock_in_time IS NOT NULL
            THEN 'Unrostered attempt'
        WHEN rostered_station_id IS NOT NULL
             AND actual_clock_in_station IS NOT NULL
             AND actual_clock_in_station <> rostered_station_id
            THEN 'Clocked in at wrong station'
        WHEN clock_in_time IS NOT NULL AND clock_out_time IS NULL
            THEN 'Missing clock-out'
        WHEN clock_in_time IS NOT NULL
             AND first_break_start IS NOT NULL
             AND first_break_start - clock_in_time > INTERVAL '4 hours'
            THEN 'Break overdue'
        WHEN clock_in_time IS NOT NULL
             AND first_break_start IS NULL
             AND clock_out_time IS NOT NULL
             AND clock_out_time - clock_in_time > INTERVAL '4 hours'
            THEN 'Break overdue'
        ELSE 'OK'
    END AS exception_type
FROM base;


-- Daily attendance: rostered vs actual hours. Future shifts are excluded.
CREATE VIEW v_attendance AS
WITH ev AS (
    SELECT staff_id,
           (event_timestamp AT TIME ZONE 'Australia/Adelaide')::date AS work_date,
           event_type,
           event_timestamp,
           LEAD(event_type) OVER w AS next_type,
           LEAD(event_timestamp) OVER w AS next_ts
    FROM time_events
    WINDOW w AS (
        PARTITION BY staff_id, (event_timestamp AT TIME ZONE 'Australia/Adelaide')::date
        ORDER BY event_timestamp
    )
),
daily AS (
    SELECT staff_id,
           work_date,
           MIN(event_timestamp) FILTER (WHERE event_type = 'clock_in')  AS clock_in,
           MAX(event_timestamp) FILTER (WHERE event_type = 'clock_out') AS clock_out,
           COALESCE(SUM(EXTRACT(EPOCH FROM (next_ts - event_timestamp)) / 3600)
                    FILTER (WHERE event_type = 'break_start' AND next_type = 'break_end'), 0) AS break_hours
    FROM ev
    GROUP BY staff_id, work_date
)
SELECT COALESCE(d.staff_id, r.staff_id) AS staff_id,
       s.first_name || ' ' || s.last_name AS staff_name,
       COALESCE(d.work_date, r.shift_date) AS work_date,
       r.expected_hours AS rostered_hours,
       d.clock_in,
       d.clock_out,
       ROUND(d.break_hours::numeric, 2) AS break_hours,
       CASE WHEN d.clock_in IS NOT NULL AND d.clock_out IS NOT NULL
            THEN ROUND((EXTRACT(EPOCH FROM (d.clock_out - d.clock_in)) / 3600 - d.break_hours)::numeric, 2)
       END AS worked_hours,
       CASE WHEN d.clock_in IS NULL  THEN 'Absent'
            WHEN d.clock_out IS NULL THEN 'Incomplete'
            ELSE 'Complete'
       END AS attendance_status
FROM daily d
FULL OUTER JOIN roster r
       ON r.staff_id = d.staff_id AND r.shift_date = d.work_date
JOIN staff s
       ON s.staff_id = COALESCE(d.staff_id, r.staff_id)
WHERE COALESCE(d.work_date, r.shift_date)
      <= (now() AT TIME ZONE 'Australia/Adelaide')::date;


-- Cost per staff member per pay period.
-- PoC pay rule: weekend and public holiday hours are paid at the overtime rate.
CREATE VIEW v_cost_analysis AS
SELECT p.payroll_id,
       p.period_start,
       p.period_end,
       s.staff_id,
       s.first_name || ' ' || s.last_name AS staff_name,
       s.role,
       s.contract_type,
       p.ordinary_hours,
       p.overtime_hours,
       p.weekend_hours,
       p.public_holiday_hours,
       ROUND(p.ordinary_hours * s.standard_rate, 2) AS ordinary_cost,
       ROUND(p.overtime_hours * s.overtime_rate, 2) AS overtime_cost,
       ROUND((p.weekend_hours + p.public_holiday_hours) * s.overtime_rate, 2) AS penalty_cost,
       p.total_pay,
       p.penalty_flag
FROM payroll_summary p
JOIN staff s ON s.staff_id = p.staff_id;


-- Quick checks (uncomment to run):
-- SELECT * FROM v_daily_exceptions WHERE exception_type <> 'OK' ORDER BY staff_id;
-- SELECT * FROM v_attendance ORDER BY work_date DESC, staff_id LIMIT 10;
-- SELECT * FROM v_cost_analysis ORDER BY period_start, staff_id;