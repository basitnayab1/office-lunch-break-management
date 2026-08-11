import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function jsonUnauthorized(message = "Unauthorized. Admin access required.") {
  return NextResponse.json({ ok: false, message }, { status: 401 });
}

function jsonForbidden(message = "Forbidden. Admin access required.") {
  return NextResponse.json({ ok: false, message }, { status: 403 });
}

/** True when a Supabase auth session cookie is present (value may still be expired). */
function hasLikelyAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.includes("auth-token") &&
        typeof cookie.value === "string" &&
        cookie.value.length > 20
    );
}

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isEmployeeAuthPage = pathname === "/" || pathname.startsWith("/login");
  const isAdminLogin = pathname === "/admin/login";
  const isAdminPanel = pathname.startsWith("/admin") && !isAdminLogin;
  const isAdminApi =
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/google-sheets");
  const isEmployeeRoute = pathname.startsWith("/dashboard");
  const isApi = pathname.startsWith("/api");
  const isPublicAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    /\.[a-zA-Z0-9]+$/.test(pathname);

  // Fast path: public auth pages with no session cookie skip Auth/DB round-trips.
  if (
    !hasLikelyAuthCookie(request) &&
    (isEmployeeAuthPage || isAdminLogin) &&
    !isApi
  ) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Always validate JWT with Auth server (not cookie presence alone).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isPublicAsset) {
    return supabaseResponse;
  }

  // ---- Admin APIs (/api/admin/*, /api/google-sheets/*): admin role required ----
  if (isAdminApi) {
    if (!user) {
      return jsonUnauthorized();
    }
    const { data: employee } = await supabase
      .from("employees")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (!employee?.is_active) {
      return jsonUnauthorized("Unauthorized. Active session required.");
    }
    if (employee.role !== "admin") {
      return jsonForbidden();
    }
    return supabaseResponse;
  }

  // Other APIs: allow through (each route must authorize itself if sensitive)
  if (isApi) {
    return supabaseResponse;
  }

  // ---- Unauthenticated users ----
  if (!user) {
    if (isAdminPanel) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    if (isEmployeeRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    // /admin/login and employee login remain publicly reachable (no data).
    return supabaseResponse;
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!employee || !employee.is_active) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = isAdminLogin || isAdminPanel ? "/admin/login" : "/";
    return NextResponse.redirect(url);
  }

  if (isEmployeeAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = employee.role === "admin" ? "/admin" : "/dashboard";
    return NextResponse.redirect(url);
  }

  if (isAdminLogin) {
    const url = request.nextUrl.clone();
    url.pathname = employee.role === "admin" ? "/admin" : "/dashboard";
    return NextResponse.redirect(url);
  }

  // ---- Admin panel pages: authenticated + admin role required ----
  if (isAdminPanel) {
    if (employee.role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  return supabaseResponse;
}
