-- App-side hardening. Adds no tables or columns; safe to run repeatedly.

-- 1. Audit trail is append-only: block UPDATE and DELETE on audit_logs.
CREATE OR REPLACE FUNCTION farmtime_audit_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION farmtime_audit_append_only();

-- 2. Row Level Security on every table with no policies. Supabase's public API keys
--    (anon / authenticated) can then read nothing. The Express server connects as the
--    table owner, which bypasses RLS, so the app is unaffected.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['staff','stations','roster','compliance_rules','time_events','break_reasons','breaks',
    'public_holidays','payroll_runs','payroll_summary','exceptions','time_adjustments','audit_logs','leave_requests',
    'users','user_roles','sessions','login_attempts']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
