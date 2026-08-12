-- =============================================================================
-- Workforce management foundation: coverage rules, bookings, and richer settings
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM ('scheduled', 'waiting', 'cancelled', 'completed', 'missed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE break_status ADD VALUE IF NOT EXISTS 'scheduled';
ALTER TYPE break_status ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE break_status ADD VALUE IF NOT EXISTS 'overtime';
ALTER TYPE break_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE break_status ADD VALUE IF NOT EXISTS 'auto_ended';

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

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS designation TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS shift TEXT NOT NULL DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS joining_date DATE,
  ADD COLUMN IF NOT EXISTS break_access_blocked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS break_access_block_reason TEXT;

ALTER TABLE public.break_sessions
  DROP CONSTRAINT IF EXISTS break_sessions_completed_fields;

ALTER TABLE public.break_sessions
  ADD CONSTRAINT break_sessions_completed_fields CHECK (
    (
      status IN ('active', 'scheduled')
      AND ended_at IS NULL
    )
    OR (
      status NOT IN ('active', 'scheduled')
      AND ended_at IS NOT NULL
    )
  );

CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '18:00',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employee_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, shift_id, effective_from)
);

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

CREATE TABLE IF NOT EXISTS public.break_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,
  status booking_status NOT NULL DEFAULT 'scheduled',
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  approved_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT break_bookings_end_after_start CHECK (scheduled_end > scheduled_start)
);

CREATE INDEX IF NOT EXISTS idx_break_bookings_employee_id ON public.break_bookings(employee_id);
CREATE INDEX IF NOT EXISTS idx_break_bookings_start ON public.break_bookings(scheduled_start);
CREATE INDEX IF NOT EXISTS idx_break_bookings_status ON public.break_bookings(status);
CREATE INDEX IF NOT EXISTS idx_coverage_rules_department ON public.coverage_rules(department);

INSERT INTO public.departments (name)
SELECT DISTINCT COALESCE(NULLIF(trim(department), ''), 'General')
FROM public.employees
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.coverage_rules (department, minimum_available, max_on_break)
SELECT DISTINCT COALESCE(NULLIF(trim(department), ''), 'General'), 1, NULL
FROM public.employees
ON CONFLICT (department) DO NOTHING;

INSERT INTO public.shifts (name)
VALUES ('General')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coverage_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.break_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS departments_select_authenticated ON public.departments;
CREATE POLICY departments_select_authenticated ON public.departments
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS shifts_select_authenticated ON public.shifts;
CREATE POLICY shifts_select_authenticated ON public.shifts
  FOR SELECT TO authenticated
  USING (true);

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
      WHERE c.id = auth.uid()
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
      WHERE c.id = auth.uid()
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
      WHERE c.id = auth.uid()
        AND c.role = 'admin'
        AND c.is_active = true
    )
  )
  WITH CHECK (
    employee_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM private.employee_claims c
      WHERE c.id = auth.uid()
        AND c.role = 'admin'
        AND c.is_active = true
    )
  );
