-- Employee login picker: only active employees (not admins)
CREATE OR REPLACE FUNCTION public.list_active_employees_for_login()
RETURNS TABLE (
  id UUID,
  employee_id TEXT,
  full_name TEXT,
  department TEXT,
  role user_role
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.employee_id, e.full_name, e.department, e.role
  FROM public.employees e
  WHERE e.is_active = true
    AND e.role = 'employee'
  ORDER BY e.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.list_active_employees_for_login() TO anon, authenticated;
