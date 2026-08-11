import {
  isAuthAccessError,
  requireAdminSession,
} from "@/lib/auth/guards";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/session
 * Confirms the caller has an authenticated admin session.
 * Protected by middleware + requireAdminSession (defense in depth).
 */
export async function GET() {
  try {
    const admin = await requireAdminSession();
    return NextResponse.json({
      ok: true,
      admin: {
        id: admin.id,
        full_name: admin.full_name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    if (isAuthAccessError(error)) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { ok: false, message: "Unable to verify admin session." },
      { status: 500 }
    );
  }
}
