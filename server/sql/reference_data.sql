-- Reference data the app needs on every database, including live.
-- Safe to run repeatedly: nothing is inserted twice and nothing is overwritten.
-- (The dev seed in seed/dev_seed.sql is separate and must never run on live.)

-- Compliance rules (team decision; 8 h/day is a PoC assumption, not an award rule)
INSERT INTO compliance_rules (rule_name, max_hours_without_break, daily_overtime_threshold, weekly_overtime_threshold)
SELECT v.* FROM (VALUES
  ('Standard AU Rule', 5.00, 8.00, 38.00),   -- 5 h without a meal break: Horticulture Award MA000028
  ('PID Break Rule',   4.00, 8.00, 38.00)    -- 4 h without a break: Project Initiation Document
) AS v(rule_name, a, b, c)
WHERE NOT EXISTS (SELECT 1 FROM compliance_rules r WHERE r.rule_name = v.rule_name);

-- Break reasons (team decision from the FAQ list)
INSERT INTO break_reasons (label, is_paid)
SELECT v.* FROM (VALUES ('Meal', FALSE), ('Rest', TRUE), ('Personal', FALSE), ('Emergency', TRUE), ('Other', FALSE)) AS v(label, is_paid)
WHERE NOT EXISTS (SELECT 1 FROM break_reasons b WHERE b.label = v.label);

-- SA public holidays. "(from 7pm)" means only hours from 19:00 count as public holiday time.
-- Anzac Day 2027 is pending a check on SafeWork SA.
INSERT INTO public_holidays (holiday_date, name, state) VALUES
('2026-10-05','Labour Day','SA'),
('2026-12-24','Christmas Eve (from 7pm)','SA'),
('2026-12-25','Christmas Day','SA'),
('2026-12-26','Proclamation Day','SA'),
('2026-12-28','Proclamation Day (additional)','SA'),
('2026-12-31','New Year''s Eve (from 7pm)','SA'),
('2027-01-01','New Year''s Day','SA'),
('2027-01-26','Australia Day','SA'),
('2027-03-08','Adelaide Cup Day','SA'),
('2027-03-26','Good Friday','SA'),
('2027-03-27','Easter Saturday','SA'),
('2027-03-28','Easter Sunday','SA'),
('2027-03-29','Easter Monday','SA'),
('2027-06-14','King''s Birthday','SA'),
('2027-10-04','Labour Day','SA'),
('2027-12-24','Christmas Eve (from 7pm)','SA'),
('2027-12-25','Christmas Day','SA'),
('2027-12-26','Proclamation Day','SA'),
('2027-12-27','Christmas Day (additional)','SA'),
('2027-12-28','Proclamation Day (additional)','SA'),
('2027-12-31','New Year''s Eve (from 7pm)','SA')
ON CONFLICT (holiday_date, state) DO NOTHING;
