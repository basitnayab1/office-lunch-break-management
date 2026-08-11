-- =============================================================================
-- 008_security_advisor_residual.sql
-- =============================================================================
-- Purpose:
--   Reaffirm the secure configuration for helpers that Security Advisor still
--   flags, WITHOUT breaking employee login or RLS.
--
-- Remaining Advisor items after 007 (expected / intentional):
--   1) list_active_employees_for_login  -> EXECUTE for anon + authenticated
--      Required by the public Name dropdown before login.
--      Returns only id, employee_id, full_name, department, role for active
--      employees. Never email, PIN, or password material.
--   2) is_admin                         -> EXECUTE for authenticated
--   3) is_active_employee               -> EXECUTE for authenticated
--      Required by RLS policies on employees, break_sessions, office_settings.
--      SECURITY DEFINER is required so these helpers can read public.employees
--      without RLS recursion when policies call them.
--   4) Leaked password protection       -> NOT configurable via SQL.
--      Enable in Dashboard (Auth -> Providers -> Email) or:
--      npm run enable-auth-hibp
--
-- This migration:
--   - Keeps SECURITY DEFINER + search_path = public, pg_temp
--   - Keeps required EXECUTE grants
--   - Does NOT revoke EXECUTE from authenticated for RLS helpers
--   - Does NOT revoke EXECUTE from anon for the login picker
--   - Does NOT delete or modify tables/data
--   - Is idempotent (safe to run once after 007)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RLS helpers (SECURITY DEFINER required; authenticated EXECUTE required)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_employee()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees
    WHERE id = auth.uid()
      AND is_active = true
  );
$$;

-- -----------------------------------------------------------------------------
-- Public login picker (SECURITY DEFINER + anon EXECUTE required for Name+PIN UX)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_active_employees_for_login()
RETURNS TABLE (
  id UUID,
  employee_id TEXT,
  full_name TEXT,
  department TEXT,
  role user_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    e.id,
    e.employee_id,
    e.full_name,
    e.department,
    e.role
  FROM public.employees e
  WHERE e.is_active = true
    AND e.role = 'employee'
  ORDER BY e.full_name;
$$;

-- -----------------------------------------------------------------------------
-- Least-privilege EXECUTE (do not tighten further — RLS / login depend on these)
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.is_active_employee() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_employee() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_active_employee() TO authenticated;

REVOKE ALL ON FUNCTION public.list_active_employees_for_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_active_employees_for_login() TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS remains enabled
-- -----------------------------------------------------------------------------

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.break_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON FUNCTION public.is_admin() IS
  'RLS helper (SECURITY DEFINER). Authenticated EXECUTE required by policies. Advisor may flag this intentionally.';

COMMENT ON FUNCTION public.is_active_employee() IS
  'RLS helper (SECURITY DEFINER). Authenticated EXECUTE required by policies. Advisor may flag this intentionally.';

COMMENT ON FUNCTION public.list_active_employees_for_login() IS
  'Public Name dropdown for employee PIN login. anon/authenticated EXECUTE is intentional. No email/PIN exposed.';
