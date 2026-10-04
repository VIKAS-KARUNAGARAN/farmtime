-- DEV / TEST ONLY. Never run on the live database.
-- Run after seed/dev_seed.sql (which wipes users, user_roles and sessions).
-- Every seeded staff member gets a login: firstname.lastname@farmtime.test
-- Password for all: FarmTime-Dev-2026   (admins set up an authenticator at first admin sign-in)
INSERT INTO users (staff_id, email, password_hash, name, password_changed_at)
SELECT staff_id,
       lower(first_name || '.' || last_name) || '@farmtime.test',
       '$2b$10$uAbPgc2pmlARHlgYAc6hlOcmcvgW5ReqnPS9beV1YxQ7x9/PCGXhO',
       first_name || ' ' || last_name,
       now()
FROM staff
ON CONFLICT (email) DO NOTHING;

-- Access roles. Alex = Office Admin, Taylor = Roster Admin, Marcus and Jess = Manager/Supervisor.
-- Everyone who clocks in also has Worker (Alex and Taylor have no pay rows, so admin only).
INSERT INTO user_roles (user_id, role)
SELECT u.user_id, r.role
FROM users u
JOIN staff s ON s.staff_id = u.staff_id
CROSS JOIN LATERAL (
  SELECT unnest(CASE
    WHEN s.role = 'Office Admin' THEN ARRAY['Office Admin']
    WHEN s.role = 'Roster Admin' THEN ARRAY['Roster Admin']
    WHEN s.role IN ('Farm Manager','Supervisor') THEN ARRAY['Manager/Supervisor','Worker']
    ELSE ARRAY['Worker'] END) AS role
) r
ON CONFLICT DO NOTHING;
