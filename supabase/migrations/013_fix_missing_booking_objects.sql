-- =============================================================================
-- 013_fix_missing_booking_objects.sql
-- =============================================================================
-- Safe replacement for a fresh database that never successfully applied
-- 010 / 011 / 012. Do NOT paste 010–012 as-is:
--   * those policies reference private.employee_claims.id (column is user_id)
--   * 010 uses newly added break_status enum values in the same transaction
--
-- This file:
--   * does not DROP tables
--   * does not DELETE rows
--   * does not rewrite break_sessions constraints or existing break records
--   * is idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS)
--
-- Enum safety: new break_status / notification_kind values are ADDed but never
-- referenced as enum literals in this script. validate_break_start compares
-- status::text so it does not require the new values to be committed first.
-- booking_status is CREATE TYPE (new type), so its values are usable here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.booking_status AS ENUM (
    'scheduled',
    'waiting',
    'cancelled',
    'completed',
    'missed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_audience AS ENUM ('employee', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_kind AS ENUM (
    'break_10_min_remaining',
    'break_5_min_remaining',
    'break_completed',
    'overtime_warning',
    'booking_reminder',
    'waiting_slot_promoted',
    'admin_overtime_alert',
    'google_sheets_failed',
    'coverage_low',
    'suspicious_pin_attempt',
    'system'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Existing break_status type: add values only. Do not use them below.
ALTER TYPE public.break_status ADD VALUE IF NOT EXISTS 'scheduled';
ALTER TYPE public.break_status ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE public.break_status ADD VALUE IF NOT EXISTS 'overtime';
ALTER TYPE public.break_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE public.break_status ADD VALUE IF NOT EXISTS 'auto_ended';

-- If notification_kind already existed without this value (partial 012).
ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'suspicious_pin_attempt';

-- -----------------------------------------------------------------------------
-- office_settings columns required by the app (additive)
-- -----------------------------------------------------------------------------
ALTER TABLE public.office_settings
  ADD COLUMN IF NOT EXISTS grace_period_minutes INTEGER NOT NULL DEFAULT 5
    CHECK (grace_period_minutes >= 0 AND grace_period_minutes <= 60),
  ADD COLUMN IF NOT EXISTS daily_max_breaks INTEGER NOT NULL DEFAULT 3
    CHECK (daily_max_breaks > 0 AND daily_max_breaks <= 20),
  ADD COLUMN IF NOT EXISTS min_work_minutes_before_break INTEGER NOT NULL DEFAULT 0
    CHECK (min_work_minutes_before_break >= 0 AND min_work_minutes_before_break <= 720),
  ADD COLUMN IF NOT EXISTS max_simultaneous_breaks INTEGER NOT NULL DEFAULT 10
    CHECK (max_simultaneous_breaks > 0 AND max_simultaneous_breaks <= 500),
  ADD COLUMN IF NOT EXISTS office_start_time TIME NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS office_end_time TIME NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS allow_weekend_breaks BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_end_breaks BOOLEAN NOT NULL DEFAULT false;

-- -----------------------------------------------------------------------------
-- employees columns referenced by validate_break_start (additive)
-- -----------------------------------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS designation TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shift TEXT NOT NULL DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS joining_date DATE,
  ADD COLUMN IF NOT EXISTS break_access_blocked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS break_access_block_reason TEXT;

-- -----------------------------------------------------------------------------
-- coverage_rules
-- No default seed of minimum_available = 1: that would block Start Break
-- for 1-person departments. Empty table means coverage checks are skipped.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coverage_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL,
  minimum_available INTEGER NOT NULL DEFAULT 1 CHECK (minimum_available >= 0),
  max_on_break INTEGER CHECK (max_on_break IS NULL OR max_on_break >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (department)
);

CREATE INDEX IF NOT EXISTS idx_coverage_rules_department
  ON public.coverage_rules(department);

-- -----------------------------------------------------------------------------
-- break_bookings
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.break_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,
  status public.booking_status NOT NULL DEFAULT 'scheduled',
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  approved_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT break_bookings_end_after_start CHECK (scheduled_end > scheduled_start)
);

CREATE INDEX IF NOT EXISTS idx_break_bookings_employee_id
  ON public.break_bookings(employee_id);
CREATE INDEX IF NOT EXISTS idx_break_bookings_start
  ON public.break_bookings(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_break_bookings_status
  ON public.break_bookings(status);

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  audience public.notification_audience NOT NULL DEFAULT 'employee',
  kind public.notification_kind NOT NULL DEFAULT 'system',
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

-- -----------------------------------------------------------------------------
-- audit_logs
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.coverage_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.break_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coverage_rules_select_authenticated ON public.coverage_rules;
CREATE POLICY coverage_rules_select_authenticated ON public.coverage_rules
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS break_bookings_select_own_or_admin ON public.break_bookings;
CREATE POLICY break_bookings_select_own_or_admin ON public.break_bookings
  FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM private.employee_claims c
      WHERE c.user_id = auth.uid()
        AND c.role = 'admin'
        AND c.is_active = true
    )
  );

DROP POLICY IF EXISTS break_bookings_insert_own_or_admin ON public.break_bookings;
CREATE POLICY break_bookings_insert_own_or_admin ON public.break_bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM private.employee_claims c
      WHERE c.user_id = auth.uid()
        AND c.role = 'admin'
        AND c.is_active = true
    )
  );

DROP POLICY IF EXISTS break_bookings_update_own_or_admin ON public.break_bookings;
CREATE POLICY break_bookings_update_own_or_admin ON public.break_bookings
  FOR UPDATE TO authenticated
  USING (
    employee_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM private.employee_claims c
      WHERE c.user_id = auth.uid()
        AND c.role = 'admin'
        AND c.is_active = true
    )
  )
  WITH CHECK (
    employee_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM private.employee_claims c
      WHERE c.user_id = auth.uid()
        AND c.role = 'admin'
        AND c.is_active = true
    )
  );

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
        WHERE c.user_id = auth.uid()
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
      WHERE c.user_id = auth.uid()
        AND c.role = 'admin'
        AND c.is_active = true
    )
  );

-- -----------------------------------------------------------------------------
-- Grants (service_role bypasses RLS; authenticated still needs table privileges)
-- -----------------------------------------------------------------------------
GRANT USAGE ON TYPE public.booking_status TO authenticated, service_role;
GRANT USAGE ON TYPE public.notification_audience TO authenticated, service_role;
GRANT USAGE ON TYPE public.notification_kind TO authenticated, service_role;

GRANT SELECT ON public.coverage_rules TO authenticated;
GRANT ALL ON public.coverage_rules TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.break_bookings TO authenticated;
GRANT ALL ON public.break_bookings TO service_role;

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

-- -----------------------------------------------------------------------------
-- validate_break_start (service_role only). Uses status::text to avoid
-- referencing newly added break_status enum values in this transaction.
-- -----------------------------------------------------------------------------
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
    AND status::text <> 'cancelled';

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

-- -----------------------------------------------------------------------------
-- Realtime (ignore if already members of the publication)
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.break_bookings;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- Reload PostgREST so break_bookings is visible immediately (avoids PGRST205).
NOTIFY pgrst, 'reload schema';
