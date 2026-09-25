import { NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
export async function POST(req: Request) {
  try {
    const { session } = await req.json();
    const email = verifySession(String(session || ""));
    if (!email) return NextResponse.json({ error: "Session expired or invalid. Please log in again." }, { status: 401 });
    return NextResponse.json({ ok: true, email });
  } catch {
    return NextResponse.json({ error: "Session check failed." }, { status: 400 });
  }
}