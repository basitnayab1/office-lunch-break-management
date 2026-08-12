import { NextResponse } from "next/server";
import { runOperationalAutomation } from "@/actions/automation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await runOperationalAutomation();
    return NextResponse.json({ ok: true, summary: result.data });
  } catch (error) {
    console.error("[automation] failed:", error);
    return NextResponse.json(
      { ok: false, message: "Unable to run automation." },
      { status: 500 }
    );
  }
}
