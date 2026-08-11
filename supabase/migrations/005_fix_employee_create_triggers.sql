-- =============================================================================
-- Harden employee creation with Auth trigger + role guard
-- =============================================================================
-- Root issues addressed:
-- 1) Auth createUser can fail if the profile trigger raises
-- 2) Role-change trigger may miss service_role JWT claim variants
-- =============================================================================

-- Soft-fail profile bootstrap so Auth user creation never aborts
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
  v_employee_id TEXT;
BEGIN
  v_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), ''),
    'User'
  );

  v_employee_id := 'USR-' || UPPER(REPLACE(SUBSTRING(NEW.id::text, 1, 8), '-', ''));

  BEGIN
    INSERT INTO public.employees (
      id,
      employee_id,
      full_name,
      email,
      department,
      allowed_break_minutes,
      role,
      is_active
    ) VALUES (
      NEW.id,
      v_employee_id,
      v_name,
      NEW.email,
      COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'department'), ''), 'General'),
      60,
      'employee',
      true
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_auth_user failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- Recognize service_role from multiple JWT claim sources used by PostgREST
CREATE OR REPLACE FUNCTION public.enforce_role_change_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role TEXT;
  v_db_user TEXT;
  v_claims TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.role = 'employee' THEN
    RETURN NEW;
  END IF;

  v_db_user := current_user;
  v_claims := NULLIF(current_setting('request.jwt.claims', true), '');
  v_jwt_role := COALESCE(
    NULLIF(auth.role(), ''),
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    CASE
      WHEN v_claims IS NOT NULL THEN (v_claims::jsonb ->> 'role')
      ELSE NULL
    END,
    ''
  );

  IF v_db_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin')
     OR v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only admins can assign or change roles'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_role_security ON public.employees;
CREATE TRIGGER trg_employees_role_security
  BEFORE INSERT OR UPDATE OF role
  ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_role_change_security();

-- Ensure authenticated admins (and service role) can manage employees via RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
