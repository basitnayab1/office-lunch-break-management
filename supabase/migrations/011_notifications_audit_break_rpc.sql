-- =============================================================================
-- Notifications, audit logs, and database-side break-start validation
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE notification_audience AS ENUM ('employee', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE notification_kind AS ENUM (
    'break_10_min_remaining',
    'break_5_min_remaining',
    'break_completed',
    'overtime_warning',
    'booking_reminder',
    'waiting_slot_promoted',
    'admin_overtime_alert',
    'google_sheets_failed',
    'coverage_low',
    'system'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  audience notification_audience NOT NULL DEFAULT 'employee',
  kind notification_kind NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON public.notifications(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_audience_created
  ON public.notifications(audience, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON public.notifications(recipient_id, read_at)
  WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  actor_type TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created
  ON public.audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target
  ON public.audit_logs(target_type, target_id);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select_own_or_admin ON public.notifications;
CREATE POLICY notifications_select_own_or_admin ON public.notifications
  FOR SELECT TO authenticated
  USING (
    recipient_id = auth.uid()
    OR (
      audience = 'admin'
      AND EXISTS (
        SELECT 1
        FROM private.employee_claims c
        WHERE c.id = auth.uid()
          AND c.role = 'admin'
          AND c.is_active = true
      )
    )
  );

DROP POLICY IF EXISTS notifications_update_own_read ON public.notifications;
CREATE POLICY notifications_update_own_read ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

DROP POLICY IF EXISTS audit_logs_select_admin ON public.audit_logs;
CREATE POLICY audit_logs_select_admin ON public.audit_logs
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

CREATE OR REPLACE FUNCTION public.validate_break_start(
  p_employee_id UUID,
  p_break_date DATE,
  p_now TIMESTAMPTZ
)
RETURNS TABLE(ok BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_employee public.employees%ROWTYPE;
  v_settings public.office_settings%ROWTYPE;
  v_daily_count INTEGER;
  v_active_count INTEGER;
  v_department_active INTEGER;
  v_department_total INTEGER;
  v_rule public.coverage_rules%ROWTYPE;
BEGIN
  SELECT * INTO v_employee
  FROM public.employees
  WHERE id = p_employee_id
  FOR UPDATE;

  IF NOT FOUND OR v_employee.is_active IS DISTINCT FROM true THEN
    RETURN QUERY SELECT false, 'This account is inactive. Contact your admin.';
    RETURN;
  END IF;

  IF v_employee.break_access_blocked_until IS NOT NULL
     AND v_employee.break_access_blocked_until > p_now THEN
    RETURN QUERY SELECT false, COALESCE(v_employee.break_access_block_reason, 'Your break access is temporarily blocked.');
    RETURN;
  END IF;

  SELECT * INTO v_settings
  FROM public.office_settings
  WHERE id = 1;

  SELECT count(*) INTO v_daily_count
  FROM public.break_sessions
  WHERE employee_id = p_employee_id
    AND break_date = p_break_date
    AND status <> 'cancelled';

  IF v_daily_count >= COALESCE(v_settings.daily_max_breaks, 3) THEN
    RETURN QUERY SELECT false, format('Daily break limit reached (%s).', COALESCE(v_settings.daily_max_breaks, 3));
    RETURN;
  END IF;

  SELECT count(*) INTO v_active_count
  FROM public.break_sessions
  WHERE status = 'active';

  IF v_active_count >= COALESCE(v_settings.max_simultaneous_breaks, 10) THEN
    RETURN QUERY SELECT false, 'Office break capacity is full right now. Please try again shortly.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_department_active
  FROM public.break_sessions b
  JOIN public.employees e ON e.id = b.employee_id
  WHERE b.status = 'active'
    AND e.department = v_employee.department;

  SELECT count(*) INTO v_department_total
  FROM public.employees
  WHERE role = 'employee'
    AND is_active = true
    AND department = v_employee.department;

  SELECT * INTO v_rule
  FROM public.coverage_rules
  WHERE department = v_employee.department
    AND is_active = true;

  IF FOUND THEN
    IF v_rule.max_on_break IS NOT NULL
       AND v_department_active >= v_rule.max_on_break THEN
      RETURN QUERY SELECT false, format('%s already has %s employee(s) on break. Please try again later.', v_employee.department, v_department_active);
      RETURN;
    END IF;

    IF (v_department_total - v_department_active - 1) < v_rule.minimum_available THEN
      RETURN QUERY SELECT false, format('Your team currently requires at least %s active employee(s). Please try again in a few minutes.', v_rule.minimum_available);
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT true, 'OK';
END;
$$;

REVOKE ALL ON FUNCTION public.validate_break_start(UUID, DATE, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_break_start(UUID, DATE, TIMESTAMPTZ) TO service_role;

