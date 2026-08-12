-- Automation, audit, and PIN-rate-limit support.

ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'suspicious_pin_attempt';

ALTER TABLE public.break_sessions
  ADD COLUMN IF NOT EXISTS google_sheet_sync_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS google_sheet_next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_overtime_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS admin_note TEXT;

CREATE TABLE IF NOT EXISTS public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  identifier TEXT NOT NULL,
  succeeded BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier_created
  ON public.login_attempts(identifier, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_attempts_employee_created
  ON public.login_attempts(employee_id, created_at DESC);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS login_attempts_select_admin ON public.login_attempts;
CREATE POLICY login_attempts_select_admin ON public.login_attempts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM private.employee_claims c
      WHERE c.id = auth.uid()
        AND c.role = 'admin'
        AND c.is_active = true
    )
  );

DROP POLICY IF EXISTS login_attempts_service_insert ON public.login_attempts;
CREATE POLICY login_attempts_service_insert ON public.login_attempts
  FOR INSERT TO service_role
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.login_attempts;
